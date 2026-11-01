import type { DataType, Method, StoredValue } from './types'

export const MAPPING_FORMAT = 'masksheet-mapping'
export const MAPPING_VERSION = 2

export interface MappingColumn {
  sheet: string
  header: string
  /** Excel column letter in that sheet. */
  column: string
  type: DataType
  method: Method
  /** Dictionary key for methods 'code' and 'fake'. */
  dictionary?: string
}

export interface Dictionary {
  /** Zero-padding width of the numeric part of codes. */
  width: number
  /** entries[i] is the original value for code number i + 1 (or for fakes[i]). */
  entries: StoredValue[]
  /** Present for fake-data dictionaries: fakes[i] replaced entries[i]. */
  fakes?: string[]
}

export interface MappingFile {
  format: typeof MAPPING_FORMAT
  version: number
  warning: string
  createdAt: string
  sourceFile: string
  /** Output format of the masked file. */
  outputFormat: 'xlsx' | 'csv'
  columns: MappingColumn[]
  /** Dictionary key (code prefix, or FAKE_<TYPE>) → dictionary. */
  dictionaries: Record<string, Dictionary>
  /** Present when at least one amount column was multiplied: masked = real × factor. */
  money?: {
    factor: number
    /** Header keys (see columnKey) of multiplied columns. */
    multipliedHeaders: string[]
  }
  /** Present when at least one date column was shifted: masked = real + offsetDays. */
  dates?: {
    offsetDays: number
    shiftedHeaders: string[]
  }
}

export const MAPPING_WARNING =
  'KEEP THIS FILE PRIVATE. Do NOT send it to any AI. It contains the original values. / GIỮ FILE NÀY CẨN THẬN, KHÔNG gửi cho AI. File chứa dữ liệu gốc.'

/** Key of the shared dictionary used by all fake-data columns of one type. */
export function fakeDictionaryKey(type: DataType): string {
  return `FAKE_${type.toUpperCase()}`
}

/**
 * Serialize a mapping. Small fields are indented for people opening the file; dictionary
 * entries take one line each, which keeps the mapping of a big sheet several times smaller.
 */
export function stringifyMapping(mapping: MappingFile): string {
  const { dictionaries, ...rest } = mapping
  const lines = (items: unknown[]) =>
    items.length ? `[\n${items.map((x) => '        ' + JSON.stringify(x)).join(',\n')}\n      ]` : '[]'
  const dicts = Object.entries(dictionaries).map(([key, d]) => {
    const fields = [`"width": ${d.width}`, `"entries": ${lines(d.entries)}`]
    if (d.fakes) fields.push(`"fakes": ${lines(d.fakes)}`)
    return `    ${JSON.stringify(key)}: {\n      ${fields.join(',\n      ')}\n    }`
  })
  // Drop the closing "\n}" of the indented head and append the dictionaries.
  const head = JSON.stringify(rest, null, 2).slice(0, -2)
  return `${head},\n  "dictionaries": {${dicts.length ? `\n${dicts.join(',\n')}\n  ` : ''}}\n}\n`
}

export function formatCode(prefix: string, n: number, width: number): string {
  return `${prefix}_${String(n).padStart(width, '0')}`
}

export class MappingError extends Error {
  name = 'MappingError'
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function isStoredValue(x: unknown): x is StoredValue {
  if (!isObject(x)) return false
  if (!['s', 'n', 'b', 'd'].includes(x.t as string)) return false
  if (!['string', 'number', 'boolean'].includes(typeof x.v)) return false
  return typeof x.w === 'string' && (x.z === undefined || typeof x.z === 'string')
}

function isStringArray(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((s) => typeof s === 'string')
}

/** Parse and validate a mapping file (versions 1 and 2). Throws MappingError with a short reason. */
export function parseMapping(json: string): MappingFile {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new MappingError('not-json')
  }
  if (!isObject(data) || data.format !== MAPPING_FORMAT) throw new MappingError('not-mapping')
  if (data.version !== 1 && data.version !== MAPPING_VERSION) throw new MappingError('bad-version')
  if (!isObject(data.dictionaries) || !Array.isArray(data.columns)) throw new MappingError('corrupt')
  for (const [key, dict] of Object.entries(data.dictionaries)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new MappingError('corrupt')
    if (!isObject(dict) || typeof dict.width !== 'number' || !Array.isArray(dict.entries)) {
      throw new MappingError('corrupt')
    }
    if (!dict.entries.every(isStoredValue)) throw new MappingError('corrupt')
    if (dict.fakes !== undefined && !(isStringArray(dict.fakes) && dict.fakes.length === dict.entries.length)) {
      throw new MappingError('corrupt')
    }
  }
  if (data.money !== undefined) {
    const m = data.money
    if (!isObject(m) || typeof m.factor !== 'number' || !(m.factor > 0) || !isStringArray(m.multipliedHeaders)) {
      throw new MappingError('corrupt')
    }
  }
  if (data.dates !== undefined) {
    const d = data.dates
    if (!isObject(d) || !Number.isInteger(d.offsetDays) || !isStringArray(d.shiftedHeaders)) {
      throw new MappingError('corrupt')
    }
  }
  return data as unknown as MappingFile
}
