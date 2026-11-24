// "Novidades": absences newly registered in Moodle and group work sent by a teammate.
// Pure functions, used by the app (when it syncs) and by the service worker (in the background).

import type { MoodleAuth, SyncResult } from '../../shared/types'

export const NEWS_SYNC_TAG = 'chamada-news'
const MAX_SEEN = 600
export const MAX_INBOX = 20

export interface AbsenceNews {
  kind: 'absence'
  key: string
  courseId: number
  disciplineId: string
  disciplineName: string
  /** Class day (YYYY-MM-DD). */
  date: string
  detectedAt: string
}

export interface GroupNews {
  kind: 'group'
  key: string
  courseId: number
  disciplineName: string
  name: string
  url: string
  submittedAt: string
  detectedAt: string
}

export type NewsItem = AbsenceNews | GroupNews

/** What was already reported (or existed before the first check), per Moodle account. */
export interface SeenState {
  userId: number
  absences: string[]
  groups: string[]
}

/** What the service worker needs to check Moodle by itself. It never leaves the device. */
export interface NewsSnapshot {
  userId: number
  auth: MoodleAuth
  semester: string | null
  attendanceCmids: Record<number, number[]>
  /** Moodle course id -> discipline (id used by the Manual tab, display name). */
  disciplines: Record<number, { id: string; name: string }>
  /** "disciplineId|YYYY-MM-DD" of absences already in the Manual tab. */
  manualDays: string[]
}

function keep(keys: string[]): string[] {
  return keys.slice(-MAX_SEEN)
}

/**
 * Compares a sync with what was already seen. The first check of an account only records the
 * current state: old absences and old submissions never become notifications.
 */
export function detectNews(
  seen: SeenState | null | undefined,
  sync: SyncResult,
  snapshot: Pick<NewsSnapshot, 'userId' | 'disciplines' | 'manualDays'>,
  now: Date,
): { seen: SeenState; news: NewsItem[] } {
  const absences: Array<{ key: string; courseId: number; date: string }> = []
  // Without a fresh attendance read the absences are left for the next check.
  if (!sync.attendanceIssue) {
    for (const [courseId, attendance] of Object.entries(sync.attendance)) {
      for (const session of attendance.sessions) {
        if (session.status !== 'absent' && session.status !== 'justified') continue
        absences.push({ key: `${courseId}|${session.start}`, courseId: Number(courseId), date: session.start.slice(0, 10) })
      }
    }
  }
  const groups = sync.groupSubmissions
    .filter((group) => group.submitted && group.submittedAt)
    .map((group) => ({ key: `${group.cmid}|${group.submittedAt}`, group }))

  const baseline = !seen || seen.userId !== snapshot.userId
  const seenAbsences = new Set(baseline ? [] : seen.absences)
  const seenGroups = new Set(baseline ? [] : seen.groups)
  // Union with what was seen before: a failed read never turns old items into news later.
  const next: SeenState = {
    userId: snapshot.userId,
    absences: keep([...seenAbsences, ...absences.map((absence) => absence.key).filter((key) => !seenAbsences.has(key))]),
    groups: keep([...seenGroups, ...groups.map((entry) => entry.key).filter((key) => !seenGroups.has(key))]),
  }
  if (baseline) return { seen: next, news: [] }

  const manualDays = new Set(snapshot.manualDays)
  const detectedAt = now.toISOString()
  const news: NewsItem[] = []
  for (const absence of absences) {
    if (seenAbsences.has(absence.key)) continue
    const discipline = snapshot.disciplines[absence.courseId]
    if (!discipline || manualDays.has(`${discipline.id}|${absence.date}`)) continue
    news.push({
      kind: 'absence',
      key: `absence:${absence.key}`,
      courseId: absence.courseId,
      disciplineId: discipline.id,
      disciplineName: discipline.name,
      date: absence.date,
      detectedAt,
    })
  }
  for (const { key, group } of groups) {
    // Work the student sent themselves never becomes a notification.
    if (seenGroups.has(key) || group.likelyMine) continue
    news.push({
      kind: 'group',
      key: `group:${key}`,
      courseId: group.courseId,
      disciplineName: snapshot.disciplines[group.courseId]?.name ?? '',
      name: group.name,
      url: group.url,
      submittedAt: group.submittedAt!,
      detectedAt,
    })
  }
  return { seen: next, news }
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

export function shortDate(date: string): string {
  const day = new Date(`${date}T12:00:00`)
  return `${WEEKDAYS[day.getDay()]} ${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`
}

/** Where tapping the item takes the student. */
export function newsUrl(item: NewsItem): string {
  return item.kind === 'absence'
    ? `/presenca/manual?registrar=${encodeURIComponent(item.disciplineId)}&data=${item.date}`
    : item.url
}

export function newsText(item: NewsItem): { title: string; body: string } {
  if (item.kind === 'absence') {
    return {
      title: 'Falta lançada no Moodle',
      body: `${item.disciplineName}, ${shortDate(item.date)}. Toque para adicionar às faltas manuais.`,
    }
  }
  return {
    title: 'Seu grupo enviou um trabalho',
    body: `${item.name}${item.disciplineName ? ` · ${item.disciplineName}` : ''}`,
  }
}
