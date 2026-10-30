export type DataType =
  | 'name'
  | 'phone'
  | 'email'
  | 'id'
  | 'address'
  | 'org'
  | 'money'
  | 'custom'

/** How a money column is protected. */
export type MoneyMode = 'code' | 'multiply' | 'round'

export const DEFAULT_PREFIX: Record<DataType, string> = {
  name: 'NAME',
  phone: 'PHONE',
  email: 'EMAIL',
  id: 'ID',
  address: 'ADDR',
  org: 'ORG',
  money: 'AMT',
  custom: 'COL',
}

/**
 * Masking settings for one column. Columns are identified by their header text,
 * so the same header in several sheets is masked with the same dictionary.
 */
export interface ColumnConfig {
  /** Header key (see `headerKey`), shared across sheets. */
  key: string
  /** Header as displayed in the first sheet where it appears. */
  header: string
  enabled: boolean
  type: DataType
  /** Code prefix; columns sharing a prefix share one dictionary. */
  prefix: string
  /** Only used when type === 'money'. */
  moneyMode: MoneyMode
}

/** A spreadsheet cell value as SheetJS stores it, reduced to what we need to restore it. */
export interface StoredValue {
  /** SheetJS cell type: s = string, n = number, b = boolean, d = date. */
  t: 's' | 'n' | 'b' | 'd'
  /** Raw value. Dates are stored as ISO strings. */
  v: string | number | boolean
  /** Number format, e.g. "#,##0" or "mm-dd-yy". */
  z?: string
  /** Formatted text as shown in Excel; used when the code appears inside free text. */
  w: string
}

export interface MaskWarning {
  kind: 'pii-unmasked' | 'money-non-numeric'
  sheet: string
  header: string
  count: number
  /** For pii-unmasked: which detector matched. */
  detail?: string
}
