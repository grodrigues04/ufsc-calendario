const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
const weekdayShortFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const weekdayLongFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' })
const dayMonthFormat = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' })
const longDateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const percentFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })
const percentPreciseFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export const DAY_MS = 86_400_000

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

/** Calendar-day difference (to - from), ignoring the time of day. */
export function dayDiff(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS)
}

export function isSameDay(a: Date, b: Date): boolean {
  return dayDiff(a, b) === 0
}

export function formatTime(date: Date): string {
  return timeFormat.format(date)
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTime(start)}–${formatTime(end)}`
}

/** "qua" */
export function weekdayShort(date: Date): string {
  return weekdayShortFormat.format(date).replace('.', '')
}

/** "quarta" */
export function weekdayName(date: Date): string {
  return weekdayLongFormat.format(date).replace('-feira', '')
}

/** "25/11" */
export function formatDayMonth(date: Date): string {
  return dayMonthFormat.format(date)
}

/** "terça-feira, 24 de novembro" */
export function formatLongDate(date: Date): string {
  return longDateFormat.format(date)
}

/** "hoje", "amanhã", "quarta", "seg 30/11" */
export function formatRelativeDay(date: Date, now: Date): string {
  const diff = dayDiff(now, date)
  if (diff === 0) return 'hoje'
  if (diff === 1) return 'amanhã'
  if (diff === -1) return 'ontem'
  if (diff > 1 && diff < 7) return weekdayName(date)
  return `${weekdayShort(date)} ${formatDayMonth(date)}`
}

/** "hoje, 23:59", "amanhã, 23:59", "sexta, 23:59", "seg 07/12, 23:59" */
export function formatDue(date: Date, now: Date): string {
  return `${formatRelativeDay(date, now)}, ${formatTime(date)}`
}

/** "em 25 min", "em 3 h", "em 2 dias", "há 3 dias" */
export function formatDistance(date: Date, now: Date): string {
  const diffMs = date.getTime() - now.getTime()
  const minutes = Math.round(Math.abs(diffMs) / 60_000)
  const prefix = diffMs >= 0 ? 'em' : 'há'
  if (minutes < 60) return `${prefix} ${Math.max(1, minutes)} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${prefix} ${hours} h`
  const days = Math.abs(dayDiff(now, date))
  return `${prefix} ${days} ${days === 1 ? 'dia' : 'dias'}`
}

export function formatPercent(value: number | null, precise = false): string {
  if (value === null || Number.isNaN(value)) return '—'
  return `${(precise ? percentPreciseFormat : percentFormat).format(value)}%`
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 || count === -1 ? singular : pluralForm}`
}

export function formatSyncedAgo(iso: string | undefined, now: Date): string {
  if (!iso) return 'nunca'
  const minutes = Math.round((now.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `em ${formatDayMonth(new Date(iso))}`
}

const dayCountFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

/** "5", "4,5" (half a class day when one class of the day was missed). */
export function formatDayCount(days: number): string {
  return dayCountFormat.format(Math.round(days * 10) / 10)
}
