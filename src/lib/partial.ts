import { normalizePhone, normalizeSpace } from './normalize'
import type { DataType } from './types'

export const REDACTED = '***'

function stars(n: number): string {
  return '*'.repeat(Math.max(3, n))
}

/**
 * Hide part of a value but keep what is useful for analysis:
 * phone 091****678, email n***@gmail.com, name N. V. A., ID ********1234,
 * address "***, Hà Nội" (keeps the last part, usually the city), others "KH***".
 */
export function partialMask(type: DataType, text: string): string {
  const s = normalizeSpace(text)
  switch (type) {
    case 'phone': {
      const digits = normalizePhone(s)
      if (digits.length < 7) return stars(digits.length)
      return digits.slice(0, 3) + '*'.repeat(digits.length - 6) + digits.slice(-3)
    }
    case 'email': {
      const at = s.lastIndexOf('@')
      if (at < 1) return REDACTED
      return `${s[0]}***${s.slice(at)}`
    }
    case 'name':
      return initials(s)
    case 'id':
      return s.length <= 4 ? stars(s.length) : '*'.repeat(s.length - 4) + s.slice(-4)
    case 'address': {
      const parts = s.split(',').map((p) => p.trim()).filter(Boolean)
      return parts.length > 1 ? `${REDACTED}, ${parts[parts.length - 1]}` : REDACTED
    }
    default: {
      // Several words ("Miền Nam") → initials; one token ("KH001") → first 2 characters.
      if (s.includes(' ')) return initials(s)
      const chars = [...s]
      return chars.length <= 2 ? REDACTED : chars.slice(0, 2).join('') + REDACTED
    }
  }
}

/** "Nguyễn Văn An" → "N. V. A." */
function initials(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => [...w][0].toUpperCase() + '.')
    .join(' ')
}
