import { unzipSync, zipSync } from 'fflate'
import * as XLSX from 'xlsx'
import { formatOf, type FileFormat } from './fileName'
import { trimRange } from './sheet'

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
 * Sheet ranges are trimmed to the cells that hold data (see `trimRange`).
 */
export function readWorkbook(data: ArrayBuffer | Uint8Array, fileName: string): { wb: XLSX.WorkBook; format: FileFormat } {
  const format = formatOf(fileName)
  const wb =
    format === 'csv'
      ? XLSX.read(decodeText(data), { type: 'string', raw: true, dense: true })
      : XLSX.read(data, { type: 'array', dense: true, cellNF: true, cellDates: false })
  for (const name of wb.SheetNames) trimRange(wb.Sheets[name])
  return { wb, format }
}

/** Serialize a workbook. CSV gets a UTF-8 BOM so Excel shows Vietnamese correctly. */
export function writeWorkbook(wb: XLSX.WorkBook, format: FileFormat): Uint8Array {
  if (format === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]], { blankrows: true })
    return new TextEncoder().encode('\uFEFF' + csv)
  }
  // SheetJS's own DEFLATE compresses about 3× worse than Excel, which made masked files
  // bigger than the original. Re-zip its output with fflate. (Asking SheetJS for an
  // uncompressed file instead is much slower to write.)
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
  return zipSync(unzipSync(new Uint8Array(out)), { level: 6 })
}
