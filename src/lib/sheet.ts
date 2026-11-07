import * as XLSX from 'xlsx'
import { parseNumber } from './money'
import type { StoredValue } from './types'

export type Cell = XLSX.CellObject
export type Row = (Cell | undefined)[]

/** Rows of a dense worksheet (read with `{ dense: true }`). */
export function rowsOf(ws: XLSX.WorkSheet): Row[] {
  const data = (ws as XLSX.DenseWorkSheet)['!data']
  if (!data) throw new Error('Worksheet is not dense')
  return data as Row[]
}

export function rangeOf(ws: XLSX.WorkSheet): XLSX.Range | null {
  const ref = ws['!ref']
  return ref ? XLSX.utils.decode_range(ref) : null
}

/** Text of a cell as the user sees it in Excel; '' for empty cells. */
export function cellText(cell: Cell | undefined): string {
  if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return ''
  if (cell.w !== undefined) return cell.w
  if (cell.v instanceof Date) return cell.v.toISOString()
  return String(cell.v)
}

export function isEmptyCell(cell: Cell | undefined): boolean {
  return cellText(cell).trim() === ''
}

/**
 * Shrink a sheet's range to the cells that hold a value, on every side. Some files declare
 * a range far larger than their data (e.g. A1:XFD1048576), which would otherwise mean
 * scanning a million rows and showing 16,384 columns; others declare A1 while the table
 * starts lower down, which would make an empty row the header row.
 */
export function trimRange(ws: XLSX.WorkSheet): void {
  const range = rangeOf(ws)
  if (!range) return
  const rows = rowsOf(ws)
  let firstRow = -1
  let lastRow = -1
  let firstCol = Infinity
  let lastCol = -1
  for (let r = range.s.r; r <= Math.min(range.e.r, rows.length - 1); r++) {
    const row = rows[r]
    if (!row) continue
    const end = Math.min(range.e.c, row.length - 1)
    let c = range.s.c
    while (c <= end && isEmptyCell(row[c])) c++
    if (c > end) continue
    if (firstRow < 0) firstRow = r
    lastRow = r
    if (c < firstCol) firstCol = c
    let e = end
    while (isEmptyCell(row[e])) e--
    if (e > lastCol) lastCol = e
  }
  if (lastRow < 0) {
    delete ws['!ref']
    return
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: firstRow, c: firstCol }, e: { r: lastRow, c: lastCol } })
  fillRows(ws)
}

/**
 * Give every row of the range an array. SheetJS leaves empty rows out of dense sheets
 * but its writer expects them, and crashes with "reading '0'" on a blank row.
 */
export function fillRows(ws: XLSX.WorkSheet): void {
  const range = rangeOf(ws)
  if (!range) return
  const rows = rowsOf(ws)
  for (let r = range.s.r; r <= range.e.r; r++) if (!rows[r]) rows[r] = []
}

/** Remove sheets from a workbook, keeping the per-sheet metadata aligned. */
export function dropSheets(wb: XLSX.WorkBook, names: string[]): void {
  const drop = new Set(names)
  const keep = wb.SheetNames.map((name) => !drop.has(name))
  if (wb.Workbook?.Sheets) wb.Workbook.Sheets = wb.Workbook.Sheets.filter((_, i) => keep[i])
  for (const name of drop) delete wb.Sheets[name]
  wb.SheetNames = wb.SheetNames.filter((_, i) => keep[i])
}

export interface SheetHeaders {
  /** First row of the used range; rows above the header (titles...) start here. */
  firstRow: number
  /** Index of the header row. Data starts on the next row. */
  headerRow: number
  firstCol: number
  lastCol: number
  lastRow: number
  /** headers[c - firstCol] is the header text of column c. */
  headers: string[]
}

/** Rows looked at when guessing the header row, and offered when choosing it. */
export const HEADER_SCAN_ROWS = 30

function filledCount(row: Row | undefined, range: XLSX.Range): number {
  let n = 0
  if (row) for (let c = range.s.c; c <= range.e.c; c++) if (!isEmptyCell(row[c])) n++
  return n
}

/**
 * Guess the header row: the first row filled at least 60% as much as the fullest of the
 * first rows. This skips report titles (often one merged cell), empty rows, and the group
 * row of a two-row header ("Customer | Sales" above "Name | Phone | Oct | Nov").
 */
export function detectHeaderRow(ws: XLSX.WorkSheet): number {
  const range = rangeOf(ws)
  if (!range) return 0
  const rows = rowsOf(ws)
  const filled: number[] = []
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + HEADER_SCAN_ROWS - 1); r++) filled.push(filledCount(rows[r], range))
  const max = Math.max(...filled)
  const need = max >= 2 ? Math.max(2, Math.ceil(max * 0.6)) : 1
  return range.s.r + Math.max(0, filled.findIndex((n) => n >= need))
}

/** Rows that can be chosen as the header row, with a few of their values for display. */
export function headerChoices(ws: XLSX.WorkSheet): { row: number; label: string }[] {
  const range = rangeOf(ws)
  if (!range) return []
  const rows = rowsOf(ws)
  const out: { row: number; label: string }[] = []
  for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + HEADER_SCAN_ROWS - 1); r++) {
    const texts: string[] = []
    for (let c = range.s.c; c <= range.e.c && texts.length < 3; c++) {
      const text = cellText(rows[r]?.[c]).trim()
      if (text) texts.push(text.length > 32 ? text.slice(0, 31) + '…' : text)
    }
    out.push({ row: r, label: texts.join(' · ') })
  }
  return out
}

/**
 * Headers of a sheet, read from `headerRow` when it lies inside the used range, otherwise
 * from the detected header row (see `detectHeaderRow`).
 */
export function headersOf(ws: XLSX.WorkSheet, headerRow?: number): SheetHeaders | null {
  const range = rangeOf(ws)
  if (!range) return null
  const rows = rowsOf(ws)
  const hr =
    headerRow !== undefined && Number.isInteger(headerRow) && headerRow >= range.s.r && headerRow <= range.e.r ? headerRow : detectHeaderRow(ws)
  const row = rows[hr] ?? []
  const headers: string[] = []
  for (let c = range.s.c; c <= range.e.c; c++) headers.push(cellText(row[c]).trim())
  return { firstRow: range.s.r, headerRow: hr, firstCol: range.s.c, lastCol: range.e.c, lastRow: range.e.r, headers }
}

/** `count` data rows from data row `start` (0 = first row below the headers), as display text. */
export function readRows(ws: XLSX.WorkSheet, h: SheetHeaders, start: number, count: number): string[][] {
  const rows = rowsOf(ws)
  const out: string[][] = []
  const first = h.headerRow + 1 + start
  for (let r = first; r <= Math.min(h.lastRow, first + count - 1); r++) {
    const row = rows[r] ?? []
    out.push(h.headers.map((_, i) => cellText(row[h.firstCol + i])))
  }
  return out
}

/** Capture a cell so it can be written back exactly later. */
export function toStored(cell: Cell): StoredValue {
  const w = cellText(cell)
  if (cell.v instanceof Date) return { t: 'd', v: cell.v.toISOString(), z: cell.z as string | undefined, w }
  const t = cell.t === 'n' || cell.t === 'b' || cell.t === 'd' ? cell.t : 's'
  const v = t === 's' ? String(cell.v) : (cell.v as number | boolean)
  const stored: StoredValue = { t, v, w }
  if (typeof cell.z === 'string') stored.z = cell.z
  return stored
}

export function fromStored(s: StoredValue): Cell {
  const cell: Cell = { t: s.t, v: s.t === 'd' ? new Date(s.v as string) : s.v, w: s.w }
  if (s.z) cell.z = s.z
  return cell
}

/** A plain string cell. */
export function textCell(text: string): Cell {
  return { t: 's', v: text, w: text }
}

/** A number cell, keeping an existing number format if any. */
export function numberCell(value: number, z?: string | number): Cell {
  const cell: Cell = { t: 'n', v: value }
  if (z !== undefined && z !== 'General') {
    cell.z = z
    try {
      cell.w = XLSX.SSF.format(z, value)
    } catch {
      cell.w = String(value)
    }
  } else {
    cell.w = String(value)
  }
  return cell
}

/**
 * Read a number from a cell. Numeric cells are used as is; text is accepted in the
 * common forms "1234.5", "1,234,567.89" and Vietnamese "1.234.567,89".
 */
export function cellNumber(cell: Cell | undefined): number | null {
  if (!cell) return null
  if (cell.t === 'n' && typeof cell.v === 'number') return cell.v
  if (cell.t !== 's' || typeof cell.v !== 'string') return null
  return parseNumber(cell.v)
}

/**
 * Remove things from a workbook that can leak data outside the cell values we mask:
 * formulas (cached values are kept), comments, hyperlinks, defined names and document
 * properties (author, company...).
 */
export function stripWorkbook(wb: XLSX.WorkBook): void {
  wb.Props = {}
  delete (wb as { Custprops?: unknown }).Custprops
  if (wb.Workbook) delete wb.Workbook.Names
  for (const name of wb.SheetNames) {
    for (const row of rowsOf(wb.Sheets[name])) {
      if (!row) continue
      for (const cell of row) {
        if (!cell) continue
        delete cell.f
        delete cell.F
        delete cell.c
        delete cell.l
      }
    }
  }
}
