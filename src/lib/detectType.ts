import { isTextDate } from './dates'
import { normalizePhone, normalizeSpace, sanitizePrefix, stripDiacritics, colLetter } from './normalize'
import { DEFAULT_PREFIX, type DataType } from './types'

export interface Detection {
  type: DataType
  /** What triggered the suggestion. */
  source: 'header' | 'content'
}

// Header keywords, matched as whole words on the lower-cased, diacritic-free header.
// Order matters: the first type with a hit wins (e.g. "ten cong ty" is an org, not a name).
const HEADER_RULES: [DataType, string[]][] = [
  ['email', ['email', 'e mail', 'mail', 'thu dien tu']],
  ['phone', ['sdt', 'so dt', 'dt di dong', 'dien thoai', 'di dong', 'phone', 'mobile', 'tel', 'telephone', 'hotline', 'zalo']],
  ['id', ['cccd', 'cmnd', 'cmt', 'can cuoc', 'chung minh', 'dinh danh', 'passport', 'ho chieu', 'national id', 'id card', 'ssn', 'mst', 'ma so thue', 'tax code']],
  ['date', ['ngay', 'ngay sinh', 'ngay thang', 'date', 'dob', 'birthday', 'birth date', 'thoi gian', 'deadline']],
  ['address', ['dia chi', 'address', 'addr', 'noi o', 'thuong tru', 'tam tru', 'cho o']],
  ['org', ['cong ty', 'cty', 'company', 'organization', 'organisation', 'to chuc', 'don vi', 'doanh nghiep', 'employer']],
  ['money', ['gia', 'don gia', 'tien', 'so tien', 'thanh tien', 'tong tien', 'doanh thu', 'doanh so', 'luong', 'chi phi', 'loi nhuan', 'price', 'amount', 'revenue', 'salary', 'cost', 'profit', 'income', 'vnd', 'usd']],
  ['name', ['ho ten', 'ho va ten', 'ten', 'ten khach hang', 'ten nhan vien', 'nguoi lien he', 'name', 'full name', 'fullname', 'customer', 'contact', 'nhan vien', 'khach hang']],
]

// Headers that contain a name keyword but are clearly not a person's name
// ("Mã khách hàng" is a code, "Tên sản phẩm" is a product).
const NOT_A_PERSON = ['ma', 'code', 'id', 'so luong', 'san pham', 'hang hoa', 'mat hang', 'product', 'item', 'file', 'sheet', 'danh muc', 'category']

function wordsOf(header: string): string {
  return ' ' + stripDiacritics(normalizeSpace(header)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + ' '
}

function hasPhrase(words: string, phrase: string): boolean {
  return words.includes(' ' + phrase + ' ')
}

export function detectFromHeader(header: string): DataType | null {
  const words = wordsOf(header)
  for (const [type, phrases] of HEADER_RULES) {
    if (!phrases.some((p) => hasPhrase(words, p))) continue
    if (type === 'name' && NOT_A_PERSON.some((p) => hasPhrase(words, p))) continue
    return type
  }
  return null
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Vietnamese mobile (03/05/07/08/09 + 8 digits) or landline (02 + 9 digits).
const VN_PHONE_RE = /^(0[35789]\d{8}|02\d{9})$/
// CCCD (12 digits) or old CMND (9 digits).
const VN_ID_RE = /^(\d{12}|\d{9})$/

export function isEmail(s: string): boolean {
  return EMAIL_RE.test(s.trim())
}

export function isVnPhone(s: string): boolean {
  return VN_PHONE_RE.test(normalizePhone(s.trim()))
}

export function isVnId(s: string): boolean {
  return VN_ID_RE.test(s.trim())
}

/** Share of non-empty samples that satisfy `test`; 0 when there are no samples. */
function ratio(samples: string[], test: (s: string) => boolean): number {
  const filled = samples.filter((s) => s.trim() !== '')
  if (filled.length === 0) return 0
  return filled.filter(test).length / filled.length
}

const CONTENT_THRESHOLD = 0.6

export interface ContentHints {
  /** Share of non-empty cells that are numbers with a date format (from the worker). */
  dateRatio?: number
}

export function detectFromContent(samples: string[], hints: ContentHints = {}): DataType | null {
  if (ratio(samples, isEmail) >= CONTENT_THRESHOLD) return 'email'
  if (ratio(samples, isVnPhone) >= CONTENT_THRESHOLD) return 'phone'
  if ((hints.dateRatio ?? 0) >= CONTENT_THRESHOLD || ratio(samples, isTextDate) >= CONTENT_THRESHOLD) return 'date'
  if (ratio(samples, isVnId) >= CONTENT_THRESHOLD) return 'id'
  return null
}

/**
 * Suggest a data type for a column from its header and a sample of its cell texts.
 * Content wins for email/phone/date because it is unambiguous; otherwise the header decides.
 */
export function detectType(header: string, samples: string[], hints: ContentHints = {}): Detection | null {
  const fromContent = detectFromContent(samples, hints)
  if (fromContent === 'email' || fromContent === 'phone' || fromContent === 'date') return { type: fromContent, source: 'content' }
  const fromHeader = detectFromHeader(header)
  if (fromHeader) return { type: fromHeader, source: 'header' }
  if (fromContent) return { type: fromContent, source: 'content' }
  return null
}

/** Default code prefix for a column. Custom columns get one derived from the header. */
export function suggestPrefix(type: DataType, header: string, colIndex: number): string {
  if (type !== 'custom') return DEFAULT_PREFIX[type]
  const fromHeader = sanitizePrefix(header)
  if (fromHeader.length >= 2 && fromHeader.length <= 16) return fromHeader
  return `COL_${colLetter(colIndex)}`
}
