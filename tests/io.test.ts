import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../src/lib/io'
import { maskWorkbook } from '../src/lib/masker'
import { headersOf } from '../src/lib/sheet'
import { unmaskWorkbook } from '../src/lib/unmasker'
import { colIn, opts, texts } from './helpers'

/** Bytes of an .xlsx file written by SheetJS from rows (not dense, like most real files once read). */
function xlsx(sheets: Record<string, unknown[][]>, origin = 'A1'): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, aoa] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet([])
    XLSX.utils.sheet_add_aoa(ws, aoa, { origin })
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

describe('files with empty rows', () => {
  const file = () => xlsx({ S: [['Tên', 'SĐT'], ['An', '0912345678'], [], [], ['Bình', '0987654321']] })

  it('can be written again after reading (blank rows used to crash the writer)', () => {
    const { wb } = readWorkbook(file(), 'a.xlsx')
    expect(() => writeWorkbook(wb, 'xlsx')).not.toThrow()
  })

  it('mask and restore, keeping the empty rows', () => {
    const { wb } = readWorkbook(file(), 'a.xlsx')
    const { mapping } = maskWorkbook(wb, [colIn('S', 0, 'Tên', 'name')], opts)
    const masked = readWorkbook(writeWorkbook(wb, 'xlsx'), 'm.xlsx').wb
    expect(texts(masked).map((r) => r[0] ?? '')).toEqual(['Tên', 'NAME_0001', '', '', 'NAME_0002'])
    unmaskWorkbook(masked, mapping)
    expect(texts(readWorkbook(writeWorkbook(masked, 'xlsx'), 'r.xlsx').wb).map((r) => r[0] ?? '')).toEqual(['Tên', 'An', '', '', 'Bình'])
  })
})

describe('tables that do not start at A1', () => {
  it('takes the first row and column that hold data as the header, even if the declared range starts at A1', () => {
    const { wb } = readWorkbook(xlsx({ S: [['Tên', 'SĐT'], ['An', '0912345678']] }, 'C3'), 'a.xlsx')
    const h = headersOf(wb.Sheets.S)!
    expect(h.headers).toEqual(['Tên', 'SĐT'])
    expect(h.headerRow).toBe(2)
    expect(h.firstCol).toBe(2)
    expect(h.lastRow).toBe(3)
  })

  it('masks and writes such a table', () => {
    const { wb } = readWorkbook(xlsx({ S: [['Tên', 'SĐT'], ['An', '0912345678']] }, 'C3'), 'a.xlsx')
    maskWorkbook(wb, [colIn('S', 2, 'Tên', 'name')], opts)
    const masked = readWorkbook(writeWorkbook(wb, 'xlsx'), 'm.xlsx').wb
    const h = headersOf(masked.Sheets.S)!
    expect(h.headers).toEqual(['Tên', 'SĐT'])
    expect(texts(masked)[3].slice(2)).toEqual(['NAME_0001', '0912345678'])
  })
})
