import type { DataType, MoneyMode, StoredValue } from './types'

export const MAPPING_FORMAT = 'masksheet-mapping'
export const MAPPING_VERSION = 1

export interface MappingColumn {
  sheet: string
  header: string
  /** Excel column letter in that sheet. */
  column: string
  type: DataType
  prefix: string
  moneyMode?: MoneyMode
}

export interface Dictionary {
  /** Zero-padding width of the numeric part. */
  width: number
  /** entries[i] is the original value for code number i + 1. */
  entries: StoredValue[]
}

export interface MappingFile {
  format: typeof MAPPING_FORMAT
  version: typeof MAPPING_VERSION
  warning: string
  createdAt: string
  sourceFile: string
  /** Output format of the masked file. */
  outputFormat: 'xlsx' | 'csv'
  columns: MappingColumn[]
  /** prefix → dictionary */
  dictionaries: Record<string, Dictionary>
  /** Present when at least one money column was multiplied: masked = real × factor. */
  money?: {
    factor: number
    /** Header keys (see headerKey) of multiplied columns. */
    multipliedHeaders: string[]
    /** Header keys of rounded columns (irreversible). */
    roundedHeaders: string[]
  }
}

export const MAPPING_WARNING =
  'KEEP THIS FILE PRIVATE. Do NOT send it to any AI. It contains the original values. / GIỮ FILE NÀY CẨN THẬN, KHÔNG gửi cho AI. File chứa dữ liệu gốc.'

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

/** Parse and validate a mapping file. Throws MappingError with a short reason. */
export function parseMapping(json: string): MappingFile {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new MappingError('not-json')
  }
  if (!isObject(data) || data.format !== MAPPING_FORMAT) throw new MappingError('not-mapping')
  if (data.version !== MAPPING_VERSION) throw new MappingError('bad-version')
  if (!isObject(data.dictionaries) || !Array.isArray(data.columns)) throw new MappingError('corrupt')
  for (const [prefix, dict] of Object.entries(data.dictionaries)) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(prefix)) throw new MappingError('corrupt')
    if (!isObject(dict) || typeof dict.width !== 'number' || !Array.isArray(dict.entries)) {
      throw new MappingError('corrupt')
    }
    if (!dict.entries.every(isStoredValue)) throw new MappingError('corrupt')
  }
  if (data.money !== undefined) {
    const m = data.money
    if (
      !isObject(m) ||
      typeof m.factor !== 'number' ||
      !(m.factor > 0) ||
      !Array.isArray(m.multipliedHeaders) ||
      !Array.isArray(m.roundedHeaders)
    ) {
      throw new MappingError('corrupt')
    }
  }
  return data as unknown as MappingFile
}
