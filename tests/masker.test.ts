import { describe, expect, it } from 'vitest'
import { maskWorkbook, MaskError } from '../src/lib/masker'
import { randomFactor, roundSignificant } from '../src/lib/money'
import { book, col, opts, texts, values } from './helpers'

describe('maskWorkbook — consistency', () => {
  it('gives equal values the same code and different values different codes', () => {
    const wb = book({
      S: [['Họ tên', 'Tuổi'], ['Nguyễn Văn A', 30], ['Trần Thị B', 25], ['Nguyễn Văn A', 41]],
    })
    maskWorkbook(wb, [col('Họ tên', 'name')], opts)
    expect(texts(wb)).toEqual([
      ['Họ tên', 'Tuổi'],
      ['NAME_0001', '30'],
      ['NAME_0002', '25'],
      ['NAME_0001', '41'],
    ])
  })

  it('treats extra / repeated spaces and NFD vs NFC accents as the same value', () => {
    const nfd = 'Nguyễn Văn A'.normalize('NFD')
    const wb = book({ S: [['Tên'], ['Nguyễn Văn A'], ['  Nguyễn   Văn A '], [nfd]] })
    maskWorkbook(wb, [col('Tên', 'name')], opts)
    expect(texts(wb).slice(1).flat()).toEqual(['NAME_0001', 'NAME_0001', 'NAME_0001'])
  })

  it('keeps case differences apart for names but not for emails', () => {
    const wb = book({ S: [['Tên', 'Email'], ['an', 'A@x.vn'], ['An', 'a@X.VN']] })
    maskWorkbook(wb, [col('Tên', 'name'), col('Email', 'email', {}, 1)], opts)
    expect(texts(wb).slice(1)).toEqual([
      ['NAME_0001', 'EMAIL_0001'],
      ['NAME_0002', 'EMAIL_0001'],
    ])
  })

  it('normalizes phone formats', () => {
    const wb = book({ S: [['SĐT'], ['0912 345 678'], ['+84912345678'], ['0912.345.678'], ['0987654321']] })
    maskWorkbook(wb, [col('SĐT', 'phone')], opts)
    expect(texts(wb).slice(1).flat()).toEqual(['PHONE_0001', 'PHONE_0001', 'PHONE_0001', 'PHONE_0002'])
  })

  it('shares one dictionary between columns with the same prefix', () => {
    const wb = book({ S: [['Người gửi', 'Người nhận'], ['An', 'Bình'], ['Bình', 'Chi']] })
    maskWorkbook(wb, [col('Người gửi', 'name'), col('Người nhận', 'name', {}, 1)], opts)
    expect(texts(wb).slice(1)).toEqual([
      ['NAME_0001', 'NAME_0002'],
      ['NAME_0002', 'NAME_0003'],
    ])
  })

  it('uses the same code for the same value in different sheets (matched by header)', () => {
    const wb = book({
      A: [['#', 'Mã NV'], [1, 'NV01'], [2, 'NV02']],
      B: [['Mã NV', 'Ghi chú'], ['NV02', 'x'], ['NV03', 'y']],
    })
    maskWorkbook(wb, [col('Mã NV', 'custom', { prefix: 'NV' }, 1)], opts)
    expect(texts(wb, 'A').map((r) => r[1])).toEqual(['Mã NV', 'NV_0001', 'NV_0002'])
    expect(texts(wb, 'B').map((r) => r[0])).toEqual(['Mã NV', 'NV_0002', 'NV_0003'])
  })
})

describe('maskWorkbook — layout', () => {
  it('keeps empty cells empty and leaves other columns, row order and sheet names alone', () => {
    const wb = book({ 'Danh sách': [['Tên', 'Ghi chú'], ['An', 'a'], [null, 'b'], ['', 'c'], ['Bình', null]] })
    maskWorkbook(wb, [col('Tên', 'name')], opts)
    expect(wb.SheetNames).toEqual(['Danh sách'])
    const t = texts(wb, 'Danh sách')
    expect(t.map((r) => r[0] ?? '')).toEqual(['Tên', 'NAME_0001', '', '', 'NAME_0002'])
    expect(t.map((r) => r[1] ?? '')).toEqual(['Ghi chú', 'a', 'b', 'c', ''])
  })

  it('pads to at least 4 digits and widens for large dictionaries', () => {
    const rows: unknown[][] = [['Tên']]
    for (let i = 0; i < 12345; i++) rows.push([`Người ${i}`])
    const wb = book({ S: rows })
    const { mapping } = maskWorkbook(wb, [col('Tên', 'name')], opts)
    expect(mapping.dictionaries.NAME.width).toBe(5)
    expect(texts(wb)[1][0]).toBe('NAME_00001')
    expect(texts(wb)[12345][0]).toBe('NAME_12345')
  })

  it('masks numbers and dates too, and records their type', () => {
    const wb = book({ S: [['Mã', 'Ngày'], [1001, 46296], [1001, 46297]] })
    wb.Sheets.S['!data']![1][1]!.z = 'dd/mm/yyyy'
    const { mapping } = maskWorkbook(wb, [col('Mã', 'id'), col('Ngày', 'custom', { prefix: 'DATE' }, 1)], opts)
    expect(texts(wb).slice(1)).toEqual([
      ['ID_0001', 'DATE_0001'],
      ['ID_0001', 'DATE_0002'],
    ])
    expect(mapping.dictionaries.ID.entries[0]).toMatchObject({ t: 'n', v: 1001 })
    expect(mapping.dictionaries.DATE.entries[0]).toMatchObject({ t: 'n', v: 46296, z: 'dd/mm/yyyy' })
  })

  it('removes formulas, comments and document properties', () => {
    const wb = book({ S: [['Tên', 'X'], ['An', 2]] })
    const cell = wb.Sheets.S['!data']![1][1]!
    cell.f = 'A1*2'
    wb.Props = { Author: 'Nguyễn Văn A' }
    maskWorkbook(wb, [col('Tên', 'name')], opts)
    expect(cell.f).toBeUndefined()
    expect(wb.Props).toEqual({})
  })
})

describe('maskWorkbook — safety checks', () => {
  it('refuses when the data already contains something that looks like a code', () => {
    const wb = book({ S: [['Tên', 'Ghi chú'], ['An', 'xem NAME_0007']] })
    expect(() => maskWorkbook(wb, [col('Tên', 'name')], opts)).toThrowError(MaskError)
  })

  it('does not treat a longer prefix as a collision (ORDER_ID_1 vs ID)', () => {
    const wb = book({ S: [['CCCD', 'Đơn'], ['012345678901', 'ORDER_ID_0001']] })
    expect(() => maskWorkbook(wb, [col('CCCD', 'id')], opts)).not.toThrow()
  })

  it('requires at least one column and valid prefixes', () => {
    const wb = book({ S: [['Tên'], ['An']] })
    expect(() => maskWorkbook(wb, [], opts)).toThrowError(MaskError)
    expect(() => maskWorkbook(wb, [col('Tên', 'custom', { prefix: 'bad prefix' })], opts)).toThrowError(MaskError)
  })

  it('warns about phones / emails left in columns that were not masked', () => {
    const wb = book({ S: [['Tên', 'Ghi chú'], ['An', 'gọi 0912 345 678'], ['Bình', 'mail b@x.vn'], ['Chi', 'ok']] })
    const { warnings } = maskWorkbook(wb, [col('Tên', 'name')], opts)
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'pii-unmasked', header: 'Ghi chú', detail: 'phone', count: 1 }),
        expect.objectContaining({ kind: 'pii-unmasked', header: 'Ghi chú', detail: 'email', count: 1 }),
      ]),
    )
  })
})

describe('maskWorkbook — money', () => {
  it('multiplies every money column by one shared factor, keeping Revenue = Price × Qty', () => {
    const wb = book({ S: [['Price', 'Quantity', 'Revenue'], [125000, 40, 5000000], [45000, 120, 5400000]] })
    const { mapping } = maskWorkbook(
      wb,
      [col('Price', 'money', { moneyMode: 'multiply' }), col('Revenue', 'money', { moneyMode: 'multiply' }, 2)],
      opts,
    )
    const f = mapping.money!.factor
    expect(f).toBe(randomFactor(() => 0.75))
    const [, r1, r2] = values(wb) as number[][]
    expect(r1[0]).toBeCloseTo(125000 * f)
    expect(r1[1]).toBe(40)
    expect(r1[0] * r1[1]).toBeCloseTo(r1[2])
    expect(r2[0] * r2[1]).toBeCloseTo(r2[2])
    expect(mapping.money!.multipliedHeaders).toEqual(['price', 'revenue'])
  })

  it('never picks a factor close to 1', () => {
    for (const r of [0, 0.25, 0.4999, 0.5, 0.75, 0.9999]) {
      const f = randomFactor(() => r)
      expect(f >= 0.5 && f <= 2).toBe(true)
      expect(Math.abs(f - 1)).toBeGreaterThanOrEqual(0.1)
    }
  })

  it('rounds to 2 significant digits', () => {
    expect(roundSignificant(7425000)).toBe(7400000)
    expect(roundSignificant(125000)).toBe(130000)
    expect(roundSignificant(-45678)).toBe(-46000)
  })

  it('parses amounts stored as text and warns about non-numeric ones', () => {
    const wb = book({ S: [['Số tiền'], ['1.234.000'], ['Thỏa thuận']] })
    const { warnings } = maskWorkbook(wb, [col('Số tiền', 'money', { moneyMode: 'round' })], opts)
    expect(values(wb)[1][0]).toBe(1200000)
    expect(warnings).toEqual([expect.objectContaining({ kind: 'money-non-numeric', count: 1 })])
  })
})
