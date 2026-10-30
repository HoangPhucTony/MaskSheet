import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { suggestPrefix } from '../src/lib/detectType'
import { readWorkbook, writeWorkbook } from '../src/lib/io'
import { parseMapping, MappingError } from '../src/lib/mapping'
import { maskWorkbook } from '../src/lib/masker'
import { columnKey } from '../src/lib/normalize'
import { headersOf } from '../src/lib/sheet'
import type { ColumnConfig } from '../src/lib/types'
import { divideBack } from '../src/lib/money'
import { unmaskText, unmaskWorkbook } from '../src/lib/unmasker'
import { book, col, opts, texts, values } from './helpers'

/** Mask → write → read back (as the AI would receive it) → unmask. */
function roundTrip(wb: ReturnType<typeof book>, configs: ColumnConfig[], format: 'xlsx' | 'csv' = 'xlsx') {
  const { mapping } = maskWorkbook(wb, configs, { ...opts, outputFormat: format })
  const mapping2 = parseMapping(JSON.stringify(mapping))
  const masked = readWorkbook(writeWorkbook(wb, format), `x.${format}`).wb
  const maskedTexts = texts(masked)
  const stats = unmaskWorkbook(masked, mapping2)
  return { masked, maskedTexts, mapping: mapping2, stats }
}

describe('round trip', () => {
  it('restores names with Vietnamese accents, numbers, dates and empty cells (xlsx)', () => {
    const original = [
      ['Họ tên', 'CCCD', 'Ngày sinh', 'Ghi chú'],
      ['Nguyễn Thị Ánh Tuyết', 1234567890, 32874, 'khách VIP'],
      ['Đặng Văn Ơn', null, 33000, null],
      ['Nguyễn Thị Ánh Tuyết', 1234567890, 32874, 'lần 2'],
    ]
    const wb = book({ S: original })
    wb.Sheets.S['!data']![1][2]!.z = 'dd/mm/yyyy'
    const { masked, maskedTexts, stats } = roundTrip(wb, [
      col('Họ tên', 'name'),
      col('CCCD', 'id', {}, 1),
      col('Ngày sinh', 'custom', { prefix: 'DOB' }, 2),
    ])
    expect(maskedTexts[1].slice(0, 3)).toEqual(['NAME_0001', 'ID_0001', 'DOB_0001'])
    expect(stats.unknown).toEqual([])
    expect(values(masked)).toEqual(values(book({ S: original })))
    expect(masked.Sheets.S['!data']![1][2]!.z).toBe('dd/mm/yyyy')
  })

  it('round trips CSV and keeps leading zeros of phone numbers', () => {
    const csv = '\uFEFFHọ tên,SĐT,Thành phố\nLê Văn Tám,0912345678,Hà Nội\nPhạm Thu,0987654321,Huế\nLê Văn Tám,0912345678,Huế\n'
    const { wb } = readWorkbook(new TextEncoder().encode(csv), 'kh.csv')
    const { masked, maskedTexts } = roundTrip(wb, [col('Họ tên', 'name'), col('SĐT', 'phone', {}, 1)], 'csv')
    expect(maskedTexts[1]).toEqual(['NAME_0001', 'PHONE_0001', 'Hà Nội'])
    expect(maskedTexts[3]).toEqual(['NAME_0001', 'PHONE_0001', 'Huế'])
    expect(texts(masked)[1]).toEqual(['Lê Văn Tám', '0912345678', 'Hà Nội'])
  })

  it('divides multiplied money columns back, also in totals the AI added', () => {
    const wb = book({ S: [['Price', 'Quantity', 'Revenue'], [125000, 40, 5000000], [45000, 120, 5400000]] })
    const configs = [
      col('Price', 'money', { moneyMode: 'multiply' }),
      col('Revenue', 'money', { moneyMode: 'multiply' }, 2),
    ]
    const { masked, mapping, stats } = roundTrip(wb, configs)
    expect(values(masked).slice(1)).toEqual([
      [125000, 40, 5000000],
      [45000, 120, 5400000],
    ])
    expect(stats.divided).toBe(4)
    const maskedTotal = (5000000 + 5400000) * mapping.money!.factor
    expect(divideBack(maskedTotal, mapping.money!.factor)).toBe(10400000)
  })

  it('restores codes in a result file with a different layout (AI summary table)', () => {
    const wb = book({ S: [['Khách hàng', 'Số đơn'], ['Công ty A', 1], ['Công ty B', 2], ['Công ty A', 3]] })
    const { mapping } = maskWorkbook(wb, [col('Khách hàng', 'org')], opts)
    const aiResult = book({
      'Tổng hợp': [['Top khách hàng', 'Số đơn'], ['ORG_0001', 2], ['ORG_0002', 1], ['ORG_0001 và ORG_0002', 3]],
    })
    const stats = unmaskWorkbook(aiResult, mapping)
    expect(texts(aiResult, 'Tổng hợp').slice(1).map((r) => r[0])).toEqual([
      'Công ty A',
      'Công ty B',
      'Công ty A và Công ty B',
    ])
    expect(stats.replaced).toBe(4)
  })
})

describe('unmaskText', () => {
  const wb = book({ S: [['Tên', 'Email'], ['Nguyễn An', 'an@x.vn'], ['Trần Bình', 'binh@x.vn']] })
  const { mapping } = maskWorkbook(wb, [col('Tên', 'name'), col('Email', 'email', {}, 1)], opts)

  it('replaces codes inside free text, including markdown and punctuation', () => {
    const answer = '**NAME_0001** (EMAIL_0001) mua nhiều hơn NAME_0002. Liên hệ: EMAIL_0002.'
    const { text, stats } = unmaskText(answer, mapping)
    expect(text).toBe('**Nguyễn An** (an@x.vn) mua nhiều hơn Trần Bình. Liên hệ: binh@x.vn.')
    expect(stats.replaced).toBe(4)
  })

  it('accepts codes whose zero padding was dropped', () => {
    expect(unmaskText('NAME_2 thắng', mapping).text).toBe('Trần Bình thắng')
  })

  it('reports codes that are not in the mapping and leaves them as they are', () => {
    const { text, stats } = unmaskText('NAME_0001, NAME_0099, NAME_0099', mapping)
    expect(text).toBe('Nguyễn An, NAME_0099, NAME_0099')
    expect(stats.unknown).toEqual(['NAME_0099'])
  })

  it('does not touch look-alikes that are part of a longer token', () => {
    const { text } = unmaskText('XNAME_0001 NAME_0001X MY_NAME_0001 NAME_00012', mapping)
    expect(text).toBe('XNAME_0001 NAME_0001X MY_NAME_0001 NAME_00012')
  })
})

describe('mapping validation', () => {
  it('rejects files that are not mappings', () => {
    expect(() => parseMapping('hello')).toThrowError(MappingError)
    expect(() => parseMapping('{"a":1}')).toThrowError(MappingError)
  })
})

describe('sample.xlsx', () => {
  it('masks the Confidential columns consistently across both sheets', () => {
    const { wb } = readWorkbook(readFileSync('public/sample.xlsx'), 'sample.xlsx')
    const configs: ColumnConfig[] = []
    for (const name of wb.SheetNames) {
      const h = headersOf(wb.Sheets[name])!
      h.headers.forEach((header, i) => {
        const key = columnKey(header, h.firstCol + i)
        if (header.startsWith('Confidential') && !configs.some((c) => c.key === key)) {
          configs.push({ key, header, enabled: true, type: 'custom', prefix: suggestPrefix('custom', header, i), moneyMode: 'code' })
        }
      })
    }
    expect(configs.map((c) => c.prefix)).toEqual([
      'CONFIDENTIAL_1',
      'CONFIDENTIAL_2',
      'CONFIDENTIAL_3',
      'CONFIDENTIAL_4',
      'CONFIDENTIAL_5',
      'CONFIDENTIAL_6',
    ])
    const before1 = texts(wb, wb.SheetNames[0])
    const before2 = texts(wb, wb.SheetNames[1])
    const { mapping } = maskWorkbook(wb, configs, opts)
    const s1 = texts(wb, wb.SheetNames[0])
    const s2 = texts(wb, wb.SheetNames[1])

    // Same employee code → same masked code, in both sheets.
    const codeOf = new Map<string, string>()
    for (const [before, after, c] of [[before1, s1, 6], [before2, s2, 3]] as const) {
      for (let r = 1; r < before.length; r++) {
        const prev = codeOf.get(before[r][c])
        if (prev) expect(after[r][c]).toBe(prev)
        codeOf.set(before[r][c], after[r][c])
      }
    }
    expect(mapping.dictionaries.CONFIDENTIAL_4.entries.map((e) => e.v)).toEqual(['NV01', 'NV02', 'NV03', 'NV04', 'NV05'])
    // Columns that were not selected are untouched.
    expect(s1.map((r) => r[9])).toEqual(before1.map((r) => r[9]))
  })
})
