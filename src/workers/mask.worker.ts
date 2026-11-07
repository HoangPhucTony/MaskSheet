/// <reference lib="webworker" />
import * as XLSX from 'xlsx'
import { detectType } from '../lib/detectType'
import { readWorkbook, writeWorkbook, type FileFormat } from '../lib/io'
import { stringifyMapping } from '../lib/mapping'
import { maskWorkbook } from '../lib/masker'
import { columnKey, sheetColumnKey } from '../lib/normalize'
import { cellText, detectHeaderRow, dropSheets, headerChoices, headersOf, readRows, rowsOf } from '../lib/sheet'
import { toWorkerError, type ColumnInfo, type MaskReply, type MaskRequest, type SheetInfo, type WorkbookInfo } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const PREVIEW_ROWS = 5
const SAMPLE_ROWS = 200
const SAMPLE_DISPLAY = 3

// The original file is kept so every "mask" run starts from untouched data. The workbook
// parsed on load is handed to the first run (masking changes it), which saves parsing
// a big file twice.
let source: { buffer: ArrayBuffer; fileName: string; format: FileFormat; parsed: XLSX.WorkBook | null } | null = null

interface Sample {
  texts: string[]
  dates: number
  filled: number
}

/** Job of the request being handled; repeated in every answer. */
let job = 0

function post(msg: MaskReply, transfer: Transferable[] = []) {
  self.postMessage({ ...msg, job }, transfer)
}

function describe(wb: XLSX.WorkBook, fileName: string, format: FileFormat, headerRows: Record<string, number> = {}): WorkbookInfo {
  const sheets: SheetInfo[] = []
  const columns: (ColumnInfo & { _all: Sample })[] = []
  // Cells sampled per header, across sheets. Columns without a header are judged alone.
  const byHeader = new Map<string, Sample>()

  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name]
    const h = headersOf(ws, headerRows[name])
    if (!h) continue
    const rows = rowsOf(ws)
    const keys = h.headers.map((_, i) => sheetColumnKey(name, h.firstCol + i))
    const preview = [h.headers.map((_, i) => cellText(rows[h.headerRow]?.[h.firstCol + i])), ...readRows(wb.Sheets[name], h, 0, PREVIEW_ROWS)]
    sheets.push({
      name,
      rowCount: h.lastRow - h.headerRow,
      firstRow: h.firstRow,
      headerRow: h.headerRow,
      autoHeaderRow: detectHeaderRow(ws),
      headerChoices: headerChoices(ws),
      hidden: !!wb.Workbook?.Sheets?.[wb.SheetNames.indexOf(name)]?.Hidden,
      firstCol: h.firstCol,
      headers: h.headers,
      keys,
      preview,
    })

    h.headers.forEach((header, i) => {
      const c = h.firstCol + i
      const headerKey = columnKey(header, c)
      const groupKey = header ? headerKey : keys[i]
      let all = byHeader.get(groupKey)
      if (!all) {
        all = { texts: [], dates: 0, filled: 0 }
        byHeader.set(groupKey, all)
      }
      const own: string[] = []
      for (let r = h.headerRow + 1; r <= Math.min(h.lastRow, h.headerRow + SAMPLE_ROWS); r++) {
        const cell = rows[r]?.[c]
        const text = cellText(cell)
        if (text.trim() === '') continue
        own.push(text)
        all.texts.push(text)
        all.filled++
        if (cell?.t === 'n' && typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) all.dates++
      }
      columns.push({
        key: keys[i],
        sheet: name,
        header,
        headerKey,
        colIndex: c,
        samples: [...new Set(own)].slice(0, SAMPLE_DISPLAY),
        suggestion: null,
        _all: all,
      })
    })
  }

  const list: ColumnInfo[] = columns.map(({ _all, ...info }) => ({
    ...info,
    suggestion: detectType(info.header, _all.texts, { dateRatio: _all.filled ? _all.dates / _all.filled : 0 }),
  }))
  return { fileName, format, sheets, columns: list }
}

self.onmessage = (e: MessageEvent<MaskRequest>) => {
  const msg = e.data
  job = msg.job
  if (msg.type === 'load') {
    try {
      const { wb, format } = readWorkbook(msg.buffer, msg.fileName)
      const info = describe(wb, msg.fileName, format, msg.headerRows)
      if (info.sheets.length === 0) return post({ type: 'error', code: 'empty', details: [] })
      source = { buffer: msg.buffer, fileName: msg.fileName, format, parsed: wb }
      post({ type: 'loaded', info })
    } catch (err) {
      post(toWorkerError(err, 'read-failed'))
    }
    return
  }

  if (msg.type === 'describe') {
    if (!source) return post({ type: 'error', code: 'empty', details: [] })
    try {
      source.parsed ??= readWorkbook(source.buffer, source.fileName).wb
      post({ type: 'described', info: describe(source.parsed, source.fileName, source.format, msg.headerRows) })
    } catch (err) {
      post(toWorkerError(err))
    }
    return
  }

  if (msg.type === 'rows') {
    if (!source) return post({ type: 'error', code: 'empty', details: [] })
    try {
      // After a mask run the workbook is gone; parse it again and keep it for the next run.
      source.parsed ??= readWorkbook(source.buffer, source.fileName).wb
      const ws = source.parsed.Sheets[msg.sheet]
      const h = ws ? headersOf(ws, msg.headerRow) : null
      post({ type: 'rows', sheet: msg.sheet, start: msg.start, rows: h ? readRows(ws, h, msg.start, msg.count) : [] })
    } catch (err) {
      post(toWorkerError(err))
    }
    return
  }

  if (msg.type === 'mask') {
    if (!source) return post({ type: 'error', code: 'empty', details: [] })
    try {
      const { format } = source
      let wb = source.parsed
      source.parsed = null
      if (!wb) {
        post({ type: 'progress', done: 0, total: 1, phase: 'read' })
        wb = readWorkbook(source.buffer, source.fileName).wb
      }
      dropSheets(wb, msg.skipSheets)
      const result = maskWorkbook(wb, msg.configs, {
        sourceFile: source.fileName,
        outputFormat: format,
        headerRows: msg.headerRows,
        onProgress: (done, total) => post({ type: 'progress', done, total, phase: 'mask' }),
      })
      post({ type: 'progress', done: 0, total: 1, phase: 'write' })
      const bytes = writeWorkbook(wb, format)
      const masked = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const mapping = new TextEncoder().encode(stringifyMapping(result.mapping)).buffer as ArrayBuffer
      post(
        {
          type: 'masked',
          masked,
          format,
          mapping,
          stats: result.stats,
          warnings: result.warnings,
          maskedCells: result.maskedCells,
        },
        [masked, mapping],
      )
    } catch (err) {
      post(toWorkerError(err))
    }
  }
}
