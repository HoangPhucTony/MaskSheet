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

export interface SheetHeaders {
  /** Index of the header row (first row of the used range). */
  headerRow: number
  firstCol: number
  lastCol: number
  lastRow: number
  /** headers[c - firstCol] is the header text of column c. */
  headers: string[]
}

export function headersOf(ws: XLSX.WorkSheet): SheetHeaders | null {
  const range = rangeOf(ws)
  if (!range) return null
  const rows = rowsOf(ws)
  const headerRow = range.s.r
  const row = rows[headerRow] ?? []
  const headers: string[] = []
  for (let c = range.s.c; c <= range.e.c; c++) headers.push(cellText(row[c]).trim())
  return { headerRow, firstCol: range.s.c, lastCol: range.e.c, lastRow: range.e.r, headers }
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
