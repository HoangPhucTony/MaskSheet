export type DataType =
  | 'name'
  | 'phone'
  | 'email'
  | 'id'
  | 'address'
  | 'org'
  | 'money'
  | 'date'
  | 'custom'

export const DATA_TYPES: DataType[] = ['name', 'phone', 'email', 'id', 'address', 'org', 'money', 'date', 'custom']

/**
 * How a column is masked.
 * - code:     NAME_0001 (reversible)
 * - fake:     realistic fake value, e.g. "Trần Minh Khoa" (reversible)
 * - partial:  keep part of the value, e.g. 091****678 (one-way)
 * - redact:   *** (one-way)
 * - multiply: amount × secret factor (reversible)
 * - round:    2 significant digits (one-way)
 * - range:    "5,000,000–10,000,000" (one-way)
 * - shift:    date + secret number of days (reversible)
 * - month:    keep only month and year (one-way)
 */
export type Method = 'code' | 'fake' | 'partial' | 'redact' | 'multiply' | 'round' | 'range' | 'shift' | 'month'

/** Methods offered per data type; the first one is the default. */
export const METHODS: Record<DataType, Method[]> = {
  name: ['code', 'fake', 'partial', 'redact'],
  phone: ['code', 'fake', 'partial', 'redact'],
  email: ['code', 'fake', 'partial', 'redact'],
  id: ['code', 'fake', 'partial', 'redact'],
  address: ['code', 'fake', 'partial', 'redact'],
  org: ['code', 'fake', 'partial', 'redact'],
  money: ['multiply', 'code', 'round', 'range', 'redact'],
  date: ['shift', 'code', 'month', 'redact'],
  custom: ['code', 'partial', 'redact'],
}

const REVERSIBLE: ReadonlySet<Method> = new Set<Method>(['code', 'fake', 'multiply', 'shift'])

export function isReversible(method: Method): boolean {
  return REVERSIBLE.has(method)
}

export const DEFAULT_PREFIX: Record<DataType, string> = {
  name: 'NAME',
  phone: 'PHONE',
  email: 'EMAIL',
  id: 'ID',
  address: 'ADDR',
  org: 'ORG',
  money: 'AMT',
  date: 'DATE',
  custom: 'COL',
}

/**
 * Masking settings for one column. Columns are identified by their header text,
 * so the same header in several sheets is masked the same way.
 */
export interface ColumnConfig {
  /** Header key (see `columnKey`), shared across sheets. */
  key: string
  /** Header as displayed in the first sheet where it appears. */
  header: string
  enabled: boolean
  type: DataType
  method: Method
  /** Code prefix (method 'code'); columns sharing a prefix share one dictionary. */
  prefix: string
}

/** A spreadsheet cell value as SheetJS stores it, reduced to what we need to restore it. */
export interface StoredValue {
  /** SheetJS cell type: s = string, n = number, b = boolean, d = date. */
  t: 's' | 'n' | 'b' | 'd'
  /** Raw value. Dates are stored as ISO strings. */
  v: string | number | boolean
  /** Number format, e.g. "#,##0" or "mm-dd-yy". */
  z?: string
  /** Formatted text as shown in Excel; used when the value appears inside free text. */
  w: string
}

export interface MaskWarning {
  /** pii-unmasked: personal data found in a column left as is; skipped: cells the method could not handle. */
  kind: 'pii-unmasked' | 'skipped'
  sheet: string
  header: string
  count: number
  /** pii-unmasked: phone | email | id. skipped: number | date. */
  detail?: string
}
