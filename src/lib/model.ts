// Attendance rules and the view model shared by every screen.
// UFSC: a student fails with less than 75% attendance, i.e. more than 25% of the classes missed.

import type { Activity, Course, Discipline, ScheduleSlot, SessionStatus, SyncResult } from '@shared/types'
import { addDays, isSameDay, startOfDay } from './format'

export const MIN_ATTENDANCE = 75
export const GOOD_ATTENDANCE = 85
const ABSENCE_LIMIT = 0.25

export type Tone = 'good' | 'warn' | 'bad' | 'neutral'

/** Below 75% red, 75–84% orange, 85% or more green. */
export function toneFor(percent: number | null): Tone {
  if (percent === null || Number.isNaN(percent)) return 'neutral'
  if (percent < MIN_ATTENDANCE) return 'bad'
  if (percent < GOOD_ATTENDANCE) return 'warn'
  return 'good'
}

export const TONE_LABEL: Record<Tone, string> = {
  good: 'Tranquilo',
  warn: 'Atenção',
  bad: 'Abaixo de 75%',
  neutral: 'Sem chamadas',
}

/** Absence budget (the official rule): how close the student is to the 25% limit. */
export function budgetTone(remainingAbsences: number, allowedAbsences: number, failed: boolean): Tone {
  if (failed) return 'bad'
  if (remainingAbsences <= 0 || remainingAbsences <= allowedAbsences * 0.25) return 'warn'
  return 'good'
}

/** One class meeting: a Moodle attendance session, or a projection of the CAGR grid. */
export interface Meeting {
  start: Date
  end: Date
  room: string
  /** Extra text from the professor ("PROVA DE RECUPERAÇÃO"), if any. */
  note: string
  status: SessionStatus
  points: number | null
  classes: number
  fromSchedule: boolean
}

export interface AttendanceStats {
  hasData: boolean
  takenPoints: number
  takenMax: number
  totalMax: number
  /** Attendance over the classes already registered (what Moodle shows). */
  percent: number | null
  absences: number
  allowedAbsences: number
  remainingAbsences: number
  /** Best final attendance if the student goes to every remaining class. */
  maxPossiblePercent: number | null
  tone: Tone
  failed: boolean
  upcoming: Meeting[]
  pendingPast: number
}

export interface DisciplineView {
  id: string
  code: string | null
  name: string
  shortName: string
  classGroup: string | null
  professors: string[]
  schedule: ScheduleSlot[]
  hue: number
  course: Course | null
  meetings: Meeting[]
  stats: AttendanceStats
  activities: Activity[]
  attendanceUrl: string | null
}

// Categorical hues away from the status colors (red/orange/green).
const HUES = [250, 300, 205, 340, 275, 185, 225, 320]

const ABBREVIATIONS: Array<[RegExp, string]> = [
  [/\bProgramação\b/g, 'Prog.'],
  [/\bEngenharia\b/g, 'Eng.'],
  [/\bDesenvolvimento\b/g, 'Desenv.'],
  [/\bIntrodução\b/g, 'Intro.'],
  [/\bComputadores\b/g, 'Comp.'],
  [/\bComputação\b/g, 'Comp.'],
  [/\bSistemas\b/g, 'Sist.'],
  [/\bModelagem\b/g, 'Model.'],
  [/\bAutomação\b/g, 'Autom.'],
  [/\bProcessos\b/g, 'Proc.'],
  [/\bNegócios\b/g, 'Neg.'],
  [/\bOrganização\b/g, 'Org.'],
  [/\bArquitetura\b/g, 'Arq.'],
  [/\bDistribuída\b/g, 'Distrib.'],
  [/\bOrientada a Objetos\b/g, 'OO'],
  [/\bInformação\b/g, 'Inform.'],
  [/\bTecnologias?\b/g, 'Tec.'],
]

export function shortenName(name: string): string {
  if (name.length <= 22) return name
  return ABBREVIATIONS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), name)
}

// "CTC304", "LIICT6", "CTC204 : RECUPERAÇÃO"
const ROOM_PATTERN = /^([A-Z]{2,}[A-Z0-9-]*\d[A-Z0-9]*)\b\s*[:\-–]?\s*(.*)$/
const GROUP_ONLY_NOTE = /^todos os (estudantes|alunos)$/i

/** "CTC/CTC304" -> "CTC304" */
export function displayRoom(room: string): string {
  return room.replace(/^[A-Z]+\//, '')
}

function clockTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** The session description may start with the room; otherwise the CAGR grid knows it. */
function resolveRoom(description: string, start: Date, schedule: ScheduleSlot[]): { room: string; note: string } {
  const match = description.match(ROOM_PATTERN)
  if (match) return { room: match[1], note: match[2] }
  const slot = schedule.find((candidate) => candidate.weekday === start.getDay() && candidate.start === clockTime(start))
  return { room: slot ? displayRoom(slot.room) : '', note: GROUP_ONLY_NOTE.test(description) ? '' : description }
}

function toMeetings(course: Course | null, sync: SyncResult | null, schedule: ScheduleSlot[]): Meeting[] {
  if (!course || !sync) return []
  return (sync.attendance[course.id]?.sessions ?? []).map((session) => {
    const start = new Date(session.start)
    return {
      start,
      end: new Date(session.end),
      ...resolveRoom(session.description, start, schedule),
      status: session.status,
      points: session.points,
      classes: session.maxPoints,
      fromSchedule: false,
    }
  })
}

function computeStats(meetings: Meeting[], now: Date): AttendanceStats {
  let takenPoints = 0
  let takenMax = 0
  let totalMax = 0
  let pendingPast = 0
  const upcoming: Meeting[] = []
  for (const meeting of meetings) {
    totalMax += meeting.classes
    if (meeting.points !== null) {
      takenPoints += meeting.points
      takenMax += meeting.classes
    } else if (meeting.end > now) {
      upcoming.push(meeting)
    } else {
      pendingPast++
    }
  }
  const percent = takenMax > 0 ? (takenPoints / takenMax) * 100 : null
  const absences = roundClasses(takenMax - takenPoints)
  const allowedAbsences = Math.floor(totalMax * ABSENCE_LIMIT + 1e-9)
  return {
    hasData: meetings.length > 0,
    takenPoints,
    takenMax,
    totalMax,
    percent,
    absences,
    allowedAbsences,
    remainingAbsences: roundClasses(allowedAbsences - absences),
    maxPossiblePercent: totalMax > 0 ? ((totalMax - absences) / totalMax) * 100 : null,
    tone: toneFor(percent),
    failed: totalMax > 0 && absences > allowedAbsences,
    upcoming,
    pendingPast,
  }
}

function roundClasses(value: number): number {
  return Math.round(value * 100) / 100
}

export function buildDisciplines(disciplines: Discipline[], sync: SyncResult | null, now: Date): DisciplineView[] {
  const courses = sync?.courses ?? []
  const used = new Set<number>()
  const sources: Array<Omit<Discipline, 'classGroup'> & { classGroup: string | null; course: Course | null }> = []

  for (const discipline of disciplines) {
    const course = courses.find((candidate) => candidate.code === discipline.code && !used.has(candidate.id)) ?? null
    if (course) used.add(course.id)
    sources.push({ ...discipline, course })
  }
  // Moodle-only disciplines (e.g. when CAGR was unavailable).
  for (const course of courses) {
    if (used.has(course.id) || !course.code) continue
    sources.push({ code: course.code, classGroup: course.classGroup, name: course.name, professors: [], schedule: [], course })
  }

  return sources
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((source, index) => {
      const meetings = toMeetings(source.course, sync, source.schedule)
      const attendance = source.course ? sync?.attendance[source.course.id] : undefined
      return {
        id: source.code ?? `curso-${source.course?.id}`,
        code: source.code,
        name: source.name,
        shortName: shortenName(source.name),
        classGroup: source.classGroup,
        professors: source.professors,
        schedule: source.schedule,
        hue: HUES[index % HUES.length],
        course: source.course,
        meetings,
        stats: computeStats(meetings, now),
        activities: source.course ? (sync?.activities ?? []).filter((activity) => activity.courseId === source.course!.id) : [],
        attendanceUrl: attendance?.cmids[0]
          ? `https://presencial.moodle.ufsc.br/mod/attendance/view.php?id=${attendance.cmids[0]}&view=5`
          : null,
      }
    })
}

// ---------------------------------------------------------------- meetings and projections

function atTime(day: Date, time: string): Date {
  const [hours, minutes] = time.split(':').map(Number)
  const date = startOfDay(day)
  date.setHours(hours, minutes, 0, 0)
  return date
}

/** Classes from the weekly CAGR grid, for disciplines without Moodle sessions. */
export function projectSchedule(schedule: ScheduleSlot[], from: Date, days: number): Meeting[] {
  const meetings: Meeting[] = []
  for (let offset = 0; offset < days; offset++) {
    const day = addDays(startOfDay(from), offset)
    for (const slot of schedule) {
      if (slot.weekday !== day.getDay()) continue
      meetings.push({
        start: atTime(day, slot.start),
        end: atTime(day, slot.end),
        room: displayRoom(slot.room),
        note: '',
        status: 'pending',
        points: null,
        classes: slot.classes,
        fromSchedule: true,
      })
    }
  }
  return meetings.sort((a, b) => a.start.getTime() - b.start.getTime())
}

/** Moodle sessions are the source of truth (they skip holidays); the grid is only a fallback. */
function usesMoodleFor(view: DisciplineView, day: Date): boolean {
  const last = view.meetings.at(-1)
  return Boolean(last && last.start >= startOfDay(day))
}

export function meetingsOn(view: DisciplineView, day: Date): Meeting[] {
  if (usesMoodleFor(view, day)) return view.meetings.filter((meeting) => isSameDay(meeting.start, day))
  return projectSchedule(view.schedule, day, 1)
}

export function nextMeetings(view: DisciplineView, now: Date, limit: number): Meeting[] {
  if (view.stats.upcoming.length) return view.stats.upcoming.slice(0, limit)
  return projectSchedule(view.schedule, now, 14)
    .filter((meeting) => meeting.end > now)
    .slice(0, limit)
}

export interface WhatIf {
  ifPresent: number
  ifAbsent: number
  absencesIfAbsent: number
}

/** Attendance after a class that has not been registered yet, going or missing it. */
export function whatIf(stats: AttendanceStats, classes: number): WhatIf | null {
  if (!stats.hasData) return null
  const max = stats.takenMax + classes
  return {
    ifPresent: ((stats.takenPoints + classes) / max) * 100,
    ifAbsent: (stats.takenPoints / max) * 100,
    absencesIfAbsent: roundClasses(stats.absences + classes),
  }
}

// ---------------------------------------------------------------- today

export interface ClassItem {
  view: DisciplineView
  meeting: Meeting
  whatIf: WhatIf | null
}

export function classesOn(views: DisciplineView[], day: Date): ClassItem[] {
  return views
    .flatMap((view) =>
      meetingsOn(view, day).map((meeting) => ({
        view,
        meeting,
        whatIf: meeting.points === null ? whatIf(view.stats, meeting.classes) : null,
      })),
    )
    .sort((a, b) => a.meeting.start.getTime() - b.meeting.start.getTime())
}

/** First day after today with classes (looks up to two weeks ahead). */
export function nextClassDay(views: DisciplineView[], now: Date): { day: Date; classes: ClassItem[] } | null {
  for (let offset = 1; offset <= 14; offset++) {
    const day = addDays(startOfDay(now), offset)
    const classes = classesOn(views, day)
    if (classes.length) return { day, classes }
  }
  return null
}

// ---------------------------------------------------------------- simulation

export interface Simulation {
  view: DisciplineView
  requested: number
  missed: Meeting[]
  missedClasses: number
  percent: number | null
  absences: number
  remainingAbsences: number
  maxPossiblePercent: number | null
  tone: Tone
  failed: boolean
}

/** Misses the next `count` classes of the discipline, from the current moment on. */
export function simulate(view: DisciplineView, count: number): Simulation {
  const { stats } = view
  const missed = stats.upcoming.slice(0, Math.max(0, count))
  const missedClasses = missed.reduce((total, meeting) => total + meeting.classes, 0)
  const takenMax = stats.takenMax + missedClasses
  const percent = takenMax > 0 ? (stats.takenPoints / takenMax) * 100 : null
  const absences = roundClasses(stats.absences + missedClasses)
  return {
    view,
    requested: count,
    missed,
    missedClasses,
    percent,
    absences,
    remainingAbsences: roundClasses(stats.allowedAbsences - absences),
    maxPossiblePercent: stats.totalMax > 0 ? ((stats.totalMax - absences) / stats.totalMax) * 100 : null,
    tone: toneFor(percent),
    failed: stats.totalMax > 0 && absences > stats.allowedAbsences,
  }
}

// ---------------------------------------------------------------- activities

export interface ActivityItem {
  activity: Activity
  due: Date
  view: DisciplineView | null
  courseName: string
}

export function activityItems(sync: SyncResult | null, views: DisciplineView[]): ActivityItem[] {
  if (!sync) return []
  return sync.activities.map((activity) => {
    const view = views.find((candidate) => candidate.course?.id === activity.courseId) ?? null
    const course = sync.courses.find((candidate) => candidate.id === activity.courseId)
    return {
      activity,
      due: new Date(activity.dueAt),
      view,
      courseName: view?.name ?? course?.name ?? 'Moodle',
    }
  })
}

const MODULE_LABEL: Record<string, string> = {
  assign: 'Tarefa',
  quiz: 'Questionário',
  forum: 'Fórum',
  groupselect: 'Escolha de grupo',
  choice: 'Escolha',
  feedback: 'Pesquisa',
  lesson: 'Lição',
  workshop: 'Laboratório',
  scheduler: 'Agendamento',
  data: 'Base de dados',
  h5pactivity: 'H5P',
  lti: 'Ferramenta externa',
  scorm: 'SCORM',
  glossary: 'Glossário',
  wiki: 'Wiki',
}

export function activityKind(activity: Activity): string {
  const label = MODULE_LABEL[activity.module] ?? (activity.module ? 'Atividade' : 'Evento')
  return activity.eventType === 'close' ? `${label} · encerra` : label
}
