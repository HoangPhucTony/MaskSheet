import * as XLSX from 'xlsx'
import { formatOf, type FileFormat } from './fileName'

export type { FileFormat }

/** Decode CSV bytes: UTF-8 (with or without BOM), falling back to Vietnamese Windows-1258. */
export function decodeText(data: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('windows-1258').decode(data)
  }
}

/**
 * Read a workbook in dense mode. CSV is read with `raw: true` so values stay text:
 * "0912345678" must not turn into the number 912345678.
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): { wb: XLSX.WorkBook; format: FileFormat } {
  const format = formatOf(fileName)
  if (format === 'csv') {
    const wb = XLSX.read(decodeText(data), { type: 'string', raw: true, dense: true })
    return { wb, format }
  }
  const wb = XLSX.read(data, { type: 'array', dense: true, cellNF: true, cellDates: false })
  return { wb, format }
}

/** Serialize a workbook. CSV gets a UTF-8 BOM so Excel shows Vietnamese correctly. */
export function writeWorkbook(wb: XLSX.WorkBook, format: FileFormat): Uint8Array {
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { blankrows: true })
    return new TextEncoder().encode('\uFEFF' + csv)
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
  return new Uint8Array(out)
}
