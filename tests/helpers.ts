import * as XLSX from 'xlsx'
import { suggestPrefix } from '../src/lib/detectType'
import { columnKey } from '../src/lib/normalize'
import { cellText, rowsOf } from '../src/lib/sheet'
import type { ColumnConfig, DataType, MoneyMode } from '../src/lib/types'

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
  extra: Partial<ColumnConfig> & { moneyMode?: MoneyMode } = {},
  colIndex = 0,
): ColumnConfig {
  return {
    key: columnKey(header, colIndex),
    header,
    enabled: true,
    type,
    prefix: suggestPrefix(type, header, colIndex),
    moneyMode: 'code',
    ...extra,
  }
}

export const opts = { sourceFile: 'test.xlsx', outputFormat: 'xlsx' as const, random: () => 0.75 }
