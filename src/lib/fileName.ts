export type FileFormat = 'xlsx' | 'csv'

export function formatOf(fileName: string): FileFormat {
  return /\.(csv|tsv|txt)$/i.test(fileName) ? 'csv' : 'xlsx'
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}
