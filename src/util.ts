import type { TKey, T } from './i18n'
import type { WorkerError } from './workers/protocol'

export const BIG_FILE_BYTES = 50 * 1024 * 1024

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

export function downloadBlob(data: BlobPart, fileName: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export const MIME = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv;charset=utf-8',
  json: 'application/json',
}

export function errorText(t: T, err: Pick<WorkerError, 'code' | 'details'>): string {
  const key = `err_${err.code.replace(/-/g, '_')}` as TKey
  return t(key, { details: err.details.join(', ') })
}

/** Ask before processing very large files. */
export function confirmBigFile(t: T, file: File): boolean {
  return file.size <= BIG_FILE_BYTES || window.confirm(t('bigFileWarning', { size: formatBytes(file.size) }))
}

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
