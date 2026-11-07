export type FileFormat = 'xlsx' | 'csv'

export function formatOf(fileName: string): FileFormat {
  return /\.(csv|tsv|txt)$/i.test(fileName) ? 'csv' : 'xlsx'
}

export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

/** "khach_masked.xlsx" → "khach_restored.xlsx" (also when the browser added " (1)"). */
export function restoredName(fileName: string, format: FileFormat): string {
  return `${baseName(fileName).replace(/_masked(?: \(\d+\))?$/, '')}_restored.${format}`
}
