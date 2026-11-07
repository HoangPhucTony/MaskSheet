import { strFromU8, unzipSync } from 'fflate'
import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../src/lib/io'
import { maskWorkbook } from '../src/lib/masker'
import { parseNumber } from '../src/lib/money'
import { unmaskWorkbook } from '../src/lib/unmasker'
import { book, colIn, opts, texts, values } from './helpers'

describe('numbers with a leading zero are identifiers, not amounts', () => {
  it('are not parsed as numbers', () => {
    expect(parseNumber('0912345678')).toBeNull()
    expect(parseNumber('007')).toBeNull()
    expect(parseNumber('012,345')).toBeNull()
    expect(parseNumber('0')).toBe(0)
    expect(parseNumber('0.5')).toBe(0.5)
    expect(parseNumber('0,5')).toBe(0.5)
    expect(parseNumber('-0.25')).toBe(-0.25)
    expect(parseNumber('1.234.567,89')).toBe(1234567.89)
  })

  it('are left as they are, with a warning, when a phone column is masked as an amount', () => {
    const wb = book({ S: [['SĐT'], ['0912345678'], ['0987654321']] })
    const { mapping, warnings } = maskWorkbook(wb, [colIn('S', 0, 'SĐT', 'money')], opts)
    expect(texts(wb).map((r) => r[0])).toEqual(['SĐT', '0912345678', '0987654321'])
    expect(warnings).toEqual([{ kind: 'skipped', sheet: 'S', header: 'SĐT', count: 2, detail: 'number' }])
    unmaskWorkbook(wb, mapping)
    expect(texts(wb).map((r) => r[0])).toEqual(['SĐT', '0912345678', '0987654321'])
  })
})

describe('Excel error cells', () => {
  it('are not masked, so they come back unchanged', () => {
    const wb = book({ S: [['Mã'], ['KH01'], ['KH02']] })
    wb.Sheets.S['!data']![2][0] = { t: 'e', v: 0x2a, w: '#N/A' }
    const { mapping } = maskWorkbook(wb, [colIn('S', 0, 'Mã', 'custom', { prefix: 'KH' })], opts)
    expect(texts(wb).map((r) => r[0])).toEqual(['Mã', 'KH_0001', '#N/A'])
    unmaskWorkbook(wb, mapping)
    expect(wb.Sheets.S['!data']![2][0]).toMatchObject({ t: 'e', w: '#N/A' })
    expect(values(wb)[1][0]).toBe('KH01')
  })
})

describe('files exported from Google Sheets', () => {
  /** What Google Sheets writes for its own functions: a formula Excel cannot run, plus the value it computed. */
  function gsheetExport(): Uint8Array {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Họ tên', 'Doanh thu', 'Lọc', 'Nguồn', 'Tổng'],
      ['An', 1000, 0, 0, 0],
      ['Bình', 2000, 0, 0, 0],
    ])
    ws.A3 = { t: 's', v: 'Bình', f: 'IFERROR(__xludf.DUMMYFUNCTION("VLOOKUP(""x"",Data!A:B,2)"),"Bình")' }
    ws.C2 = { t: 'n', v: 1000, f: 'IFERROR(__xludf.DUMMYFUNCTION("FILTER(B2:B3,B2:B3>0)"),1000)', F: 'C2:C3' }
    ws.C3 = { t: 'n', v: 2000 }
    ws.D2 = { t: 'e', v: 0x17, w: '#REF!', f: 'IMPORTRANGE("abc","Sheet1!A1")' }
    ws.D3 = { t: 'e', v: 0x1d, w: '#NAME?', f: 'GOOGLEFINANCE("VNM")' }
    ws.E2 = { t: 'n', f: 'SUM(B2:B3)' } as XLSX.CellObject // formula without a stored value
    delete ws.E3
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Data')
    return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
  }

  it('mask without errors, keep the computed values and drop the formulas', () => {
    const { wb } = readWorkbook(gsheetExport(), 'gs.xlsx')
    const { mapping } = maskWorkbook(
      wb,
      [colIn('Data', 0, 'Họ tên', 'name'), colIn('Data', 1, 'Doanh thu', 'money', { method: 'round' }), colIn('Data', 2, 'Lọc', 'money')],
      opts,
    )
    const out = writeWorkbook(wb, 'xlsx')
    const xml = strFromU8(unzipSync(out)['xl/worksheets/sheet1.xml'])
    expect(xml).not.toContain('<f')
    const masked = readWorkbook(out, 'm.xlsx').wb
    expect(texts(masked)[0]).toEqual(['Họ tên', 'Doanh thu', 'Lọc', 'Nguồn', 'Tổng'])
    expect(texts(masked).map((r) => r[0])).toEqual(['Họ tên', 'NAME_0001', 'NAME_0002'])
    expect(texts(masked).map((r) => r[3])).toEqual(['Nguồn', '#REF!', '#NAME?'])

    unmaskWorkbook(masked, mapping)
    expect(values(masked).map((r) => r[0])).toEqual(['Họ tên', 'An', 'Bình'])
    expect(values(masked).slice(1).map((r) => r[2])).toEqual([1000, 2000])
  })
})

describe('fake values', () => {
  it('never equal a real value found elsewhere in the file, so restoring cannot overwrite it', () => {
    const names = [['Họ tên'], ['An'], ['Bình']]
    const first = book({ X: names })
    const fakes = maskWorkbook(first, [colIn('X', 0, 'Họ tên', 'name', { method: 'fake' })], opts).mapping.dictionaries.FAKE_NAME.fakes!

    // Same data and same randomness, plus a sheet left as is that holds the first fake value as a real name.
    const wb = book({ X: names, Y: [['Họ tên'], [fakes[0]]] })
    const { mapping } = maskWorkbook(wb, [colIn('X', 0, 'Họ tên', 'name', { method: 'fake' })], opts)
    expect(mapping.dictionaries.FAKE_NAME.fakes).not.toContain(fakes[0])

    unmaskWorkbook(wb, mapping)
    expect(texts(wb, 'X').map((r) => r[0])).toEqual(['Họ tên', 'An', 'Bình'])
    expect(texts(wb, 'Y').map((r) => r[0])).toEqual(['Họ tên', fakes[0]])
  })
})
