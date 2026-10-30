import type * as XLSX from 'xlsx'
import { randomFactor, roundSignificant } from './money'
import { colLetter, columnKey, isValidPrefix, valueKey } from './normalize'
import {
  MAPPING_FORMAT,
  MAPPING_VERSION,
  MAPPING_WARNING,
  formatCode,
  type Dictionary,
  type MappingColumn,
  type MappingFile,
} from './mapping'
import { cellNumber, cellText, headersOf, numberCell, rowsOf, stripWorkbook, textCell, toStored, type Cell } from './sheet'
import type { ColumnConfig, MaskWarning, StoredValue } from './types'

export interface MaskOptions {
  sourceFile: string
  outputFormat: 'xlsx' | 'csv'
  /** Uniform random in [0, 1). Defaults to crypto.getRandomValues. */
  random?: () => number
  /** Called with (rowsDone, rowsTotal), at most once per PROGRESS_STEP rows. */
  onProgress?: (done: number, total: number) => void
  now?: Date
}

export interface PrefixStats {
  prefix: string
  unique: number
  cells: number
}

export interface MaskResult {
  mapping: MappingFile
  stats: PrefixStats[]
  warnings: MaskWarning[]
  maskedCells: number
}

export const PROGRESS_STEP = 1000

export class MaskError extends Error {
  constructor(
    public code: 'no-columns' | 'bad-prefix' | 'collision',
    public details: string[] = [],
  ) {
    super(code)
  }
}

export function cryptoRandom(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] / 2 ** 32
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Regex matching codes like PREFIX_0001 for any of the given prefixes, as whole tokens. */
export function codeRegex(prefixes: string[]): RegExp {
  const alts = [...new Set(prefixes)].sort((a, b) => b.length - a.length).map(escapeRegex)
  return new RegExp(`(?<![A-Za-z0-9_])(${alts.join('|')})_(\\d+)(?![A-Za-z0-9_])`, 'g')
}

// Detectors for sensitive data left in columns the user did not select.
const PII_PATTERNS: [string, RegExp][] = [
  ['email', /[^\s@]+@[^\s@]+\.[a-z]{2,}/i],
  ['phone', /(?<!\d)(?:\+84|0)[35789](?:[\s.-]?\d){8}(?!\d)/],
  ['id', /(?<!\d)0\d{11}(?!\d)/],
]

interface ColumnPlan {
  col: number
  config: ColumnConfig
}

interface SheetPlan {
  name: string
  headerRow: number
  lastRow: number
  columns: ColumnPlan[]
  /** Columns not selected for masking, scanned for leftover PII. */
  unmasked: { col: number; header: string }[]
}

function planSheets(wb: XLSX.WorkBook, byKey: Map<string, ColumnConfig>): SheetPlan[] {
  const plans: SheetPlan[] = []
  for (const name of wb.SheetNames) {
    const h = headersOf(wb.Sheets[name])
    if (!h) continue
    const plan: SheetPlan = { name, headerRow: h.headerRow, lastRow: h.lastRow, columns: [], unmasked: [] }
    h.headers.forEach((header, i) => {
      const col = h.firstCol + i
      const config = byKey.get(columnKey(header, col))
      if (config) plan.columns.push({ col, config })
      else plan.unmasked.push({ col, header })
    })
    plans.push(plan)
  }
  return plans
}

/** Codes are written as `PREFIX_0001`; a prefix is "code mode" unless it is a multiplied/rounded money column. */
function isCodeMode(c: ColumnConfig): boolean {
  return c.type !== 'money' || c.moneyMode === 'code'
}

/**
 * Mask the selected columns of a workbook in place and return the mapping needed to
 * undo it. Columns are matched by header text in every sheet, so equal values get equal
 * codes everywhere. Codes are numbered in order of first appearance (sheet, row, column).
 */
export function maskWorkbook(wb: XLSX.WorkBook, configs: ColumnConfig[], opts: MaskOptions): MaskResult {
  const enabled = configs.filter((c) => c.enabled)
  if (enabled.length === 0) throw new MaskError('no-columns')
  const bad = enabled.filter((c) => isCodeMode(c) && !isValidPrefix(c.prefix)).map((c) => c.prefix || c.header)
  if (bad.length) throw new MaskError('bad-prefix', bad)

  const byKey = new Map(enabled.map((c) => [c.key, c]))
  const plans = planSheets(wb, byKey)
  const codePrefixes = [...new Set(enabled.filter(isCodeMode).map((c) => c.prefix))]

  // Refuse to mask if the original data already contains text that looks like one of
  // our codes: unmasking would later replace it with something else.
  if (codePrefixes.length) {
    const re = codeRegex(codePrefixes)
    const hits: string[] = []
    for (const plan of plans) {
      const rows = rowsOf(wb.Sheets[plan.name])
      for (let r = plan.headerRow; r <= plan.lastRow && hits.length < 5; r++) {
        const row = rows[r]
        if (!row) continue
        for (let c = 0; c < row.length && hits.length < 5; c++) {
          const cell = row[c]
          if (cell?.t !== 's') continue
          const m = cellText(cell).match(re)
          if (m) hits.push(`${plan.name}!${colLetter(c)}${r + 1}: ${m[0]}`)
        }
      }
    }
    if (hits.length) throw new MaskError('collision', hits)
  }

  const random = opts.random ?? cryptoRandom
  const hasMultiply = enabled.some((c) => c.type === 'money' && c.moneyMode === 'multiply')
  const factor = hasMultiply ? randomFactor(random) : 1

  const totalRows = plans.reduce((n, p) => n + (p.lastRow - p.headerRow), 0) * 2
  let doneRows = 0
  let lastReported = 0
  const tick = () => {
    doneRows++
    if (opts.onProgress && doneRows - lastReported >= PROGRESS_STEP) {
      lastReported = doneRows
      opts.onProgress(doneRows, totalRows)
    }
  }

  // Pass 1: assign a number to every distinct value, per prefix, in order of appearance.
  const indexByPrefix = new Map<string, Map<string, number>>()
  const entriesByPrefix = new Map<string, StoredValue[]>()
  for (const p of codePrefixes) {
    indexByPrefix.set(p, new Map())
    entriesByPrefix.set(p, [])
  }
  for (const plan of plans) {
    const rows = rowsOf(wb.Sheets[plan.name])
    const codeCols = plan.columns.filter((pc) => isCodeMode(pc.config))
    for (let r = plan.headerRow + 1; r <= plan.lastRow; r++) {
      const row = rows[r]
      if (row) {
        for (const { col, config } of codeCols) {
          const cell = row[col]
          const text = cellText(cell)
          if (text.trim() === '') continue
          const key = valueKey(config.type, text)
          const index = indexByPrefix.get(config.prefix)!
          if (!index.has(key)) {
            index.set(key, index.size + 1)
            entriesByPrefix.get(config.prefix)!.push(toStored(cell!))
          }
        }
      }
      tick()
    }
  }

  const dictionaries: Record<string, Dictionary> = {}
  for (const p of codePrefixes) {
    const entries = entriesByPrefix.get(p)!
    dictionaries[p] = { width: Math.max(4, String(entries.length).length), entries }
  }

  // Pass 2: write codes / transformed amounts.
  const cellsByPrefix = new Map<string, number>()
  const warnings: MaskWarning[] = []
  const mappingColumns: MappingColumn[] = []
  let maskedCells = 0

  for (const plan of plans) {
    const rows = rowsOf(wb.Sheets[plan.name])
    for (const { col, config } of plan.columns) {
      mappingColumns.push({
        sheet: plan.name,
        header: config.header,
        column: colLetter(col),
        type: config.type,
        prefix: config.prefix,
        ...(config.type === 'money' ? { moneyMode: config.moneyMode } : {}),
      })
    }
    const nonNumeric = new Map<number, number>()
    for (let r = plan.headerRow + 1; r <= plan.lastRow; r++) {
      const row = rows[r]
      if (row) {
        for (const { col, config } of plan.columns) {
          const cell = row[col]
          if (cellText(cell).trim() === '') continue
          let out: Cell | null = null
          if (isCodeMode(config)) {
            const n = indexByPrefix.get(config.prefix)!.get(valueKey(config.type, cellText(cell)))!
            out = textCell(formatCode(config.prefix, n, dictionaries[config.prefix].width))
            cellsByPrefix.set(config.prefix, (cellsByPrefix.get(config.prefix) ?? 0) + 1)
          } else {
            const value = cellNumber(cell)
            if (value === null) {
              nonNumeric.set(col, (nonNumeric.get(col) ?? 0) + 1)
              continue
            }
            const masked = config.moneyMode === 'multiply' ? value * factor : roundSignificant(value)
            out = numberCell(masked, cell!.z)
          }
          row[col] = out
          maskedCells++
        }
      }
      tick()
    }
    for (const [col, count] of nonNumeric) {
      const header = plan.columns.find((pc) => pc.col === col)!.config.header
      warnings.push({ kind: 'money-non-numeric', sheet: plan.name, header, count })
    }

    // Look for obvious personal data in columns that were left as they are.
    for (const { col, header } of plan.unmasked) {
      const counts = new Map<string, number>()
      for (let r = plan.headerRow + 1; r <= plan.lastRow; r++) {
        const cell = rows[r]?.[col]
        if (cell?.t !== 's') continue
        const text = cellText(cell)
        for (const [kind, re] of PII_PATTERNS) {
          if (re.test(text)) {
            counts.set(kind, (counts.get(kind) ?? 0) + 1)
            break
          }
        }
      }
      for (const [kind, count] of counts) {
        warnings.push({ kind: 'pii-unmasked', sheet: plan.name, header: header || colLetter(col), count, detail: kind })
      }
    }
  }

  stripWorkbook(wb)
  opts.onProgress?.(totalRows, totalRows)

  const moneyCols = enabled.filter((c) => c.type === 'money' && c.moneyMode !== 'code')
  const mapping: MappingFile = {
    format: MAPPING_FORMAT,
    version: MAPPING_VERSION,
    warning: MAPPING_WARNING,
    createdAt: (opts.now ?? new Date()).toISOString(),
    sourceFile: opts.sourceFile,
    outputFormat: opts.outputFormat,
    columns: mappingColumns,
    dictionaries,
    ...(moneyCols.length
      ? {
          money: {
            factor,
            multipliedHeaders: moneyCols.filter((c) => c.moneyMode === 'multiply').map((c) => c.key),
            roundedHeaders: moneyCols.filter((c) => c.moneyMode === 'round').map((c) => c.key),
          },
        }
      : {}),
  }

  const stats = codePrefixes.map((prefix) => ({
    prefix,
    unique: dictionaries[prefix].entries.length,
    cells: cellsByPrefix.get(prefix) ?? 0,
  }))

  return { mapping, stats, warnings, maskedCells }
}
