/// <reference lib="webworker" />
import * as XLSX from 'xlsx'
import { detectType } from '../lib/detectType'
import { readWorkbook, writeWorkbook, type FileFormat } from '../lib/io'
import { stringifyMapping } from '../lib/mapping'
import { maskWorkbook } from '../lib/masker'
import { columnKey } from '../lib/normalize'
import { cellText, dropSheets, headersOf, rowsOf } from '../lib/sheet'
import { toWorkerError, type ColumnInfo, type MaskRequest, type MaskResponse, type SheetInfo, type WorkbookInfo } from './protocol'

declare const self: DedicatedWorkerGlobalScope

const PREVIEW_ROWS = 5
const SAMPLE_ROWS = 200
const SAMPLE_DISPLAY = 3

// The original file is kept so every "mask" run starts from untouched data. The workbook
// parsed on load is handed to the first run (masking changes it), which saves parsing
// a big file twice.
let source: { buffer: ArrayBuffer; fileName: string; format: FileFormat; parsed: XLSX.WorkBook | null } | null = null

function post(msg: MaskResponse, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer)
}

function describe(wb: XLSX.WorkBook, fileName: string, format: FileFormat): WorkbookInfo {
  const sheets: SheetInfo[] = []
  const columns = new Map<string, ColumnInfo & { _all: string[]; _numeric: number; _dates: number; _filled: number }>()

  for (const name of wb.SheetNames) {
    const h = headersOf(wb.Sheets[name])
    if (!h) continue
    const rows = rowsOf(wb.Sheets[name])
    const keys = h.headers.map((header, i) => columnKey(header, h.firstCol + i))
    const preview: string[][] = []
    for (let r = h.headerRow; r <= Math.min(h.lastRow, h.headerRow + PREVIEW_ROWS); r++) {
      const row = rows[r] ?? []
      preview.push(h.headers.map((_, i) => cellText(row[h.firstCol + i])))
    }
    sheets.push({ name, rowCount: h.lastRow - h.headerRow, firstCol: h.firstCol, headers: h.headers, keys, preview })

    h.headers.forEach((header, i) => {
      const c = h.firstCol + i
      let info = columns.get(keys[i])
      if (!info) {
        info = { key: keys[i], header, colIndex: c, sheets: [], samples: [], suggestion: null, numericRatio: 0, _all: [], _numeric: 0, _dates: 0, _filled: 0 }
        columns.set(keys[i], info)
      }
      info.sheets.push(name)
      for (let r = h.headerRow + 1; r <= Math.min(h.lastRow, h.headerRow + SAMPLE_ROWS); r++) {
        const cell = rows[r]?.[c]
        const text = cellText(cell)
        if (text.trim() === '') continue
        info._all.push(text)
        info._filled++
        if (cell?.t === 'n') {
          info._numeric++
          if (typeof cell.z === 'string' && XLSX.SSF.is_date(cell.z)) info._dates++
        }
      }
    })
  }

  const list: ColumnInfo[] = []
  for (const { _all, _numeric, _dates, _filled, ...info } of columns.values()) {
    info.samples = [...new Set(_all)].slice(0, SAMPLE_DISPLAY)
    info.numericRatio = _filled ? _numeric / _filled : 0
    info.suggestion = detectType(info.header, _all, { dateRatio: _filled ? _dates / _filled : 0 })
    list.push(info)
  }
  return { fileName, format, sheets, columns: list }
}

self.onmessage = (e: MessageEvent<MaskRequest>) => {
  const msg = e.data
  if (msg.type === 'load') {
    try {
      const { wb, format } = readWorkbook(msg.buffer, msg.fileName)
      const info = describe(wb, msg.fileName, format)
      if (info.sheets.length === 0) return post({ type: 'error', code: 'empty', details: [] })
      source = { buffer: msg.buffer, fileName: msg.fileName, format, parsed: wb }
      post({ type: 'loaded', info })
    } catch (err) {
      post(toWorkerError(err, 'read-failed'))
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
