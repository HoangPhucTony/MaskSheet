import type { DataType } from './types'

/** Remove Vietnamese (and other) diacritics: "Họ tên" → "Ho ten", "Đ" → "D". */
export function stripDiacritics(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
}

/** NFC-normalize, trim, and collapse any run of whitespace to a single space. */
export function normalizeSpace(s: string): string {
  return s.normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** Strip separators and turn +84 / 84 into a leading 0. */
export function normalizePhone(s: string): string {
  let digits = s.replace(/[\s.\-()]/g, '')
  if (digits.startsWith('+84')) digits = '0' + digits.slice(3)
  else if (/^84\d{9}$/.test(digits)) digits = '0' + digits.slice(2)
  return digits
}

/**
 * The dictionary key for a cell's text. Two cells get the same code exactly when
 * their keys are equal, so this is where "same value" is defined per data type.
 */
export function valueKey(type: DataType, text: string): string {
  const base = normalizeSpace(text)
  switch (type) {
    case 'email':
      return base.toLowerCase()
    case 'phone':
      return normalizePhone(base)
    default:
      return base
  }
}

/** Key used to match the same column across sheets. */
export function headerKey(header: string): string {
  return normalizeSpace(header).toLowerCase()
}

/** Config key of a column: its header key, or its letter when the header is empty. */
export function columnKey(header: string, colIndex: number): string {
  return headerKey(header) || `#${colLetter(colIndex)}`
}

/** Column index (0-based) → Excel letter: 0 → A, 26 → AA. */
export function colLetter(index: number): string {
  let s = ''
  let n = index + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

const PREFIX_RE = /^[A-Z][A-Z0-9_]{0,23}$/

/** A valid prefix: starts with a letter, then uppercase letters, digits or underscores. */
export function isValidPrefix(prefix: string): boolean {
  return PREFIX_RE.test(prefix) && !prefix.endsWith('_')
}

/** Turn arbitrary user input into a valid prefix (best effort). */
export function sanitizePrefix(input: string): string {
  const s = stripDiacritics(input)
    .toUpperCase()
    .replace(/[^A-Z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_0-9]+|_+$/g, '')
  return s.slice(0, 24).replace(/_+$/, '')
}
