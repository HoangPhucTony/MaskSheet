/** Amount helpers. Kept free of SheetJS so the UI can use them without loading it. */

export function parseNumber(text: string): number | null {
  const s = text.replace(/\s/g, '')
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s)
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) return Number(s.replace(/,/g, ''))
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'))
  if (/^-?\d+,\d+$/.test(s)) return Number(s.replace(',', '.'))
  return null
}

/** A secret factor in [0.5, 0.9] ∪ [1.1, 2.0], 4 decimals, so values never stay nearly unchanged. */
export function randomFactor(random: () => number): number {
  const r = random()
  const f = r < 0.5 ? 0.5 + r * 0.8 : 1.1 + (r - 0.5) * 1.8
  return Math.round(f * 10000) / 10000
}

/** Round to `digits` significant digits: 7,425,000 → 7,400,000 (digits = 2). */
export function roundSignificant(value: number, digits = 2): number {
  if (value === 0 || !Number.isFinite(value)) return value
  const magnitude = Math.floor(Math.log10(Math.abs(value)))
  const scale = 10 ** (magnitude - digits + 1)
  return Math.round(value / scale) * scale
}

function groupThousands(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

/** Bucket an amount on a 1–2–5 scale: 7,425,000 → "5,000,000–10,000,000". */
export function rangeLabel(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return String(value)
  const abs = Math.abs(value)
  const base = 10 ** Math.floor(Math.log10(abs))
  const m = abs / base
  const lower = m >= 5 ? 5 : m >= 2 ? 2 : 1
  const upper = lower === 1 ? 2 : lower === 2 ? 5 : 10
  const sign = value < 0 ? '-' : ''
  return `${sign}${groupThousands(lower * base)}–${sign}${groupThousands(upper * base)}`
}

/** Real amount from a multiplied one. Rounded to 6 decimals to drop floating-point noise. */
export function divideBack(masked: number, factor: number): number {
  return Math.round((masked / factor) * 1e6) / 1e6
}
