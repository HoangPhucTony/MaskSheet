import type * as XLSX from 'xlsx'
import { shiftTextDate } from './dates'
import { escapeRegex, PROGRESS_STEP } from './masker'
import type { MappingFile } from './mapping'
import { divideBack } from './money'
import { columnKey } from './normalize'
import { cellNumber, cellText, fromStored, headersOf, numberCell, rowsOf, textCell } from './sheet'
import type { StoredValue } from './types'

export interface UnmaskStats {
  /** Number of codes / fake values replaced by their original value. */
  replaced: number
  /** Codes that look valid but are not in the mapping (e.g. invented by the AI). */
  unknown: string[]
  /** Number of amount cells divided back by the secret factor. */
  divided: number
  /** Number of date cells shifted back. */
  shifted: number
}

export interface Unmasker {
  /** Original value for a whole token (code or fake value), or undefined. */
  lookupToken(token: string): StoredValue | undefined
  /** Replace every code / fake value in a piece of text with the original display text. */
  replaceText(text: string, stats: UnmaskStats): string
}

export function emptyStats(): UnmaskStats {
  return { replaced: 0, unknown: [], divided: 0, shifted: 0 }
}

// Tokens must not touch letters, digits or "_" on either side, so NAME_0001 is not
// found inside MY_NAME_0001 and "Trần An" is not found inside "Trần Anh".
const BEFORE = '(?<![\\p{L}\\p{N}_])'
const AFTER = '(?![\\p{L}\\p{N}_])'
const NEVER = '(?!)'

function alternation(items: string[]): string {
  return items.length ? [...new Set(items)].sort((a, b) => b.length - a.length).map(escapeRegex).join('|') : NEVER
}

export function createUnmasker(mapping: MappingFile): Unmasker {
  const codeDicts = new Map<string, StoredValue[]>()
  const fakes = new Map<string, StoredValue>()
  for (const [key, dict] of Object.entries(mapping.dictionaries)) {
    if (dict.fakes) dict.fakes.forEach((fake, i) => fakes.set(fake, dict.entries[i]))
    else codeDicts.set(key, dict.entries)
  }

  // Group 1+2: PREFIX and number of a code. Group 3: a fake value.
  const body = `(?:(${alternation([...codeDicts.keys()])})_(\\d+)|(${alternation([...fakes.keys()])}))`
  const re = new RegExp(BEFORE + body + AFTER, 'gu')
  const exact = new RegExp(`^${body}$`, 'u')
  const unknownSeen = new Set<string>()

  const resolve = (m: RegExpExecArray | string[]): StoredValue | undefined =>
    m[3] !== undefined ? fakes.get(m[3]) : codeDicts.get(m[1])?.[Number(m[2]) - 1]

  return {
    lookupToken(token) {
      const m = exact.exec(token)
      return m ? resolve(m) : undefined
    },
    replaceText(text, stats) {
      return text.replace(re, (...args: string[]) => {
        const token = args[0]
        const entry = resolve(args)
        if (!entry) {
          if (!unknownSeen.has(token)) {
            unknownSeen.add(token)
            stats.unknown.push(token)
          }
          return token
        }
        stats.replaced++
        return entry.w
      })
    },
  }
}

/** Replace codes and fake values in free text (e.g. an AI's answer). */
export function unmaskText(text: string, mapping: MappingFile): { text: string; stats: UnmaskStats } {
  const stats = emptyStats()
  return { text: createUnmasker(mapping).replaceText(text, stats), stats }
}

/**
 * Restore a workbook in place. A cell that is exactly one code / fake value gets its
 * original typed value back (number, date...); tokens inside longer text are replaced by
 * display text. Columns whose header matches a multiplied amount column are divided by
 * the factor, and shifted date columns are shifted back.
 */
export function unmaskWorkbook(
  wb: XLSX.WorkBook,
  mapping: MappingFile,
  onProgress?: (done: number, total: number) => void,
): UnmaskStats {
  const stats = emptyStats()
  const unmasker = createUnmasker(mapping)
  const multiplied = new Set(mapping.money?.multipliedHeaders ?? [])
  const shifted = new Set(mapping.dates?.shiftedHeaders ?? [])
  const factor = mapping.money?.factor ?? 1
  const offset = mapping.dates?.offsetDays ?? 0

  const sheets = wb.SheetNames.map((name) => ({ name, h: headersOf(wb.Sheets[name]) }))
  const total = sheets.reduce((n, s) => n + (s.h ? s.h.lastRow - s.h.headerRow + 1 : 0), 0)
  let done = 0

  for (const { name, h } of sheets) {
    if (!h) continue
    const rows = rowsOf(wb.Sheets[name])
    const columnMode = new Map<number, 'money' | 'date'>()
    h.headers.forEach((header, i) => {
      const key = columnKey(header, h.firstCol + i)
      if (multiplied.has(key)) columnMode.set(h.firstCol + i, 'money')
      else if (shifted.has(key)) columnMode.set(h.firstCol + i, 'date')
    })

    for (let r = h.headerRow; r <= h.lastRow; r++) {
      const row = rows[r]
      if (row) {
        for (let c = 0; c < row.length; c++) {
          const cell = row[c]
          if (!cell) continue
          const mode = r > h.headerRow ? columnMode.get(c) : undefined
          if (mode === 'money') {
            const value = cellNumber(cell)
            if (value !== null) {
              row[c] = numberCell(divideBack(value, factor), cell.z)
              stats.divided++
              continue
            }
          } else if (mode === 'date') {
            if (cell.t === 'n' && typeof cell.v === 'number') {
              row[c] = numberCell(cell.v - offset, cell.z)
              stats.shifted++
              continue
            }
            const back = cell.t === 's' ? shiftTextDate(cellText(cell), -offset) : null
            if (back !== null) {
              row[c] = textCell(back)
              stats.shifted++
              continue
            }
          }
          if (cell.t !== 's') continue
          const text = cellText(cell)
          const entry = unmasker.lookupToken(text.trim())
          if (entry) {
            row[c] = fromStored(entry)
            stats.replaced++
            continue
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
