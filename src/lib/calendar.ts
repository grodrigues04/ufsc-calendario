// Calendário tab: periods (day, week, month), the classes and activities of each day, and the
// filters. Pure functions; the screens are in src/screens/calendar*.tsx.

import type { Activity } from '@shared/types'
import { addDays, isSameDay, startOfDay } from './format'
import { type ActivityItem, type DisciplineView, isoDay, type Meeting, projectSchedule, type Tone } from './model'

export type CalendarMode = 'dia' | 'semana' | 'mes'

// ---------------------------------------------------------------- periods

/** Brazilian calendars (and Google Calendar in pt-BR) start the week on Sunday. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date)
  return addDays(day, -day.getDay())
}

/** Same day of another month, clamped: 31/01 plus one month is 28/02. */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth() + months, 1)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate()
  result.setDate(Math.min(date.getDate(), lastDay))
  return result
}

/** One step of the arrows: a day, a week or a month. */
export function shiftDate(mode: CalendarMode, date: Date, direction: number): Date {
  if (mode === 'dia') return addDays(date, direction)
  if (mode === 'semana') return addDays(date, 7 * direction)
  return addMonths(date, direction)
}

/** Days on screen: the day, its week, or the whole weeks that cover its month. */
export function periodDays(mode: CalendarMode, date: Date): Date[] {
  if (mode === 'dia') return [startOfDay(date)]
  if (mode === 'semana') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(date), index))
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0)
  const days: Date[] = []
  for (let day = startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1)); day <= last || day.getDay() !== 0; day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

/** Changes whenever the arrows move the view (used to animate the change). */
export function periodKey(mode: CalendarMode, date: Date): string {
  if (mode === 'mes') return `mes:${date.getFullYear()}-${date.getMonth()}`
  return `${mode}:${isoDay(periodDays(mode, date)[0])}`
}

export function containsToday(mode: CalendarMode, date: Date, now: Date): boolean {
  if (mode === 'mes') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth()
  return periodDays(mode, date).some((day) => isSameDay(day, now))
}

const monthFormat = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
const monthShortFormat = new Intl.DateTimeFormat('pt-BR', { month: 'short' })
const dayMonthFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' })
const fullDateFormat = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

/** "novembro", "novembro de 2027", "nov. – dez." for a week across two months (like Google Calendar). */
export function periodTitle(mode: CalendarMode, date: Date, now: Date): string {
  const year = (day: Date) => (day.getFullYear() === now.getFullYear() ? '' : ` de ${day.getFullYear()}`)
  if (mode === 'semana') {
    const days = periodDays(mode, date)
    const [first, last] = [days[0], days[6]]
    if (first.getMonth() !== last.getMonth()) {
      const firstYear = first.getFullYear() === last.getFullYear() ? '' : year(first)
      return `${monthShortFormat.format(first)}${firstYear} – ${monthShortFormat.format(last)}${year(last)}`
    }
    return `${monthFormat.format(first)}${year(first)}`
  }
  return `${monthFormat.format(date)}${year(date)}`
}

/** What a screen reader announces after the arrows: the whole day, week or month. */
export function periodDescription(mode: CalendarMode, date: Date): string {
  if (mode === 'dia') return fullDateFormat.format(date)
  if (mode === 'semana') {
    const days = periodDays(mode, date)
    return `Semana de ${dayMonthFormat.format(days[0])} a ${dayMonthFormat.format(days[6])} de ${days[6].getFullYear()}`
  }
  return `${monthFormat.format(date)} de ${date.getFullYear()}`
}

// ---------------------------------------------------------------- classes

export interface ClassPeriod {
  start: Date
  end: Date
}

/**
 * When the semester has classes: from the first to the last Moodle session of any discipline.
 * Without sessions, the UFSC calendar: the 1st semester from March to July, the 2nd from August
 * to December. The CAGR grid has no dates, so it is never projected outside this.
 */
export function classPeriod(views: DisciplineView[], semester: string | null): ClassPeriod | null {
  let start: Date | null = null
  let end: Date | null = null
  for (const view of views) {
    for (const meeting of view.meetings) {
      if (!start || meeting.start < start) start = meeting.start
      if (!end || meeting.start > end) end = meeting.start
    }
  }
  if (start && end) return { start: startOfDay(start), end: startOfDay(end) }
  const match = semester?.match(/^(\d{4})([12])$/)
  if (!match) return null
  const year = Number(match[1])
  return match[2] === '1'
    ? { start: new Date(year, 2, 1), end: new Date(year, 6, 31) }
    : { start: new Date(year, 7, 1), end: new Date(year, 11, 31) }
}

export interface ClassEvent {
  key: string
  view: DisciplineView
  meeting: Meeting
}

/**
 * Classes of the day. Moodle sessions are the classes that really happen (they skip holidays and
 * end with the semester); the CAGR grid only fills in disciplines without them.
 */
export function classesOfDay(views: DisciplineView[], day: Date, period: ClassPeriod | null): ClassEvent[] {
  const inSemester = period !== null && day >= period.start && day <= period.end
  const events: ClassEvent[] = []
  for (const view of views) {
    const meetings = view.meetings.length
      ? view.meetings.filter((meeting) => isSameDay(meeting.start, day))
      : inSemester
        ? projectSchedule(view.schedule, day, 1)
        : []
    for (const meeting of meetings) events.push({ key: `${view.id}-${meeting.start.toISOString()}`, view, meeting })
  }
  return events.sort((a, b) => a.meeting.start.getTime() - b.meeting.start.getTime())
}

const CONNECTIVES = new Set(['a', 'à', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'para', 'por'])
// "II", "2", "A" after the name ("Cálculo A", "Bancos de Dados II").
const SUFFIX = /^(?:[IVX]+|\d+|[A-Z])$/

/**
 * Short name for the narrow week columns and month cells: "Bancos de Dados II" -> "BD II",
 * "Programação Orientada a Objetos" -> "POO". One-word names stay whole ("Cálculo A").
 */
export function disciplineAcronym(name: string): string {
  const upper = name === name.toLocaleUpperCase('pt-BR')
  const words = name.split(/[\s/–-]+/).filter(Boolean)
  const connective = (word: string) => (upper || word === word.toLocaleLowerCase('pt-BR')) && CONNECTIVES.has(word.toLocaleLowerCase('pt-BR'))
  if (words.filter((word) => !connective(word) && !SUFFIX.test(word)).length < 2) return name
  const parts: string[] = []
  let letters = ''
  for (const word of words) {
    if (connective(word)) continue
    if (SUFFIX.test(word)) {
      if (letters) parts.push(letters)
      letters = ''
      parts.push(word)
      continue
    }
    letters += word.charAt(0).toLocaleUpperCase('pt-BR')
  }
  if (letters) parts.push(letters)
  return parts.join(' ')
}

// ---------------------------------------------------------------- activities

/**
 * pending: Moodle still expects something; overdue: and the due date passed; done: delivered,
 * graded or otherwise finished; closed: the due date passed with no delivery recorded;
 * event: a plain course event (an exam date), not something to deliver.
 */
export type ActivityState = 'pending' | 'overdue' | 'done' | 'closed' | 'event'

export function activityState(activity: Activity, now: Date): ActivityState {
  if (!activity.module) return 'event'
  if (activity.pending) return new Date(activity.dueAt) < now ? 'overdue' : 'pending'
  return activity.settled === 'closed' ? 'closed' : 'done'
}

export function activityStatus(activity: Activity, now: Date): string {
  const state = activityState(activity, now)
  if (state === 'pending') return 'Pendente'
  if (state === 'overdue') return 'Atrasada'
  if (state === 'closed') return 'Encerrada'
  if (state === 'event') return new Date(activity.dueAt) < now ? 'Já aconteceu' : 'Evento'
  if (activity.settled === 'submitted') return activity.module === 'quiz' ? 'Respondido' : 'Entregue'
  if (activity.settled === 'graded') return 'Avaliada'
  if (activity.settled === 'chosen') return 'Grupo escolhido'
  return 'Concluída'
}

/** One line under the status, in the activity sheet. */
export function activityHint(activity: Activity, now: Date): string {
  const state = activityState(activity, now)
  const expected = activity.module === 'quiz' ? 'sua tentativa' : activity.module === 'groupselect' ? 'sua escolha de grupo' : 'sua entrega'
  if (state === 'pending') return `O Moodle ainda espera ${expected}.`
  if (state === 'overdue') return `O prazo passou e o Moodle ainda espera ${expected}.`
  if (state === 'closed') return 'O prazo acabou sem entrega registrada no Moodle.'
  if (state === 'event') return 'Data marcada no calendário da disciplina.'
  if (activity.settled === 'submitted') return activity.module === 'quiz' ? 'Tentativa finalizada no Moodle.' : 'Entrega registrada no Moodle.'
  if (activity.settled === 'graded') return 'Já tem avaliação no Moodle.'
  if (activity.settled === 'chosen') return 'Você já está num grupo.'
  return 'O Moodle não espera mais nada de você aqui.'
}

/** Delivered and closed work only shows when the student asks; pending work and course events always do. */
export function showsActivity(activity: Activity, showDone: boolean): boolean {
  return showDone || activity.pending || !activity.module
}

/** Activities by day (YYYY-MM-DD), each day in due order. */
export function activitiesByDay(items: ActivityItem[]): Map<string, ActivityItem[]> {
  const byDay = new Map<string, ActivityItem[]>()
  for (const item of [...items].sort((a, b) => a.due.getTime() - b.due.getTime())) {
    const key = isoDay(item.due)
    byDay.set(key, [...(byDay.get(key) ?? []), item])
  }
  return byDay
}

// ---------------------------------------------------------------- attendance filter

/** Lowest and highest attendance (whole percents, both included). */
export type PercentRange = [number, number]

export const FULL_RANGE: PercentRange = [0, 100]

export function isFullRange(range: PercentRange): boolean {
  return range[0] <= 0 && range[1] >= 100
}

/**
 * The upper bound covers its whole percent, so "75 a 84%" takes 84,6% (orange) and leaves 85%
 * (green) out, like the colors. Disciplines without roll calls only pass the full range.
 */
export function inPercentRange(percent: number | null, range: PercentRange): boolean {
  if (isFullRange(range)) return true
  if (percent === null) return false
  return percent >= range[0] && (range[1] >= 100 || percent < range[1] + 1)
}

export const RANGE_PRESETS: Array<{ label: string; range: PercentRange; tone: Tone | null }> = [
  { label: 'Todas', range: FULL_RANGE, tone: null },
  { label: 'Abaixo de 75%', range: [0, 74], tone: 'bad' },
  { label: '75 a 84%', range: [75, 84], tone: 'warn' },
  { label: '85% ou mais', range: [85, 100], tone: 'good' },
]

export function sameRange(a: PercentRange, b: PercentRange): boolean {
  return a[0] === b[0] && a[1] === b[1]
}

/** "todas", "abaixo de 75%", "até 60%", "60% ou mais", "60 a 80%". */
export function rangeLabel(range: PercentRange): string {
  if (isFullRange(range)) return 'todas'
  const preset = RANGE_PRESETS.find((item) => sameRange(item.range, range))
  if (preset) return preset.label.charAt(0).toLowerCase() + preset.label.slice(1)
  if (range[0] <= 0) return `até ${range[1]}%`
  if (range[1] >= 100) return `${range[0]}% ou mais`
  return `${range[0]} a ${range[1]}%`
}

/** The same, short enough for the filter button: "< 75%", "75–84%", "≥ 85%", "≤ 60%". */
export function rangeShortLabel(range: PercentRange): string {
  if (isFullRange(range)) return 'todas'
  if (sameRange(range, [0, 74])) return '< 75%'
  if (range[0] <= 0) return `≤ ${range[1]}%`
  if (range[1] >= 100) return `≥ ${range[0]}%`
  return range[0] === range[1] ? `${range[0]}%` : `${range[0]}–${range[1]}%`
}

// ---------------------------------------------------------------- time grid

export function minutesOf(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}

function clockMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/** Minutes of the day a class covers (a class that runs past midnight stops at 24:00). */
export function classSpan(meeting: Meeting): [number, number] {
  const start = minutesOf(meeting.start)
  const end = isSameDay(meeting.start, meeting.end) ? minutesOf(meeting.end) : 24 * 60
  return [start, Math.max(end, start + 15)]
}

/**
 * Hours the time grid shows: the whole weekly grid of the student (so it does not jump from one
 * day to the next) plus every class on screen.
 */
export function hourRange(views: DisciplineView[], classes: ClassEvent[]): [number, number] | null {
  let first = Infinity
  let last = -Infinity
  for (const view of views) {
    for (const slot of view.schedule) {
      first = Math.min(first, clockMinutes(slot.start))
      last = Math.max(last, clockMinutes(slot.end))
    }
  }
  for (const { meeting } of classes) {
    const [start, end] = classSpan(meeting)
    first = Math.min(first, start)
    last = Math.max(last, end)
  }
  if (!Number.isFinite(first)) return null
  return [Math.floor(first / 60), Math.min(24, Math.ceil(last / 60))]
}

export interface Placed<T> {
  event: T
  /** Column inside the group of classes that overlap, and how many columns the group has. */
  lane: number
  lanes: number
}

/** Classes at the same time share the width side by side, like in Google Calendar. */
export function placeSideBySide<T>(events: T[], span: (event: T) => [number, number]): Array<Placed<T>> {
  const sorted = [...events].sort((a, b) => span(a)[0] - span(b)[0] || span(b)[1] - span(a)[1])
  const placed: Array<Placed<T>> = []
  let group: Array<Placed<T>> = []
  let laneEnds: number[] = []
  let groupEnd = -Infinity
  const closeGroup = () => {
    for (const entry of group) entry.lanes = laneEnds.length
    group = []
    laneEnds = []
  }
  for (const event of sorted) {
    const [start, end] = span(event)
    if (start >= groupEnd) {
      closeGroup()
      groupEnd = -Infinity
    }
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    const entry = { event, lane, lanes: 1 }
    group.push(entry)
    placed.push(entry)
    groupEnd = Math.max(groupEnd, end)
  }
  closeGroup()
  return placed
}
