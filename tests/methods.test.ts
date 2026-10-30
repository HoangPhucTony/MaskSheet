import { describe, expect, it } from 'vitest'
import { parseTextDate, shiftTextDate } from '../src/lib/dates'
import { detectType } from '../src/lib/detectType'
import { makeFaker } from '../src/lib/fake'
import { readWorkbook, writeWorkbook } from '../src/lib/io'
import { MAPPING_FORMAT, parseMapping } from '../src/lib/mapping'
import { maskWorkbook, MaskError } from '../src/lib/masker'
import { rangeLabel } from '../src/lib/money'
import { partialMask } from '../src/lib/partial'
import { unmaskText, unmaskWorkbook } from '../src/lib/unmasker'
import { book, col, opts, texts, values } from './helpers'

function seeded(seed = 42) {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
}

describe('fake data', () => {
  it('replaces names with consistent, realistic fake names', () => {
    const wb = book({ S: [['Họ tên'], ['Nguyễn Văn A'], ['Trần Thị B'], ['Nguyễn Văn A']] })
    const { mapping } = maskWorkbook(wb, [col('Họ tên', 'name', { method: 'fake' })], { ...opts, random: seeded() })
    const [, a, b, a2] = texts(wb).map((r) => r[0])
    expect(a).toBe(a2)
    expect(a).not.toBe(b)
    expect(a).toMatch(/^\p{Lu}\p{L}+ \p{Lu}\p{L}+ \p{Lu}\p{L}+$/u)
    expect(mapping.dictionaries.FAKE_NAME.fakes).toEqual([a, b])
  })

  it('never produces the same fake twice, nor a value that is taken', () => {
    const taken = new Set<string>()
    const first = makeFaker('name', seeded(1), () => false)()
    taken.add(first)
    const next = makeFaker('name', seeded(1), (v) => taken.has(v))
    const seen = new Set<string>()
    for (let i = 0; i < 15000; i++) {
      const v = next()
      expect(v).not.toBe(first)
      seen.add(v)
    }
    expect(seen.size).toBe(15000)
  })

  it('makes valid-looking phones, emails and IDs', () => {
    const wb = book({
      S: [['SĐT', 'Email', 'CCCD'], ['0912345678', 'an@x.vn', '001099012345']],
    })
    maskWorkbook(
      wb,
      [col('SĐT', 'phone', { method: 'fake' }), col('Email', 'email', { method: 'fake' }, 1), col('CCCD', 'id', { method: 'fake' }, 2)],
      { ...opts, random: seeded() },
    )
    const [phone, email, id] = texts(wb)[1]
    expect(phone).toMatch(/^09\d{8}$/)
    expect(email).toMatch(/^[a-z]+\.[a-z]+\d*@example\.com$/)
    expect(id).toMatch(/^079\d{9}$/)
  })

  it('restores fake values from an AI answer and from a result file', () => {
    const wb = book({ S: [['Khách hàng', 'Doanh số'], ['Công ty Ánh Dương', 5], ['Lê Thị Hoa', 7]] })
    const configs = [col('Khách hàng', 'org', { method: 'fake' })]
    const { mapping } = maskWorkbook(wb, configs, { ...opts, random: seeded(7) })
    const [f1, f2] = mapping.dictionaries.FAKE_ORG.fakes!
    const answer = `Khách lớn nhất là ${f2}, sau đó là "${f1}".`
    expect(unmaskText(answer, mapping).text).toBe('Khách lớn nhất là Lê Thị Hoa, sau đó là "Công ty Ánh Dương".')

    const masked = readWorkbook(writeWorkbook(wb, 'xlsx'), 'm.xlsx').wb
    unmaskWorkbook(masked, parseMapping(JSON.stringify(mapping)))
    expect(texts(masked).map((r) => r[0])).toEqual(['Khách hàng', 'Công ty Ánh Dương', 'Lê Thị Hoa'])
  })

  it('does not replace a fake name inside a longer word', () => {
    const wb = book({ S: [['Tên'], ['A']] })
    const { mapping } = maskWorkbook(wb, [col('Tên', 'name', { method: 'fake' })], { ...opts, random: seeded() })
    const fake = mapping.dictionaries.FAKE_NAME.fakes![0]
    expect(unmaskText(`${fake}h ${fake}`, mapping).text).toBe(`${fake}h A`)
  })

  it('rejects fake data for types without a generator', () => {
    const wb = book({ S: [['Mã'], ['X1']] })
    expect(() => maskWorkbook(wb, [col('Mã', 'custom', { method: 'fake' })], opts)).toThrowError(MaskError)
  })
})

describe('partial and redact', () => {
  it.each([
    ['phone', '0912 345 678', '091****678'],
    ['phone', '+84912345678', '091****678'],
    ['email', 'nguyen.an@gmail.com', 'n***@gmail.com'],
    ['name', 'Nguyễn Văn  An', 'N. V. A.'],
    ['name', 'đặng thu', 'Đ. T.'],
    ['id', '001099012345', '********2345'],
    ['address', '12 Lê Lợi, Quận 1, TP. Hồ Chí Minh', '***, TP. Hồ Chí Minh'],
    ['address', 'Không rõ', '***'],
    ['custom', 'KH001', 'KH***'],
    ['custom', 'HĐ2026-001', 'HĐ***'],
    ['custom', 'Miền Nam', 'M. N.'],
    ['org', 'Công ty Ánh Dương', 'C. T. Á. D.'],
  ] as const)('%s %s → %s', (type, input, output) => {
    expect(partialMask(type, input)).toBe(output)
  })

  it('writes partial and redacted values without storing originals in the mapping', () => {
    const wb = book({ S: [['SĐT', 'Ghi chú'], ['0912345678', 'bí mật'], ['', 'x']] })
    const { mapping } = maskWorkbook(
      wb,
      [col('SĐT', 'phone', { method: 'partial' }), col('Ghi chú', 'custom', { method: 'redact' }, 1)],
      opts,
    )
    expect(texts(wb).slice(1)).toEqual([
      ['091****678', '***'],
      ['', '***'],
    ])
    expect(mapping.dictionaries).toEqual({})
    expect(JSON.stringify(mapping)).not.toContain('0912345678')
  })
})

describe('amount ranges', () => {
  it.each([
    [7425000, '5,000,000–10,000,000'],
    [125000, '100,000–200,000'],
    [2500, '2,000–5,000'],
    [1000, '1,000–2,000'],
    [-45000, '-20,000–-50,000'],
  ])('%d → %s', (v, label) => {
    expect(rangeLabel(v)).toBe(label)
  })
})

describe('dates', () => {
  it('parses ISO and day-first dates and keeps their format when shifting', () => {
    expect(parseTextDate('2026-10-01')).toMatchObject({ y: 2026, m: 10, d: 1 })
    expect(parseTextDate('01/10/2026')).toMatchObject({ y: 2026, m: 10, d: 1 })
    expect(parseTextDate('31/02/2026')).toBeNull()
    expect(shiftTextDate('2026-10-01', 31)).toBe('2026-11-01')
    expect(shiftTextDate('1/10/2026', -1)).toBe('30/9/2026')
    expect(shiftTextDate('31.12.2026', 1)).toBe('01.01.2027')
  })

  it('shifts Excel dates by one secret offset, keeps intervals, and shifts back', () => {
    const original = [['Ngày'], [46296], [46300], [null]]
    const wb = book({ S: original })
    wb.Sheets.S['!data']![1][0]!.z = 'dd/mm/yyyy'
    const { mapping } = maskWorkbook(wb, [col('Ngày', 'date')], { ...opts, random: seeded(3) })
    const off = mapping.dates!.offsetDays
    expect(Math.abs(off)).toBeGreaterThanOrEqual(30)
    expect(values(wb).slice(1, 3).map((r) => r[0])).toEqual([46296 + off, 46300 + off])

    const masked = readWorkbook(writeWorkbook(wb, 'xlsx'), 'm.xlsx').wb
    const stats = unmaskWorkbook(masked, parseMapping(JSON.stringify(mapping)))
    expect(values(masked).slice(1, 3).map((r) => r[0])).toEqual([46296, 46300])
    expect(stats.shifted).toBe(2)
  })

  it('shifts text dates in CSV and restores them', () => {
    const csv = 'Ngày giao,Mã\n01/10/2026,A\n15/10/2026,B\nchưa rõ,C\n'
    const { wb } = readWorkbook(new TextEncoder().encode(csv), 'x.csv')
    const { mapping, warnings } = maskWorkbook(wb, [col('Ngày giao', 'date')], { ...opts, outputFormat: 'csv', random: seeded(5) })
    expect(texts(wb)[1][0]).not.toBe('01/10/2026')
    expect(texts(wb)[1][0]).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
    expect(warnings).toEqual([expect.objectContaining({ kind: 'skipped', detail: 'date', count: 1 })])
    const masked = readWorkbook(writeWorkbook(wb, 'csv'), 'x.csv').wb
    unmaskWorkbook(masked, mapping)
    expect(texts(masked).map((r) => r[0])).toEqual(['Ngày giao', '01/10/2026', '15/10/2026', 'chưa rõ'])
  })

  it('keeps only month and year', () => {
    const wb = book({ S: [['Ngày sinh'], [46296], ['15/03/1990']] })
    maskWorkbook(wb, [col('Ngày sinh', 'date', { method: 'month' })], opts)
    expect(texts(wb).slice(1).map((r) => r[0])).toEqual(['10/2026', '03/1990'])
  })

  it('detects date columns from the number format or text', () => {
    expect(detectType('Confidential#6', ['10/1/26'], { dateRatio: 1 })?.type).toBe('date')
    expect(detectType('Cột X', ['2026-10-01', '2026-10-05'])?.type).toBe('date')
    expect(detectType('Ngày tạo', [])?.type).toBe('date')
  })
})

describe('mapping compatibility', () => {
  it('still reads version 1 mapping files', () => {
    const v1 = {
      format: MAPPING_FORMAT,
      version: 1,
      warning: '',
      createdAt: '2026-10-30T00:00:00Z',
      sourceFile: 'a.xlsx',
      outputFormat: 'xlsx',
      columns: [],
      dictionaries: { NAME: { width: 4, entries: [{ t: 's', v: 'An', w: 'An' }] } },
      money: { factor: 1.5, multipliedHeaders: [], roundedHeaders: [] },
    }
    const mapping = parseMapping(JSON.stringify(v1))
    expect(unmaskText('NAME_0001', mapping).text).toBe('An')
  })
})
