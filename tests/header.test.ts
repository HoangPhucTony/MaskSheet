import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../src/lib/io'
import { parseMapping } from '../src/lib/mapping'
import { maskWorkbook } from '../src/lib/masker'
import { detectHeaderRow, headerChoices, headersOf } from '../src/lib/sheet'
import { makeTemplate, parseTemplate, TemplateError } from '../src/lib/template'
import { unmaskWorkbook } from '../src/lib/unmasker'
import { book, colIn, opts, texts, values } from './helpers'

/** A typical Vietnamese report: a merged title row, an empty row, then the table. */
function report(): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet([
    ['BÁO CÁO KHÁCH HÀNG THÁNG 11', null, null],
    [],
    ['Họ tên', 'SĐT', 'Doanh thu'],
    ['An', '0912345678', 1000],
    ['Bình', '0987654321', 2000],
  ])
  ws['!merges'] = [XLSX.utils.decode_range('A1:C1')]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'S')
  return readWorkbook(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer), 'r.xlsx').wb
}

/** A sheet whose first row (2 cells) looks like a header to the detector, but is not. */
function tricky() {
  return book({
    S: [
      ['Kỳ báo cáo:', 'Tháng 11'],
      ['Họ tên', 'Ghi chú', 'Doanh thu'],
      ['An', 'x', 1000],
      ['Bình', 'y', 2000],
    ],
  })
}

describe('header row detection', () => {
  it('skips a title row and empty rows above the table', () => {
    const wb = report()
    expect(detectHeaderRow(wb.Sheets.S)).toBe(2)
    expect(headersOf(wb.Sheets.S)!.headers).toEqual(['Họ tên', 'SĐT', 'Doanh thu'])
  })

  it('takes the first row of an ordinary table', () => {
    expect(detectHeaderRow(book({ S: [['Tên', 'SĐT'], ['An', '0912345678']] }).Sheets.S)).toBe(0)
    expect(detectHeaderRow(book({ S: [['Tên'], ['An'], ['Bình']] }).Sheets.S)).toBe(0)
  })

  it('takes the lower row of a two-row header with merged groups', () => {
    const wb = book({
      S: [
        ['Khách hàng', null, 'Doanh số', null],
        ['Tên', 'SĐT', 'T10', 'T11'],
        ['An', '0912345678', 1, 2],
      ],
    })
    expect(detectHeaderRow(wb.Sheets.S)).toBe(1)
  })

  it('uses a chosen header row, and ignores one outside the table', () => {
    const ws = tricky().Sheets.S
    expect(headersOf(ws)!.headerRow).toBe(0)
    expect(headersOf(ws, 1)!.headers).toEqual(['Họ tên', 'Ghi chú', 'Doanh thu'])
    expect(headersOf(ws, 1)!.firstRow).toBe(0)
    expect(headersOf(ws, 99)!.headerRow).toBe(0)
    expect(headersOf(ws, -1)!.headerRow).toBe(0)
  })

  it('lists the first rows as choices, with a few of their values', () => {
    const choices = headerChoices(report().Sheets.S)
    expect(choices.map((c) => c.row)).toEqual([0, 1, 2, 3, 4])
    expect(choices[0].label).toBe('BÁO CÁO KHÁCH HÀNG THÁNG 11')
    expect(choices[1].label).toBe('')
    expect(choices[2].label).toBe('Họ tên · SĐT · Doanh thu')
  })
})

describe('masking below the chosen header row', () => {
  it('leaves the title and the header alone, masks the data', () => {
    const wb = report()
    const { mapping } = maskWorkbook(wb, [colIn('S', 0, 'Họ tên', 'name')], opts)
    expect(texts(wb).map((r) => r[0] ?? '')).toEqual(['BÁO CÁO KHÁCH HÀNG THÁNG 11', '', 'Họ tên', 'NAME_0001', 'NAME_0002'])
    expect(mapping.headerRows).toEqual({ S: 2 })
  })

  it('follows a header row chosen by the user, through masking and restoring', () => {
    const wb = tricky()
    const { mapping } = maskWorkbook(
      wb,
      [colIn('S', 0, 'Họ tên', 'name'), colIn('S', 2, 'Doanh thu', 'money')],
      { ...opts, headerRows: { S: 1 } },
    )
    expect(texts(wb).slice(0, 3).map((r) => r[0])).toEqual(['Kỳ báo cáo:', 'Họ tên', 'NAME_0001'])
    expect(values(wb)[2][2]).not.toBe(1000)

    const masked = readWorkbook(writeWorkbook(wb, 'xlsx'), 'm.xlsx').wb
    unmaskWorkbook(masked, parseMapping(JSON.stringify(mapping)))
    expect(values(masked).map((r) => r[0])).toEqual(['Kỳ báo cáo:', 'Họ tên', 'An', 'Bình'])
    expect(values(masked).slice(2).map((r) => r[2])).toEqual([1000, 2000])
  })

  it('restores codes the AI wrote above the header too', () => {
    const wb = report()
    const { mapping } = maskWorkbook(wb, [colIn('S', 0, 'Họ tên', 'name')], opts)
    const result = book({ 'Tóm tắt': [['Khách mua nhiều nhất: NAME_0002'], [], ['Họ tên', 'Tổng'], ['NAME_0001', 5]] })
    unmaskWorkbook(result, mapping)
    expect(texts(result, 'Tóm tắt').map((r) => r[0] ?? '')).toEqual(['Khách mua nhiều nhất: Bình', '', 'Họ tên', 'An'])
  })

  it('rejects a mapping with malformed header rows', () => {
    const { mapping } = maskWorkbook(report(), [colIn('S', 0, 'Họ tên', 'name')], opts)
    expect(() => parseMapping(JSON.stringify({ ...mapping, headerRows: { S: 'x' } }))).toThrow()
    expect(() => parseMapping(JSON.stringify({ ...mapping, headerRows: [2] }))).toThrow()
  })
})

describe('templates remember header rows the user changed', () => {
  it('keeps them through a JSON round trip and validates them', () => {
    const tpl = makeTemplate('T', 'a.xlsx', [colIn('S', 0, 'Họ tên', 'name')], undefined, new Date(0), { S: 3 })
    expect(parseTemplate(JSON.stringify(tpl)).headerRows).toEqual({ S: 3 })
    expect(makeTemplate('T', 'a.xlsx', [], undefined).headerRows).toBeUndefined()
    expect(() => parseTemplate(JSON.stringify({ ...tpl, headerRows: { S: -1 } }))).toThrow(TemplateError)
  })
})
