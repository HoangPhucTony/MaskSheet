import type { DataType } from '../lib/types'

/** A small symbol per data type, shown on type buttons and column chips. */
export const TYPE_ICON: Record<DataType, string> = {
  name: '👤',
  phone: '📞',
  email: '✉️',
  id: '🪪',
  address: '📍',
  org: '🏢',
  money: '💰',
  date: '📅',
  custom: '🔤',
}
