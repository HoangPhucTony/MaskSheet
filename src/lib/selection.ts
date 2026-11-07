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
 * Quá `max` cột trong một nhóm thì chỉ hiện `max` cột đầu và thêm " +N".
 */
export function selectionSummary(
  selected: { sheet: string; header: string; key: string }[],
  opts: { withSheet: boolean; max?: number },
): string {
  const max = opts.max ?? 3
  const groups = new Map<string, string[]>()
  for (const col of selected) {
    const name = col.header.trim() || col.key.split('@')[0]
    const groupKey = opts.withSheet ? col.sheet : ''
    const names = groups.get(groupKey) ?? []
    names.push(name)
    groups.set(groupKey, names)
  }

  const parts: string[] = []
  for (const [sheet, names] of groups) {
    const shown = names.slice(0, max).join(', ')
    const extra = names.length > max ? ` +${names.length - max}` : ''
    parts.push(opts.withSheet ? `${sheet}: ${shown}${extra}` : `${shown}${extra}`)
  }
  return parts.join(' · ')
}
