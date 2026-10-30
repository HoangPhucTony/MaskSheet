import type { Detection } from '../lib/detectType'
import type { DictionaryStats } from '../lib/masker'
import type { ColumnConfig, MaskWarning } from '../lib/types'
import type { UnmaskStats } from '../lib/unmasker'
import type { FileFormat } from '../lib/io'

export interface SheetInfo {
  name: string
  /** Data rows, header excluded. */
  rowCount: number
  headers: string[]
  /** Column keys aligned with `headers`. */
  keys: string[]
  /** Header row + first rows, as display text. */
  preview: string[][]
}

/** One logical column: every sheet column sharing the same header. */
export interface ColumnInfo {
  key: string
  header: string
  /** Column index in the first sheet that has it. */
  colIndex: number
  sheets: string[]
  /** A few distinct non-empty values, for display. */
  samples: string[]
  suggestion: Detection | null
  /** Share of non-empty sampled cells that are numbers. */
  numericRatio: number
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
}

export type MaskRequest =
  | { type: 'load'; buffer: ArrayBuffer; fileName: string }
  | { type: 'mask'; configs: ColumnConfig[] }

export type MaskResponse =
  | { type: 'loaded'; info: WorkbookInfo }
  | Progress
  | {
      type: 'masked'
      masked: ArrayBuffer
      format: FileFormat
      mappingJson: string
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
