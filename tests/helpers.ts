import * as XLSX from 'xlsx'
import { suggestPrefix } from '../src/lib/detectType'
import { maskWorkbook as maskWorkbookExact, type MaskOptions } from '../src/lib/masker'
import { columnKey, sheetColumnKey } from '../src/lib/normalize'
import { cellText, headersOf, rowsOf } from '../src/lib/sheet'
import { METHODS, type ColumnConfig, type DataType } from '../src/lib/types'

export function book(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { dense: true }), name)
  }
  return wb
}

export function texts(wb: XLSX.WorkBook, sheet = wb.SheetNames[0]): string[][] {
  return rowsOf(wb.Sheets[sheet]).map((row) => (row ?? []).map((c) => cellText(c)))
}

export function values(wb: XLSX.WorkBook, sheet = wb.SheetNames[0]): unknown[][] {
  return rowsOf(wb.Sheets[sheet]).map((row) => (row ?? []).map((c) => c?.v))
}

export function col(
  header: string,
  type: DataType = 'custom',
  extra: Partial<ColumnConfig> = {},
  colIndex = 0,
): ColumnConfig {
  return {
    key: columnKey(header, colIndex),
    sheet: '',
    col: colIndex,
    header,
    enabled: true,
    type,
    prefix: suggestPrefix(type, header, colIndex),
    method: METHODS[type][0],
    ...extra,
  }
}

/** Pick a column in one sheet, the way the app does. */
export function colIn(sheet: string, colIndex: number, header: string, type: DataType = 'custom', extra: Partial<ColumnConfig> = {}): ColumnConfig {
  return { ...col(header, type, extra, colIndex), key: sheetColumnKey(sheet, colIndex), sheet }
}

/** Apply configs made with `col` to every column with that header, in every sheet. */
export function inEverySheet(wb: XLSX.WorkBook, configs: ColumnConfig[]): ColumnConfig[] {
  const byHeader = new Map(configs.map((c) => [c.key, c]))
  return wb.SheetNames.flatMap((sheet) => {
    const h = headersOf(wb.Sheets[sheet])
    if (!h) return []
    return h.headers.flatMap((header, i) => {
      const c = h.firstCol + i
      const config = byHeader.get(columnKey(header, c))
      return config ? [{ ...config, header, key: sheetColumnKey(sheet, c), sheet, col: c }] : []
    })
  })
}

/** maskWorkbook for tests that select by header. */
export function maskWorkbook(wb: XLSX.WorkBook, configs: ColumnConfig[], options: MaskOptions) {
  return maskWorkbookExact(wb, inEverySheet(wb, configs), options)
}

export const opts = { sourceFile: 'test.xlsx', outputFormat: 'xlsx' as const, random: () => 0.75 }
