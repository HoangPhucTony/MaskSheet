import { describe, expect, it } from 'vitest'
import { readWorkbook, writeWorkbook } from '../src/lib/io'
import { parseMapping } from '../src/lib/mapping'
import { maskWorkbook } from '../src/lib/masker'
import { headersOf, readRows } from '../src/lib/sheet'
import { unmaskWorkbook } from '../src/lib/unmasker'
import { book, colIn, opts, texts, values } from './helpers'

const seeded = () => {
  let s = 12345
  return () => (s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
}

describe('columns are chosen per sheet', () => {
  it('masks a column only in the sheet it was selected in', () => {
    const wb = book({
      X: [['Họ tên'], ['An'], ['Bình']],
      Y: [['Họ tên'], ['An'], ['Cường']],
    })
    maskWorkbook(wb, [colIn('X', 0, 'Họ tên', 'name')], opts)
    expect(texts(wb, 'X').map((r) => r[0])).toEqual(['Họ tên', 'NAME_0001', 'NAME_0002'])
    expect(texts(wb, 'Y').map((r) => r[0])).toEqual(['Họ tên', 'An', 'Cường'])
  })

  it('masks each column of a sheet separately when two share a header', () => {
    const wb = book({ X: [['Ghi chú', 'Ghi chú'], ['a', 'b']] })
    maskWorkbook(wb, [colIn('X', 1, 'Ghi chú', 'custom', { prefix: 'NOTE' })], opts)
    expect(texts(wb, 'X')[1]).toEqual(['a', 'NOTE_0001'])
  })

  it('still gives equal values equal codes when both sheets are selected, wherever the column is', () => {
    const wb = book({
      X: [['Mã NV'], ['NV01'], ['NV02']],
      Y: [['#', 'Mã NV'], [1, 'NV02']],
    })
    maskWorkbook(
      wb,
      [colIn('X', 0, 'Mã NV', 'custom', { prefix: 'NV' }), colIn('Y', 1, 'Mã NV', 'custom', { prefix: 'NV' })],
      opts,
    )
    expect(texts(wb, 'X')[2][0]).toBe('NV_0002')
    expect(texts(wb, 'Y')[1][1]).toBe('NV_0002')
  })

  it('warns when a column with the same header was left unmasked in another sheet', () => {
    const wb = book({
      X: [['Họ tên'], ['An']],
      Y: [['Họ tên'], ['An'], ['Bình'], [null]],
      Z: [['Khác'], ['x']],
    })
    const { warnings } = maskWorkbook(wb, [colIn('X', 0, 'Họ tên', 'name')], opts)
    expect(warnings).toEqual([{ kind: 'same-header-unmasked', sheet: 'Y', header: 'Họ tên', count: 2 }])
  })

  it('gives a single warning for such a column, even if it also looks like personal data', () => {
    const wb = book({
      X: [['SĐT'], ['0912345678']],
      Y: [['SĐT'], ['0987654321']],
    })
    const { warnings } = maskWorkbook(wb, [colIn('X', 0, 'SĐT', 'phone')], opts)
    expect(warnings).toEqual([{ kind: 'same-header-unmasked', sheet: 'Y', header: 'SĐT', count: 1 }])
  })
})

describe('restoring amounts and dates per sheet', () => {
  const twoSheets = () =>
    book({
      X: [['Tiền', 'Ngày'], [1000, 40000]],
      Y: [['Tiền', 'Ngày'], [1000, 40000]],
    })
  const configs = [colIn('X', 0, 'Tiền', 'money'), colIn('X', 1, 'Ngày', 'date')]

  it('changes only the sheet that was masked', () => {
    const wb = twoSheets()
    const { mapping } = maskWorkbook(wb, configs, { ...opts, random: seeded() })
    expect(values(wb, 'X')[1][0]).not.toBe(1000)
    expect(values(wb, 'Y')[1]).toEqual([1000, 40000])

    const masked = readWorkbook(writeWorkbook(wb, 'xlsx'), 'x.xlsx').wb
    const stats = unmaskWorkbook(masked, parseMapping(JSON.stringify(mapping)))
    expect(values(masked, 'X')[1]).toEqual([1000, 40000])
    expect(values(masked, 'Y')[1]).toEqual([1000, 40000])
    expect(stats.divided).toBe(1)
    expect(stats.shifted).toBe(1)
  })

  it('restores only the masked one of two columns with the same header', () => {
    const wb = book({ X: [['Tiền', 'Tiền'], [1000, 2000]] })
    const { mapping } = maskWorkbook(wb, [colIn('X', 1, 'Tiền', 'money')], { ...opts, random: seeded() })
    unmaskWorkbook(wb, mapping)
    expect(values(wb, 'X')[1]).toEqual([1000, 2000])
  })

  it('finds a masked column the AI moved inside the same sheet', () => {
    const wb = book({ X: [['Tên', 'Tiền'], ['a', 1000]] })
    const { mapping } = maskWorkbook(wb, [colIn('X', 1, 'Tiền', 'money')], { ...opts, random: seeded() })
    const result = book({ X: [['Tiền', 'Mới', 'Tên'], [1000 * mapping.money!.factor, 5, 'a']] })
    unmaskWorkbook(result, mapping)
    expect(values(result, 'X')[1]).toEqual([1000, 5, 'a'])
  })

  it('matches by header in a sheet the AI created', () => {
    const wb = twoSheets()
    const { mapping } = maskWorkbook(wb, configs, { ...opts, random: seeded() })
    const result = book({ 'AI summary': [['Tiền'], [1000 * mapping.money!.factor]] })
    unmaskWorkbook(result, mapping)
    expect(values(result, 'AI summary')[1]).toEqual([1000])
  })

  it('keeps matching by header for older mapping files, which list no sheets', () => {
    const wb = twoSheets()
    const { mapping } = maskWorkbook(wb, [...configs, colIn('Y', 0, 'Tiền', 'money')], { ...opts, random: seeded() })
    const { sheets: _sheets, ...v2 } = mapping
    const old = parseMapping(JSON.stringify({ ...v2, version: 2 }))
    unmaskWorkbook(wb, old)
    expect(values(wb, 'X')[1][0]).toBe(1000)
    expect(values(wb, 'Y')[1][0]).toBe(1000)
  })

  it('rejects a mapping whose sheet list or columns are malformed', () => {
    const wb = twoSheets()
    const { mapping } = maskWorkbook(wb, configs, { ...opts, random: seeded() })
    expect(() => parseMapping(JSON.stringify({ ...mapping, sheets: [1] }))).toThrow()
    expect(() => parseMapping(JSON.stringify({ ...mapping, columns: [{ sheet: 'X' }] }))).toThrow()
  })
})

describe('readRows', () => {
  const ws = () => book({ S: [['A', 'B'], ...Array.from({ length: 30 }, (_, i) => [`r${i}`, i])] }).Sheets.S

  it('returns the requested data rows as display text', () => {
    const sheet = ws()
    expect(readRows(sheet, headersOf(sheet)!, 5, 2)).toEqual([
      ['r5', '5'],
      ['r6', '6'],
    ])
  })

  it('stops at the last row', () => {
    const sheet = ws()
    expect(readRows(sheet, headersOf(sheet)!, 25, 20)).toHaveLength(5)
    expect(readRows(sheet, headersOf(sheet)!, 30, 20)).toEqual([])
  })

  it('keeps rows aligned with the headers when a row is empty', () => {
    const sheet = book({ S: [['A', 'B'], ['x', 'y'], [], ['z', 'w']] }).Sheets.S
    expect(readRows(sheet, headersOf(sheet)!, 1, 1)).toEqual([['', '']])
  })
})
