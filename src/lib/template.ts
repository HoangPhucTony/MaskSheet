import { methodsFor } from './fake'
import { isRowMap } from './mapping'
import { columnKey, isValidPrefix } from './normalize'
import { DATA_TYPES, type ColumnConfig, type DataType, type Method } from './types'

/**
 * A template remembers which columns to mask, how, and which sheets to keep, so the
 * same kind of file (e.g. this month's report) can be set up in one click. It holds
 * headers and settings only, never cell values.
 */

export const TEMPLATE_FORMAT = 'masksheet-template'
export const TEMPLATE_VERSION = 1

export interface TemplateColumn {
  /** Header key (see `columnKey`). */
  key: string
  header: string
  /** Sheet the column was picked in. Absent in older templates, which apply to every sheet. */
  sheet?: string
  type: DataType
  method: Method
  prefix: string
}

export interface Template {
  format: typeof TEMPLATE_FORMAT
  version: number
  name: string
  createdAt: string
  /** File the template was made from, for display. */
  sourceFile: string
  /** Sheets to keep. Absent when every sheet was kept. */
  sheets?: string[]
  /** Header rows (0-based) the user chose instead of the detected ones, per sheet. */
  headerRows?: Record<string, number>
  /** Masked columns only. */
  columns: TemplateColumn[]
}

export class TemplateError extends Error {
  name = 'TemplateError'
}

export function makeTemplate(
  name: string,
  sourceFile: string,
  configs: ColumnConfig[],
  sheets: string[] | undefined,
  now = new Date(),
  headerRows?: Record<string, number>,
): Template {
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    name: name.trim() || sourceFile,
    createdAt: now.toISOString(),
    sourceFile,
    ...(sheets ? { sheets } : {}),
    ...(headerRows && Object.keys(headerRows).length ? { headerRows } : {}),
    columns: configs
      .filter((c) => c.enabled)
      .map(({ col, sheet, header, type, method, prefix }) => ({ key: columnKey(header, col), header, sheet, type, method, prefix })),
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isColumn(x: unknown): x is TemplateColumn {
  return (
    isObject(x) &&
    typeof x.key === 'string' &&
    typeof x.header === 'string' &&
    DATA_TYPES.includes(x.type as DataType) &&
    typeof x.method === 'string' &&
    typeof x.prefix === 'string' &&
    (x.sheet === undefined || typeof x.sheet === 'string')
  )
}

/** Parse and validate a template. Throws TemplateError. */
export function parseTemplate(json: string): Template {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new TemplateError('not-json')
  }
  if (!isObject(data) || data.format !== TEMPLATE_FORMAT) throw new TemplateError('not-template')
  if (data.version !== TEMPLATE_VERSION) throw new TemplateError('bad-version')
  if (typeof data.name !== 'string' || !Array.isArray(data.columns) || !data.columns.every(isColumn)) {
    throw new TemplateError('corrupt')
  }
  if (data.sheets !== undefined && !(Array.isArray(data.sheets) && data.sheets.every((s) => typeof s === 'string'))) {
    throw new TemplateError('corrupt')
  }
  if (data.headerRows !== undefined && !isRowMap(data.headerRows)) throw new TemplateError('corrupt')
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    name: data.name,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    sourceFile: typeof data.sourceFile === 'string' ? data.sourceFile : '',
    ...(data.sheets ? { sheets: data.sheets as string[] } : {}),
    ...(data.headerRows ? { headerRows: data.headerRows as Record<string, number> } : {}),
    columns: data.columns as TemplateColumn[],
  }
}

export interface TemplateResult {
  configs: Record<string, ColumnConfig>
  /** Keys of the columns the template switched on. */
  matchedKeys: string[]
  /** Sheets of the file to leave out. */
  skipSheets: string[]
  /** Template columns found in the file. */
  matched: number
  /** Headers of template columns not found in the file. */
  missing: string[]
  /** The template lists sheets but none of them is in the file, so every sheet is kept. */
  sheetsNotFound: boolean
}

/**
 * Apply a template to a freshly loaded file: matching columns take the template's settings
 * and are switched on, every other column is switched off. A column matches on its header
 * and sheet; if the file has no sheet of that name (e.g. "T11" became "T12"), or the
 * template names none, it matches on its header in every sheet.
 */
export function applyTemplate(template: Template, base: Record<string, ColumnConfig>, sheetNames: string[]): TemplateResult {
  const configs: Record<string, ColumnConfig> = {}
  for (const [key, cfg] of Object.entries(base)) configs[key] = { ...cfg, enabled: false }

  let matched = 0
  const matchedKeys = new Set<string>()
  const missing: string[] = []
  const list = Object.values(base)
  for (const col of template.columns) {
    const anySheet = col.sheet === undefined || !sheetNames.includes(col.sheet)
    const targets = list.filter((c) => columnKey(c.header, c.col) === col.key && (anySheet || c.sheet === col.sheet))
    if (targets.length === 0) {
      missing.push(col.header || col.key)
      continue
    }
    const allowed = methodsFor(col.type)
    for (const cfg of targets) {
      configs[cfg.key] = {
        ...cfg,
        enabled: true,
        type: col.type,
        method: allowed.includes(col.method) ? col.method : allowed[0],
        prefix: isValidPrefix(col.prefix) ? col.prefix : cfg.prefix,
      }
      matchedKeys.add(cfg.key)
    }
    matched++
  }

  const keep = new Set(template.sheets ?? sheetNames)
  const sheetsNotFound = !sheetNames.some((s) => keep.has(s))
  const skipSheets = sheetsNotFound ? [] : sheetNames.filter((s) => !keep.has(s))
  return { configs, matchedKeys: [...matchedKeys], skipSheets, matched, missing, sheetsNotFound }
}

/** How many of a template's columns a file has. `columnKeys` holds header keys (see `columnKey`). */
export function matchCount(template: Template, columnKeys: ReadonlySet<string>): number {
  return template.columns.filter((c) => columnKeys.has(c.key)).length
}

/** The saved template that fits a file best: every one of its columns must be present. */
export function bestTemplate(templates: Template[], columnKeys: ReadonlySet<string>): Template | null {
  let best: Template | null = null
  for (const t of templates) {
    const n = matchCount(t, columnKeys)
    if (n > 0 && n === t.columns.length && (!best || n > best.columns.length)) best = t
  }
  return best
}

// Templates saved in this browser (localStorage). They contain headers and settings only.
const STORAGE_KEY = 'masksheet.templates'

export function loadSavedTemplates(): Template[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const list: unknown = JSON.parse(raw)
    if (!Array.isArray(list)) return []
    return list.flatMap((t) => {
      try {
        return [parseTemplate(JSON.stringify(t))]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

/** Save the list; returns false when storage is unavailable or full. */
export function storeTemplates(templates: Template[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(templates))
    return true
  } catch {
    return false
  }
}

/** Add or replace (same name) a template, newest first. */
export function withTemplate(templates: Template[], template: Template): Template[] {
  return [template, ...templates.filter((t) => t.name !== template.name)]
}
