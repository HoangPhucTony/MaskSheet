/** Date helpers for Excel serial numbers and common text formats. Free of SheetJS. */

const DAY_MS = 86_400_000
// Excel's day 0 for serials after 1900-03-01 (the 1900 leap-year bug is ignored).
const EXCEL_EPOCH = Date.UTC(1899, 11, 30)

export interface Ymd {
  y: number
  m: number
  d: number
}

export function serialToYmd(serial: number): Ymd {
  const date = new Date(EXCEL_EPOCH + Math.floor(serial) * DAY_MS)
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function monthLabel({ y, m }: Ymd): string {
  return `${pad2(m)}/${y}`
}

interface TextDate extends Ymd {
  format: (ymd: Ymd) => string
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
// Day first, as written in Vietnam: 01/10/2026, 1-10-2026, 01.10.2026
const DMY_RE = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/

function valid({ y, m, d }: Ymd): boolean {
  if (m < 1 || m > 12 || d < 1) return false
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** Parse a text date and remember how to write a date back in the same style. */
export function parseTextDate(text: string): TextDate | null {
  const s = text.trim()
  let m = ISO_RE.exec(s)
  if (m) {
    const ymd = { y: +m[1], m: +m[2], d: +m[3] }
    return valid(ymd) ? { ...ymd, format: (v) => `${v.y}-${pad2(v.m)}-${pad2(v.d)}` } : null
  }
  m = DMY_RE.exec(s)
  if (m) {
    const [, dd, sep, mm] = m
    const ymd = { y: +m[4], m: +mm, d: +dd }
    // "01/10/2026" or "31/12/2026" → always 2 digits; "1/10/2026" → no padding.
    const pad = dd.length === 2 && mm.length === 2
    const format = (v: Ymd) => (pad ? `${pad2(v.d)}${sep}${pad2(v.m)}${sep}${v.y}` : `${v.d}${sep}${v.m}${sep}${v.y}`)
    return valid(ymd) ? { ...ymd, format } : null
  }
  return null
}

export function isTextDate(text: string): boolean {
  return parseTextDate(text) !== null
}

function addDays({ y, m, d }: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS)
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

/** Shift a text date by `days`, keeping its format; null if it is not a date. */
export function shiftTextDate(text: string, days: number): string | null {
  const parsed = parseTextDate(text)
  return parsed ? parsed.format(addDays(parsed, days)) : null
}

export function monthOfText(text: string): string | null {
  const parsed = parseTextDate(text)
  return parsed ? monthLabel(parsed) : null
}

/** A secret offset of 30–400 days, forwards or backwards. */
export function randomOffsetDays(random: () => number): number {
  const days = 30 + Math.floor(random() * 371)
  return random() < 0.5 ? -days : days
}
