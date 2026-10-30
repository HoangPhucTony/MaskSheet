import type * as XLSX from 'xlsx'
import { codeRegex, PROGRESS_STEP } from './masker'
import type { MappingFile } from './mapping'
import { divideBack } from './money'
import { columnKey } from './normalize'
import { cellNumber, cellText, fromStored, headersOf, numberCell, rowsOf, textCell } from './sheet'
import type { StoredValue } from './types'

export interface UnmaskStats {
  /** Number of codes replaced by their original value. */
  replaced: number
  /** Codes that look valid but are not in the mapping (e.g. invented by the AI). */
  unknown: string[]
  /** Number of money cells divided back by the secret factor. */
  divided: number
}

export interface Unmasker {
  /** Original value for a code, or undefined if it is not in the mapping. */
  lookup(prefix: string, n: number): StoredValue | undefined
  /** Replace every code in a piece of text with the original display text. */
  replaceText(text: string, stats: UnmaskStats): string
}

export function emptyStats(): UnmaskStats {
  return { replaced: 0, unknown: [], divided: 0 }
}

export function createUnmasker(mapping: MappingFile): Unmasker {
  const prefixes = Object.keys(mapping.dictionaries)
  const lookup = (prefix: string, n: number) => mapping.dictionaries[prefix]?.entries[n - 1]
  if (prefixes.length === 0) return { lookup, replaceText: (t) => t }
  const re = codeRegex(prefixes)
  const unknownSeen = new Set<string>()
  return {
    lookup,
    replaceText(text, stats) {
      return text.replace(re, (code, prefix: string, digits: string) => {
        const entry = lookup(prefix, Number(digits))
        if (!entry) {
          if (!unknownSeen.has(code)) {
            unknownSeen.add(code)
            stats.unknown.push(code)
          }
          return code
        }
        stats.replaced++
        return entry.w
      })
    },
  }
}

/** Replace codes in free text (e.g. an AI's answer). */
export function unmaskText(text: string, mapping: MappingFile): { text: string; stats: UnmaskStats } {
  const stats = emptyStats()
  return { text: createUnmasker(mapping).replaceText(text, stats), stats }
}

/**
 * Restore a workbook in place. A cell that is exactly one code gets its original typed
 * value back (number, date...); codes inside longer text are replaced by display text.
 * Columns whose header matches a multiplied money column are divided by the factor.
 */
export function unmaskWorkbook(
  wb: XLSX.WorkBook,
  mapping: MappingFile,
  onProgress?: (done: number, total: number) => void,
): UnmaskStats {
  const stats = emptyStats()
  const unmasker = createUnmasker(mapping)
  const prefixes = Object.keys(mapping.dictionaries)
  const exact = prefixes.length ? new RegExp(`^${codeRegex(prefixes).source}$`) : null
  const multiplied = new Set(mapping.money?.multipliedHeaders ?? [])
  const factor = mapping.money?.factor ?? 1

  const sheets = wb.SheetNames.map((name) => ({ name, h: headersOf(wb.Sheets[name]) }))
  const total = sheets.reduce((n, s) => n + (s.h ? s.h.lastRow - s.h.headerRow + 1 : 0), 0)
  let done = 0

  for (const { name, h } of sheets) {
    if (!h) continue
    const rows = rowsOf(wb.Sheets[name])
    const moneyCols = new Set<number>()
    h.headers.forEach((header, i) => {
      if (multiplied.has(columnKey(header, h.firstCol + i))) moneyCols.add(h.firstCol + i)
    })

    for (let r = h.headerRow; r <= h.lastRow; r++) {
      const row = rows[r]
      if (row) {
        for (let c = 0; c < row.length; c++) {
          const cell = row[c]
          if (!cell) continue
          if (r > h.headerRow && moneyCols.has(c)) {
            const value = cellNumber(cell)
            if (value !== null) {
              row[c] = numberCell(divideBack(value, factor), cell.z)
              stats.divided++
              continue
            }
          }
          if (cell.t !== 's') continue
          const text = cellText(cell)
          const m = exact?.exec(text.trim())
          if (m) {
            const entry = unmasker.lookup(m[1], Number(m[2]))
            if (entry) {
              row[c] = fromStored(entry)
              stats.replaced++
              continue
            }
          }
          const replaced = unmasker.replaceText(text, stats)
          if (replaced !== text) row[c] = textCell(replaced)
        }
      }
      done++
      if (onProgress && done % PROGRESS_STEP === 0) onProgress(done, total)
    }
  }
  onProgress?.(total, total)
  return stats
}
