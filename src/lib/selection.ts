/** Đếm số cột đang bật của mỗi sheet. Sheet không có cột nào bật thì là 0. */
export function selectionBySheet(
  sheets: { name: string; keys: string[] }[],
  configs: Record<string, { enabled: boolean }>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const sheet of sheets) {
    out[sheet.name] = sheet.keys.filter((key) => configs[key]?.enabled).length
  }
  return out
}

/**
 * Tóm tắt các cột đã chọn, ví dụ "T11: Họ tên, Doanh thu · T12: SĐT".
 * Tên cột là header; nếu header rỗng thì dùng chữ cái cột (phần trước "@" của key).
 * `max` giới hạn TỔNG số tên hiện ra trên mọi sheet; phần còn lại gộp thành một " +N" ở cuối.
 */
export function selectionSummary(
  selected: { sheet: string; header: string; key: string }[],
  opts: { withSheet: boolean; max?: number },
): string {
  const max = opts.max ?? 3
  const shown = selected.slice(0, max)
  const extra = selected.length - shown.length

  const groups = new Map<string, string[]>()
  for (const col of shown) {
    const name = col.header.trim() || col.key.split('@')[0]
    const groupKey = opts.withSheet ? col.sheet : ''
    const names = groups.get(groupKey) ?? []
    names.push(name)
    groups.set(groupKey, names)
  }

  const parts: string[] = []
  for (const [sheet, names] of groups) {
    parts.push(opts.withSheet ? `${sheet}: ${names.join(', ')}` : names.join(', '))
  }
  const suffix = extra > 0 ? ` +${extra}` : ''
  return parts.join(' · ') + suffix
}
