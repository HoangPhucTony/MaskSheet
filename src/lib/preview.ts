import { monthOfText } from './dates'
import { canFake, makeFaker } from './fake'
import { fakeDictionaryKey, formatCode } from './mapping'
import { parseNumber, rangeLabel, roundSignificant } from './money'
import { valueKey } from './normalize'
import { partialMask, REDACTED } from './partial'
import type { ColumnConfig } from './types'

/** Small deterministic PRNG so previews do not change on every render. */
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31
    return s / 2 ** 31
  }
}

/**
 * Approximate what a cell will look like once masked, for the on-screen preview.
 * Code numbers and fake values are assigned in the order the preview asks for them,
 * so they can differ from the final file. Secret factors are shown as markers.
 */
export function createPreviewer(): (cfg: ColumnConfig, text: string) => string {
  const codes = new Map<string, Map<string, number>>()
  const fakes = new Map<string, { next: () => string; seen: Map<string, string> }>()

  return (cfg, text) => {
    if (text.trim() === '') return text
    switch (cfg.method) {
      case 'code': {
        const dict = codes.get(cfg.prefix) ?? new Map<string, number>()
        codes.set(cfg.prefix, dict)
        const key = valueKey(cfg.type, text)
        if (!dict.has(key)) dict.set(key, dict.size + 1)
        return formatCode(cfg.prefix || 'X', dict.get(key)!, 4)
      }
      case 'fake': {
        if (!canFake(cfg.type)) return text
        const dictKey = fakeDictionaryKey(cfg.type)
        let f = fakes.get(dictKey)
        if (!f) {
          f = { next: makeFaker(cfg.type, seededRandom(dictKey.length * 7919), () => false), seen: new Map() }
          fakes.set(dictKey, f)
        }
        const key = valueKey(cfg.type, text)
        if (!f.seen.has(key)) f.seen.set(key, f.next())
        return f.seen.get(key)!
      }
      case 'partial':
        return partialMask(cfg.type, text)
      case 'redact':
        return REDACTED
      case 'multiply':
        return `${text} ×k`
      case 'round': {
        const n = parseNumber(text)
        return n === null ? text : roundSignificant(n).toLocaleString('en-US')
      }
      case 'range': {
        const n = parseNumber(text)
        return n === null ? text : rangeLabel(n)
      }
      case 'shift':
        return `${text} ±n`
      case 'month':
        return monthOfText(text) ?? 'MM/YYYY'
    }
  }
}
