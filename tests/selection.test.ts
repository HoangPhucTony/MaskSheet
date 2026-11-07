import { describe, expect, it } from 'vitest'
import { selectionBySheet, selectionSummary } from '../src/lib/selection'

const s = (sheet: string, header: string, key: string) => ({ sheet, header, key })

describe('selectionBySheet', () => {
  it('counts enabled columns per sheet', () => {
    expect(selectionBySheet([{ name: 'X', keys: ['A@X', 'B@X'] }, { name: 'Y', keys: ['A@Y'] }],
      { 'A@X': { enabled: true }, 'B@X': { enabled: true }, 'A@Y': { enabled: false } })).toEqual({ X: 2, Y: 0 })
  })
})

describe('selectionSummary', () => {
  it('summarises by sheet', () => {
    expect(selectionSummary([s('T11', 'Họ tên', 'A@T11'), s('T11', 'Doanh thu', 'C@T11')], { withSheet: true })).toBe('T11: Họ tên, Doanh thu')
    expect(selectionSummary([s('T11', 'Họ tên', 'A@T11'), s('T12', 'SĐT', 'B@T12')], { withSheet: true })).toBe('T11: Họ tên · T12: SĐT')
    expect(selectionSummary([s('S', 'A', 'A@S'), s('S', 'B', 'B@S'), s('S', 'C', 'C@S'), s('S', 'D', 'D@S')], { withSheet: true })).toBe('S: A, B, C +1')
    expect(selectionSummary([s('S', 'Họ tên', 'A@S'), s('S', '', 'B@S')], { withSheet: false })).toBe('Họ tên, B')
    expect(selectionSummary([], { withSheet: true })).toBe('')
  })
})
