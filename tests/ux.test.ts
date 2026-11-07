import { describe, expect, it } from 'vitest'
import { restoredName } from '../src/lib/fileName'
import { maskWorkbook } from '../src/lib/masker'
import { isUsablePrefix } from '../src/lib/normalize'
import { toWorkerError } from '../src/workers/protocol'
import { book, colIn, opts } from './helpers'

describe('warnings point at the column to fix', () => {
  it('give the column letter of an unmasked column with personal data', () => {
    const wb = book({ S: [['Tên', 'Ghi chú'], ['An', 'gọi 0912345678']] })
    const { warnings } = maskWorkbook(wb, [colIn('S', 0, 'Tên', 'name')], opts)
    expect(warnings).toEqual([{ kind: 'pii-unmasked', sheet: 'S', header: 'Ghi chú', column: 'B', count: 1, detail: 'phone' }])
  })

  it('give the column letter of a same-header column left as is', () => {
    const wb = book({ X: [['Tên'], ['An']], Y: [['#', 'Tên'], [1, 'Bình']] })
    const { warnings } = maskWorkbook(wb, [colIn('X', 0, 'Tên', 'name')], opts)
    expect(warnings).toEqual([{ kind: 'same-header-unmasked', sheet: 'Y', header: 'Tên', column: 'B', count: 1 }])
  })
})

describe('rows above the header', () => {
  it('are scanned for personal data, since they are never masked', () => {
    const wb = book({
      S: [
        ['Báo cáo của chị Lan, SĐT 0912345678', null],
        ['Người lập: lan@congty.vn', null],
        ['Tên', 'Doanh thu'],
        ['An', 1000],
        ['Bình', 2000],
      ],
    })
    const { warnings } = maskWorkbook(wb, [colIn('S', 0, 'Tên', 'name')], { ...opts, headerRows: { S: 2 } })
    expect(warnings).toEqual([{ kind: 'pii-above-header', sheet: 'S', header: '', count: 2 }])
  })

  it('give no warning when they hold nothing personal', () => {
    const wb = book({ S: [['BÁO CÁO THÁNG 11'], [], ['Tên', 'Doanh thu'], ['An', 1000]] })
    expect(maskWorkbook(wb, [colIn('S', 0, 'Tên', 'name')], opts).warnings).toEqual([])
  })
})

describe('code prefixes', () => {
  it('are usable when valid and not reserved for fake data', () => {
    expect(isUsablePrefix('NAME')).toBe(true)
    expect(isUsablePrefix('KH_2')).toBe(true)
    expect(isUsablePrefix('')).toBe(false)
    expect(isUsablePrefix('bad prefix')).toBe(false)
    expect(isUsablePrefix('FAKE_NAME')).toBe(false)
  })
})

describe('password-protected files', () => {
  it('get their own error, not a generic one', () => {
    expect(toWorkerError(new Error('File is password-protected'), 'read-failed').code).toBe('encrypted')
    expect(toWorkerError(new Error('File is password-protected: ECMA-376 Extensible'), 'read-failed').code).toBe('encrypted')
    expect(toWorkerError(new Error('ECMA-376 Encrypted file unrecognized Version: 9'), 'read-failed').code).toBe('encrypted')
    expect(toWorkerError(new Error('Unsupported ZIP encryption'), 'read-failed').code).toBe('encrypted')
    expect(toWorkerError(new Error('Corrupted zip'), 'read-failed').code).toBe('read-failed')
  })
})

describe('restored file names', () => {
  it('drop the _masked suffix the masked file was given', () => {
    expect(restoredName('khach_masked.xlsx', 'xlsx')).toBe('khach_restored.xlsx')
    expect(restoredName('khach_masked (1).xlsx', 'xlsx')).toBe('khach_restored.xlsx')
    expect(restoredName('ket_qua_AI.csv', 'csv')).toBe('ket_qua_AI_restored.csv')
    expect(restoredName('bao_cao.xls', 'xlsx')).toBe('bao_cao_restored.xlsx')
  })
})
