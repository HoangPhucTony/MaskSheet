import type { Detection } from '../lib/detectType'
import type { DictionaryStats } from '../lib/masker'
import type { ColumnConfig, MaskWarning } from '../lib/types'
import type { UnmaskStats } from '../lib/unmasker'
import type { FileFormat } from '../lib/io'

/** Preview rows added each time the user asks to see more. */
export const PREVIEW_PAGE = 20

export interface SheetInfo {
  name: string
  /** Data rows, header excluded. */
  rowCount: number
  /** Index of the first column (0 = A). */
  firstCol: number
  headers: string[]
  /** Column keys (see `sheetColumnKey`) aligned with `headers`. */
  keys: string[]
  /** Header row + the rows loaded so far, as display text. */
  preview: string[][]
}

/** One column of one sheet. */
export interface ColumnInfo {
  /** See `sheetColumnKey`. */
  key: string
  sheet: string
  header: string
  /** See `columnKey`; equal in columns with the same header in other sheets. */
  headerKey: string
  colIndex: number
  /** A few distinct non-empty values, for display. */
  samples: string[]
  /** Judged together with same-header columns in other sheets, so they start alike. */
  suggestion: Detection | null
}

export interface WorkbookInfo {
  fileName: string
  format: FileFormat
  sheets: SheetInfo[]
  columns: ColumnInfo[]
}

export type ErrorCode =
  | 'read-failed'
  | 'empty'
  | 'out-of-memory'
  | 'no-columns'
  | 'bad-prefix'
  | 'bad-method'
  | 'collision'
  | 'mapping'
  | 'unknown'

export interface WorkerError {
  type: 'error'
  code: ErrorCode
  details: string[]
}

export interface Progress {
  type: 'progress'
  done: number
  total: number
  /** Step of a mask run: reading the file, masking rows, writing the output. */
  phase?: 'read' | 'mask' | 'write'
}

export type MaskRequest =
  | { type: 'load'; buffer: ArrayBuffer; fileName: string }
  | { type: 'mask'; configs: ColumnConfig[]; skipSheets: string[] }
  /** Load more preview rows; `start` counts data rows (0 = first row below the headers). */
  | { type: 'rows'; sheet: string; start: number; count: number }

export type MaskResponse =
  | { type: 'loaded'; info: WorkbookInfo }
  | { type: 'rows'; sheet: string; start: number; rows: string[][] }
  | Progress
  | {
      type: 'masked'
      masked: ArrayBuffer
      format: FileFormat
      /** Mapping file as UTF-8 JSON. */
      mapping: ArrayBuffer
      stats: DictionaryStats[]
      warnings: MaskWarning[]
      maskedCells: number
    }
  | WorkerError

export type UnmaskRequest =
  | { type: 'unmask-file'; buffer: ArrayBuffer; fileName: string; mappingJson: string }
  | { type: 'unmask-text'; text: string; mappingJson: string }

export type UnmaskResponse =
  | Progress
  | { type: 'unmasked-file'; buffer: ArrayBuffer; format: FileFormat; stats: UnmaskStats }
  | { type: 'unmasked-text'; text: string; stats: UnmaskStats }
  | WorkerError

/** Map anything thrown in a worker to an error message the UI can translate. */
export function toWorkerError(err: unknown, fallback: ErrorCode = 'unknown'): WorkerError {
  const e = err as { code?: unknown; details?: unknown; name?: string; message?: string }
  if (typeof e?.code === 'string' && ['no-columns', 'bad-prefix', 'bad-method', 'collision'].includes(e.code)) {
    return { type: 'error', code: e.code as ErrorCode, details: Array.isArray(e.details) ? e.details : [] }
  }
  if (e?.name === 'MappingError') return { type: 'error', code: 'mapping', details: [e.message ?? ''] }
  const msg = String(e?.message ?? err)
  if (e?.name === 'RangeError' || /memory|allocation|invalid array length|invalid string length/i.test(msg)) {
    return { type: 'error', code: 'out-of-memory', details: [msg] }
  }
  return { type: 'error', code: fallback, details: [msg] }
}
