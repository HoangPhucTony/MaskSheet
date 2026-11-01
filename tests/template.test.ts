import { describe, expect, it } from 'vitest'
import { suggestPrefix } from '../src/lib/detectType'
import { columnKey } from '../src/lib/normalize'
import {
  applyTemplate,
  bestTemplate,
  makeTemplate,
  parseTemplate,
  TemplateError,
  withTemplate,
  type Template,
} from '../src/lib/template'
import type { ColumnConfig, DataType } from '../src/lib/types'
import { col } from './helpers'

/** Configs as the app builds them for a freshly loaded file: everything off. */
function base(headers: [string, DataType][]): Record<string, ColumnConfig> {
  return Object.fromEntries(
    headers.map(([h, type], i) => [columnKey(h, i), { ...col(h, type, {}, i), enabled: false, prefix: suggestPrefix(type, h, i) }]),
  )
}

const configs = [
  col('Họ tên', 'name', { method: 'fake' }),
  col('SĐT', 'phone', {}, 1),
  col('Ghi chú', 'custom', { enabled: false }, 2),
  col('Doanh thu', 'money', { method: 'round' }, 3),
]

describe('templates', () => {
  it('keeps only masked columns and survives a JSON round trip', () => {
    const tpl = makeTemplate('Báo cáo tháng', 'report.xlsx', configs, ['Data'], new Date('2026-11-01T00:00:00Z'))
    expect(tpl.columns.map((c) => c.header)).toEqual(['Họ tên', 'SĐT', 'Doanh thu'])
    expect(parseTemplate(JSON.stringify(tpl))).toEqual(tpl)
  })

  it('rejects files that are not templates', () => {
    expect(() => parseTemplate('{')).toThrow(TemplateError)
    expect(() => parseTemplate(JSON.stringify({ format: 'masksheet-mapping', version: 2 }))).toThrow(TemplateError)
    expect(() => parseTemplate(JSON.stringify({ format: 'masksheet-template', version: 1, name: 'x', columns: [{ key: 1 }] }))).toThrow(
      TemplateError,
    )
  })

  it('switches on matching columns with the template settings and reports missing ones', () => {
    const tpl = makeTemplate('T', 'a.xlsx', configs, undefined)
    const file = base([
      ['Họ tên', 'name'],
      ['Số tiền', 'money'],
      ['Doanh thu', 'money'],
      ['Ghi chú', 'custom'],
    ])
    const r = applyTemplate(tpl, file, ['Sheet1'])
    expect(r.matched).toBe(2)
    expect(r.missing).toEqual(['SĐT'])
    expect(r.configs[columnKey('Họ tên', 0)]).toMatchObject({ enabled: true, method: 'fake' })
    expect(r.configs[columnKey('Doanh thu', 2)]).toMatchObject({ enabled: true, method: 'round' })
    expect(r.configs[columnKey('Ghi chú', 3)].enabled).toBe(false)
    expect(r.configs[columnKey('Số tiền', 1)].enabled).toBe(false)
    expect(r.skipSheets).toEqual([])
  })

  it('leaves out sheets not in the template, unless none of its sheets exist', () => {
    const tpl = makeTemplate('T', 'a.xlsx', configs, ['Data'])
    const file = base([['Họ tên', 'name']])
    expect(applyTemplate(tpl, file, ['Data', 'Notes']).skipSheets).toEqual(['Notes'])
    const renamed = applyTemplate(tpl, file, ['T11', 'T12'])
    expect(renamed.skipSheets).toEqual([])
    expect(renamed.sheetsNotFound).toBe(true)
  })

  it('falls back to a valid method and prefix when the template has bad ones', () => {
    const tpl: Template = {
      ...makeTemplate('T', 'a.xlsx', [col('Ghi chú', 'custom')], undefined),
      columns: [{ key: columnKey('Ghi chú', 0), header: 'Ghi chú', type: 'custom', method: 'fake', prefix: 'bad prefix' }],
    }
    const cfg = applyTemplate(tpl, base([['Ghi chú', 'custom']]), ['S']).configs[columnKey('Ghi chú', 0)]
    expect(cfg.method).toBe('code')
    expect(cfg.prefix).toBe(suggestPrefix('custom', 'Ghi chú', 0))
  })

  it('suggests the largest saved template whose columns are all in the file', () => {
    const small = makeTemplate('small', 'a.xlsx', [col('Họ tên', 'name')], undefined)
    const big = makeTemplate('big', 'a.xlsx', configs, undefined)
    const keys = new Set(['họ tên', 'sđt', 'doanh thu', 'khác'])
    expect(bestTemplate([small, big], keys)?.name).toBe('big')
    expect(bestTemplate([small, big], new Set(['họ tên']))?.name).toBe('small')
    expect(bestTemplate([small, big], new Set(['khác']))).toBeNull()
  })

  it('replaces a saved template with the same name', () => {
    const a = makeTemplate('A', 'a.xlsx', configs, undefined)
    const b = makeTemplate('B', 'b.xlsx', configs, undefined)
    const a2 = makeTemplate('A', 'c.xlsx', configs, undefined)
    expect(withTemplate([a, b], a2).map((t) => t.sourceFile)).toEqual(['c.xlsx', 'b.xlsx'])
  })
})
