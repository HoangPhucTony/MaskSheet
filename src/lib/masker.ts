import type * as XLSX from 'xlsx'
import { monthLabel, monthOfText, randomOffsetDays, serialToYmd, shiftTextDate } from './dates'
import { canFake, makeFaker } from './fake'
import {
  MAPPING_FORMAT,
  MAPPING_VERSION,
  MAPPING_WARNING,
  fakeDictionaryKey,
  formatCode,
  type Dictionary,
  type MappingColumn,
  type MappingFile,
} from './mapping'
import { randomFactor, rangeLabel, roundSignificant } from './money'
import { colLetter, columnKey, isValidPrefix, valueKey } from './normalize'
import { partialMask, REDACTED } from './partial'
import { cellNumber, cellText, headersOf, numberCell, rowsOf, stripWorkbook, textCell, toStored, type Cell } from './sheet'
import { METHODS, type ColumnConfig, type DataType, type MaskWarning, type StoredValue } from './types'

export interface MaskOptions {
  sourceFile: string
  outputFormat: 'xlsx' | 'csv'
  /** Uniform random in [0, 1). Defaults to crypto.getRandomValues. */
  random?: () => number
  /** Called with (rowsDone, rowsTotal), at most once per PROGRESS_STEP rows. */
  onProgress?: (done: number, total: number) => void
  now?: Date
}

export interface DictionaryStats {
  key: string
  method: 'code' | 'fake'
  type: DataType
  unique: number
  cells: number
}

export interface MaskResult {
  mapping: MappingFile
  stats: DictionaryStats[]
  warnings: MaskWarning[]
  maskedCells: number
}

export const PROGRESS_STEP = 1000

export class MaskError extends Error {
  constructor(
    public code: 'no-columns' | 'bad-prefix' | 'bad-method' | 'collision',
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

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Regex matching codes like PREFIX_0001 for any of the given prefixes, as whole tokens. */
export function codeRegex(prefixes: string[]): RegExp {
  const alts = [...new Set(prefixes)].sort((a, b) => b.length - a.length).map(escapeRegex)
  return new RegExp(`(?<![A-Za-z0-9_])(${alts.join('|')})_(\\d+)(?![A-Za-z0-9_])`, 'g')
}

/** Dictionary a column writes into, or null for methods without one. */
export function dictionaryKey(c: ColumnConfig): string | null {
  if (c.method === 'code') return c.prefix
  if (c.method === 'fake') return fakeDictionaryKey(c.type)
  return null
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

function validate(enabled: ColumnConfig[]) {
  if (enabled.length === 0) throw new MaskError('no-columns')
  const badMethod = enabled.filter((c) => !METHODS[c.type].includes(c.method) || (c.method === 'fake' && !canFake(c.type)))
  if (badMethod.length) throw new MaskError('bad-method', badMethod.map((c) => c.header))
  const badPrefix = enabled
    .filter((c) => c.method === 'code' && (!isValidPrefix(c.prefix) || c.prefix.startsWith('FAKE_')))
    .map((c) => c.prefix || c.header)
  if (badPrefix.length) throw new MaskError('bad-prefix', badPrefix)
}

/** Refuse to mask if the data already contains text that looks like one of our codes. */
function checkCollisions(wb: XLSX.WorkBook, plans: SheetPlan[], prefixes: string[]) {
  if (!prefixes.length) return
  const re = codeRegex(prefixes)
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

/**
 * Mask the selected columns of a workbook in place and return the mapping needed to
 * undo the reversible methods. Columns are matched by header text in every sheet, so
 * equal values get equal codes everywhere. Codes are numbered in order of first
 * appearance (sheet, row, column).
 */
export function maskWorkbook(wb: XLSX.WorkBook, configs: ColumnConfig[], opts: MaskOptions): MaskResult {
  const enabled = configs.filter((c) => c.enabled)
  validate(enabled)

  const byKey = new Map(enabled.map((c) => [c.key, c]))
  const plans = planSheets(wb, byKey)
  checkCollisions(wb, plans, [...new Set(enabled.filter((c) => c.method === 'code').map((c) => c.prefix))])

  const random = opts.random ?? cryptoRandom
  const factor = enabled.some((c) => c.method === 'multiply') ? randomFactor(random) : 1
  const offsetDays = enabled.some((c) => c.method === 'shift') ? randomOffsetDays(random) : 0

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

  // Pass 1: number every distinct value per dictionary, in order of appearance.
  const dicts = new Map<string, { method: 'code' | 'fake'; type: DataType; index: Map<string, number>; entries: StoredValue[] }>()
  for (const c of enabled) {
    const key = dictionaryKey(c)
    if (key && !dicts.has(key)) dicts.set(key, { method: c.method as 'code' | 'fake', type: c.type, index: new Map(), entries: [] })
  }
  for (const plan of plans) {
    const rows = rowsOf(wb.Sheets[plan.name])
    const dictCols = plan.columns.flatMap(({ col, config }) => {
      const key = dictionaryKey(config)
      return key ? [{ col, config, dict: dicts.get(key)! }] : []
    })
    for (let r = plan.headerRow + 1; r <= plan.lastRow; r++) {
      const row = rows[r]
      if (row) {
        for (const { col, config, dict } of dictCols) {
          const cell = row[col]
          const text = cellText(cell)
          if (text.trim() === '') continue
          const key = valueKey(config.type, text)
          if (!dict.index.has(key)) {
            dict.index.set(key, dict.index.size + 1)
            dict.entries.push(toStored(cell!))
          }
        }
      }
      tick()
    }
  }

  const dictionaries: Record<string, Dictionary> = {}
  for (const [key, d] of dicts) {
    const dict: Dictionary = { width: Math.max(4, String(d.entries.length).length), entries: d.entries }
    if (d.method === 'fake' && canFake(d.type)) {
      // A fake value must never equal a real one, or restoring would be ambiguous.
      const type = d.type
      const next = makeFaker(type, random, (v) => d.index.has(valueKey(type, v)))
      dict.fakes = d.entries.map(() => next())
    }
    dictionaries[key] = dict
  }

  // Pass 2: write the masked values.
  const cellsByDict = new Map<string, number>()
  const warnings: MaskWarning[] = []
  const mappingColumns: MappingColumn[] = []
  let maskedCells = 0

  const transform = (config: ColumnConfig, cell: Cell, text: string): Cell | 'skip-number' | 'skip-date' => {
    switch (config.method) {
      case 'code':
      case 'fake': {
        const key = dictionaryKey(config)!
        const dict = dictionaries[key]
        const n = dicts.get(key)!.index.get(valueKey(config.type, text))!
        cellsByDict.set(key, (cellsByDict.get(key) ?? 0) + 1)
        return textCell(dict.fakes ? dict.fakes[n - 1] : formatCode(key, n, dict.width))
      }
      case 'partial':
        return textCell(partialMask(config.type, text))
      case 'redact':
        return textCell(REDACTED)
      case 'multiply':
      case 'round':
      case 'range': {
        const value = cellNumber(cell)
        if (value === null) return 'skip-number'
        if (config.method === 'range') return textCell(rangeLabel(value))
        return numberCell(config.method === 'multiply' ? value * factor : roundSignificant(value), cell.z)
      }
      case 'shift': {
        if (cell.t === 'n' && typeof cell.v === 'number') return numberCell(cell.v + offsetDays, cell.z)
        const shifted = shiftTextDate(text, offsetDays)
        return shifted === null ? 'skip-date' : textCell(shifted)
      }
      case 'month': {
        if (cell.t === 'n' && typeof cell.v === 'number') return textCell(monthLabel(serialToYmd(cell.v)))
        const month = monthOfText(text)
        return month === null ? 'skip-date' : textCell(month)
      }
    }
  }

  for (const plan of plans) {
    const rows = rowsOf(wb.Sheets[plan.name])
    for (const { col, config } of plan.columns) {
      const dictionary = dictionaryKey(config)
      mappingColumns.push({
        sheet: plan.name,
        header: config.header,
        column: colLetter(col),
        type: config.type,
        method: config.method,
        ...(dictionary ? { dictionary } : {}),
      })
    }
    const skipped = new Map<number, { count: number; detail: string }>()
    for (let r = plan.headerRow + 1; r <= plan.lastRow; r++) {
      const row = rows[r]
      if (row) {
        for (const { col, config } of plan.columns) {
          const cell = row[col]
          const text = cellText(cell)
          if (text.trim() === '') continue
          const out = transform(config, cell!, text)
          if (typeof out === 'string') {
            const s = skipped.get(col) ?? { count: 0, detail: out === 'skip-number' ? 'number' : 'date' }
            s.count++
            skipped.set(col, s)
            continue
          }
          row[col] = out
          maskedCells++
        }
      }
      tick()
    }
    for (const [col, { count, detail }] of skipped) {
      const header = plan.columns.find((pc) => pc.col === col)!.config.header
      warnings.push({ kind: 'skipped', sheet: plan.name, header, count, detail })
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

  const keysWith = (method: string) => enabled.filter((c) => c.method === method).map((c) => c.key)
  const mapping: MappingFile = {
    format: MAPPING_FORMAT,
    version: MAPPING_VERSION,
    warning: MAPPING_WARNING,
    createdAt: (opts.now ?? new Date()).toISOString(),
    sourceFile: opts.sourceFile,
    outputFormat: opts.outputFormat,
    columns: mappingColumns,
    dictionaries,
    ...(factor !== 1 ? { money: { factor, multipliedHeaders: keysWith('multiply') } } : {}),
    ...(offsetDays !== 0 ? { dates: { offsetDays, shiftedHeaders: keysWith('shift') } } : {}),
  }

  const stats: DictionaryStats[] = [...dicts].map(([key, d]) => ({
    key,
    method: d.method,
    type: d.type,
    unique: d.entries.length,
    cells: cellsByDict.get(key) ?? 0,
  }))

  return { mapping, stats, warnings, maskedCells }
}
