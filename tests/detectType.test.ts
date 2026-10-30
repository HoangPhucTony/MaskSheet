import { describe, expect, it } from 'vitest'
import { detectType, suggestPrefix } from '../src/lib/detectType'
import { sanitizePrefix, isValidPrefix } from '../src/lib/normalize'

describe('detectType', () => {
  it.each([
    ['Họ tên', 'name'],
    ['Họ và tên', 'name'],
    ['HO TEN', 'name'],
    ['Full name', 'name'],
    ['SĐT', 'phone'],
    ['Số điện thoại', 'phone'],
    ['Phone', 'phone'],
    ['Email', 'email'],
    ['E-mail', 'email'],
    ['CCCD', 'id'],
    ['Số CMND', 'id'],
    ['Địa chỉ', 'address'],
    ['Tên công ty', 'org'],
    ['Company', 'org'],
    ['Đơn giá', 'money'],
    ['Doanh thu', 'money'],
    ['Lương', 'money'],
  ])('header %s → %s', (header, type) => {
    expect(detectType(header, [])?.type).toBe(type)
  })

  it.each(['Tên sản phẩm', 'Mã khách hàng', 'Số lượng', '#', 'Category1', 'DT'])('header %s → no person name', (header) => {
    expect(detectType(header, [])?.type).not.toBe('name')
  })

  it('detects from content when the header says nothing', () => {
    expect(detectType('Cột 3', ['a@b.vn', 'c@d.com', '', 'x@y.org'])).toEqual({ type: 'email', source: 'content' })
    expect(detectType('Liên lạc', ['0912345678', '0987 654 321', '+84 912 000 111'])?.type).toBe('phone')
    expect(detectType('Số giấy tờ', ['001099012345', '079188004321'])?.type).toBe('id')
  })

  it('ignores content below the threshold', () => {
    expect(detectType('Ghi chú', ['a@b.vn', 'xin chào', 'ok', 'hẹn mai'])).toBeNull()
  })
})

describe('prefixes', () => {
  it('derives custom prefixes from the header', () => {
    expect(suggestPrefix('custom', 'Confidential#1', 3)).toBe('CONFIDENTIAL_1')
    expect(suggestPrefix('custom', 'Khu vực', 4)).toBe('KHU_VUC')
    expect(suggestPrefix('custom', '#', 0)).toBe('COL_A')
    expect(suggestPrefix('custom', 'Một tiêu đề rất rất dài', 27)).toBe('COL_AB')
    expect(suggestPrefix('name', 'Họ tên', 0)).toBe('NAME')
  })

  it('sanitizes and validates prefixes', () => {
    expect(sanitizePrefix(' mã nv ')).toBe('MA_NV')
    expect(sanitizePrefix('123abc')).toBe('ABC')
    expect(isValidPrefix('MA_NV')).toBe(true)
    expect(isValidPrefix('ma')).toBe(false)
    expect(isValidPrefix('X_')).toBe(false)
  })
})
