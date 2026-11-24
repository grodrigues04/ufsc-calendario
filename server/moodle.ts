// Moodle UFSC (presencial.moodle.ufsc.br): mobile token, web services and attendance pages.

import { randomBytes } from 'node:crypto'
import { parse } from 'node-html-parser'
import type {
  Activity,
  AttendanceIssue,
  AttendanceSession,
  Course,
  CourseAttendance,
  MoodleAuth,
  SessionStatus,
  SyncResult,
} from '../shared/types.js'
import { isCasLoginPage, passInterstitials, submitCasCredentials } from './cas.js'
import { AppError, cleanText, HttpClient } from './http.js'

const MOODLE_URL = 'https://presencial.moodle.ufsc.br'
const MOODLE_HOST = 'presencial.moodle.ufsc.br'
const WS_URL = `${MOODLE_URL}/webservice/rest/server.php`
const MOBILE_SERVICE = 'moodle_mobile_app'
// tool_mobile_get_autologin_key only answers requests that identify as the Moodle app.
const MOODLE_APP_USER_AGENT = 'Mozilla/5.0 (Linux; Android 14) MoodleMobile 4.4.0 (44000)'
const BRAZIL_OFFSET = '-03:00'
const DAY_SECONDS = 86_400
const CLASS_MINUTES = 50

// ---------------------------------------------------------------- web services

class MoodleWsError extends Error {
  readonly errorcode: string

  constructor(errorcode: string, message: string) {
    super(message)
    this.errorcode = errorcode
  }
}

function appendParam(prefix: string, value: unknown, params: URLSearchParams): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendParam(`${prefix}[${index}]`, item, params))
  } else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) appendParam(`${prefix}[${key}]`, item, params)
  } else if (value !== undefined) {
    params.append(prefix, String(value))
  }
}

async function callWs<T>(token: string, wsfunction: string, args: Record<string, unknown> = {}, userAgent?: string): Promise<T> {
  const body = new URLSearchParams({ wstoken: token, wsfunction, moodlewsrestformat: 'json' })
  for (const [key, value] of Object.entries(args)) appendParam(key, value, body)
  let data: unknown
  try {
    const response = await fetch(WS_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(25_000),
      headers: userAgent ? { 'User-Agent': userAgent } : {},
    })
    data = await response.json()
  } catch {
    throw new AppError('ufsc_unavailable', 'O Moodle não respondeu. Tente de novo em instantes.', 502)
  }
  if (data !== null && typeof data === 'object' && 'exception' in data) {
    const { errorcode = '', message = '' } = data as { errorcode?: string; message?: string }
    if (errorcode === 'invalidtoken' || errorcode === 'accessexception') {
      throw new AppError('invalid_token', 'Seu acesso ao Moodle expirou. Entre de novo.', 401)
    }
    throw new MoodleWsError(errorcode, message)
  }
  return data as T
}

// ---------------------------------------------------------------- login

/**
 * Logs in through idUFSC the same way the Moodle app does: launch.php -> CAS -> launch.php,
 * which answers with moodlemobile://token=base64(siteid:::token:::privatetoken).
 * The returned client keeps the CAS session, so CAGR can be opened without asking again.
 */
export async function loginMoodle(
  username: string,
  password: string,
  onCredentialsAccepted: () => void = () => {},
): Promise<{ client: HttpClient; auth: MoodleAuth; skippedCollecta: boolean }> {
  const client = new HttpClient()
  const passport = randomBytes(8).toString('hex')
  const launchUrl = `${MOODLE_URL}/admin/tool/mobile/launch.php?service=${MOBILE_SERVICE}&passport=${passport}&urlscheme=moodlemobile`

  const loginPage = await client.follow(launchUrl)
  if (!isCasLoginPage(loginPage)) {
    throw new AppError('ufsc_unavailable', 'O Moodle não abriu o login da UFSC.', 502)
  }
  const afterCredentials = await submitCasCredentials(client, loginPage, await loginPage.response.text(), username, password)
  onCredentialsAccepted()
  let { step, skippedCollecta } = await passInterstitials(client, afterCredentials)
  if (!step.customLocation) {
    // The survey may send the user to another page: launch again with the CAS session.
    await step.response.body?.cancel()
    step = (await passInterstitials(client, await client.follow(launchUrl))).step
  }
  const encoded = step.customLocation?.split('token=')[1]
  if (!encoded) {
    throw new AppError('moodle_token_failed', 'O Moodle não liberou o acesso do app para a sua conta.', 502)
  }
  const [, token, privateToken] = Buffer.from(encoded, 'base64').toString('utf8').split(':::')
  if (!token) {
    throw new AppError('moodle_token_failed', 'O Moodle não liberou o acesso do app para a sua conta.', 502)
  }
  const site = await callWs<{ userid: number }>(token, 'core_webservice_get_site_info')
  const session = client.jar.find(MOODLE_HOST, (name) => name.startsWith('MoodleSession'))
  return { client, auth: { token, privateToken: privateToken || null, userId: site.userid, session }, skippedCollecta }
}

// ---------------------------------------------------------------- sync

interface WsCourse {
  id: number
  shortname: string
  fullname: string
  idnumber?: string
  startdate?: number
}

interface WsModule {
  id: number
  url?: string
  name: string
  instance: number
  modname: string
  uservisible?: boolean
}

interface WsEvent {
  id: number
  name: string
  courseid: number
  modulename: string | null
  instance: number | null
  eventtype: string
  timestart: number
}

interface WsActionEvent {
  id: number
  name: string
  activityname?: string
  modulename: string | null
  eventtype: string
  timesort: number
  overdue: boolean
  url: string
  course?: { id: number }
  action?: { name: string; actionable: boolean } | null
}

/**
 * `knownAttendance` (course id -> attendance cmids from the previous sync) lets the attendance
 * pages load while the web services run; Moodle serializes page requests of one session.
 */
export async function syncMoodle(
  auth: MoodleAuth,
  semesterHint: string | null,
  knownAttendance: Record<number, number[]> = {},
): Promise<SyncResult> {
  const now = Math.floor(Date.now() / 1000)
  const knownTargets = new Map(Object.entries(knownAttendance).map(([courseId, cmids]) => [Number(courseId), cmids]))
  const earlyAttendance = knownTargets.size ? readAttendance(auth, knownTargets) : null
  // Avoid an unhandled rejection while the web services below are still running.
  earlyAttendance?.catch(() => {})

  const enrolled = await callWs<WsCourse[]>(auth.token, 'core_enrol_get_users_courses', {
    userid: auth.userId,
    returnusercount: 0,
  })
  const courses = enrolled.map(toCourse)
  const semester = semesterHint ?? currentSemester(enrolled, now)
  const current = courses.filter((course) => course.semester === semester)
  const currentIds = new Set(current.map((course) => course.id))
  // Only real disciplines define the semester start (some institutional courses are years old).
  const disciplineStarts = enrolled
    .filter((course) => currentIds.has(course.id) && toCourse(course).code && course.startdate)
    .map((course) => course.startdate!)
  const semesterStart = Math.min(disciplineStarts.length ? Math.min(...disciplineStarts) : now, now - 30 * DAY_SECONDS)

  const [contents, calendar, actions] = await Promise.all([
    Promise.all(
      current.map((course) =>
        callWs<Array<{ modules: WsModule[] }>>(auth.token, 'core_course_get_contents', {
          courseid: course.id,
          options: [{ name: 'excludecontents', value: 1 }],
        }).catch((error: unknown) => {
          if (error instanceof AppError) throw error
          return []
        }),
      ),
    ),
    current.length
      ? callWs<{ events: WsEvent[] }>(auth.token, 'core_calendar_get_calendar_events', {
          events: { courseids: current.map((course) => course.id) },
          options: { userevents: 0, siteevents: 0, timestart: semesterStart, timeend: now + 200 * DAY_SECONDS },
        })
      : Promise.resolve({ events: [] }),
    readActionEvents(auth.token, semesterStart),
  ])

  const modules = new Map<string, WsModule>()
  const attendanceCmids = new Map<number, number[]>()
  current.forEach((course, index) => {
    for (const section of contents[index]) {
      for (const module of section.modules) {
        modules.set(`${module.modname}:${module.instance}`, module)
        if (module.modname === 'attendance' && module.uservisible !== false) {
          attendanceCmids.set(course.id, [...(attendanceCmids.get(course.id) ?? []), module.id])
        }
      }
    }
  })

  const activities = buildActivities(calendar.events, actions, modules, currentIds)

  let { attendance, session, issue } = earlyAttendance
    ? await earlyAttendance
    : await readAttendance(auth, attendanceCmids)
  if (earlyAttendance) {
    // Keep only current courses and read attendance activities the hint did not know about.
    attendance = Object.fromEntries(Object.entries(attendance).filter(([courseId]) => attendanceCmids.has(Number(courseId))))
    const missing = new Map(
      [...attendanceCmids]
        .map(([courseId, cmids]) => [courseId, cmids.filter((cmid) => !knownTargets.get(courseId)?.includes(cmid))] as const)
        .filter(([, cmids]) => cmids.length > 0),
    )
    if (missing.size && !issue) {
      const extra = await readAttendance({ ...auth, session }, missing)
      for (const [courseId, entry] of Object.entries(extra.attendance)) {
        const merged = attendance[Number(courseId)] ?? { cmids: [], sessions: [] }
        merged.cmids.push(...entry.cmids)
        merged.sessions = [...merged.sessions, ...entry.sessions].sort((a, b) => a.start.localeCompare(b.start))
        attendance[Number(courseId)] = merged
      }
      session = extra.session ?? session
      issue = extra.issue
    }
  }

  return {
    syncedAt: new Date().toISOString(),
    semester,
    courses: current,
    activities,
    attendance,
    session,
    attendanceIssue: issue,
  }
}

/** Pending activities (Moodle "Linha do tempo"), paginated by event id. */
async function readActionEvents(token: string, from: number): Promise<WsActionEvent[]> {
  const pageSize = 50
  const events: WsActionEvent[] = []
  let afterEventId: number | undefined
  for (let page = 0; page < 4; page++) {
    const { events: batch } = await callWs<{ events: WsActionEvent[] }>(token, 'core_calendar_get_action_events_by_timesort', {
      timesortfrom: from,
      limitnum: pageSize,
      limittononsuspendedevents: 1,
      ...(afterEventId ? { aftereventid: afterEventId } : {}),
    })
    events.push(...batch)
    if (batch.length < pageSize) break
    afterEventId = batch[batch.length - 1].id
  }
  return events
}

function toCourse(course: WsCourse): Course {
  const shortname = cleanText(course.shortname)
  const fullname = cleanText(course.fullname)
  const match = shortname.match(/^([A-Z]{3}\d{4})-(\S+)/)
  const semester =
    (shortname.match(/\((\d{5})\)/) ?? fullname.match(/\((\d{5})\)/) ?? course.idnumber?.match(/\|(\d{5})\|/))?.[1] ?? null
  return {
    id: course.id,
    shortname,
    name: fullname.replace(/^[A-Z]{3}\d{4}-\S+\s*\(\d{5}\)\s*-\s*/, '').replace(/^[.\s]+|[.\s]+$/g, '') || shortname,
    code: match?.[1] ?? null,
    classGroup: match?.[2] ?? null,
    semester,
    url: `${MOODLE_URL}/course/view.php?id=${course.id}`,
  }
}

/** Latest semester among courses that already started (ignores next semester's early courses). */
function currentSemester(courses: WsCourse[], now: number): string | null {
  let latest: string | null = null
  for (const course of courses) {
    const semester = toCourse(course).semester
    if (!semester || (course.startdate ?? 0) > now + 7 * DAY_SECONDS) continue
    if (!latest || semester > latest) latest = semester
  }
  return latest
}

function buildActivities(
  events: WsEvent[],
  actionEvents: WsActionEvent[],
  modules: Map<string, WsModule>,
  currentIds: Set<number>,
): Activity[] {
  const actions = new Map(actionEvents.map((event) => [event.id, event]))
  const activities = new Map<number, Activity>()

  for (const event of events) {
    const module = event.modulename ?? ''
    if (module === 'attendance' || /^open/.test(event.eventtype) || event.eventtype === 'gradingdue') continue
    if (!currentIds.has(event.courseid)) continue
    const info = modules.get(`${module}:${event.instance}`)
    const action = actions.get(event.id)
    activities.set(event.id, {
      id: event.id,
      courseId: event.courseid,
      name: info?.name ? cleanText(info.name) : action?.activityname ? cleanText(action.activityname) : cleanEventName(event.name),
      module,
      eventType: event.eventtype,
      dueAt: toIso(event.timestart),
      url: info?.url ?? action?.url ?? `${MOODLE_URL}/course/view.php?id=${event.courseid}`,
      pending: Boolean(action),
      overdue: action?.overdue ?? false,
      actionLabel: action?.action?.name ?? null,
    })
  }
  // Pending events outside the calendar window still matter.
  for (const action of actionEvents) {
    const courseId = action.course?.id ?? 0
    if (activities.has(action.id) || !currentIds.has(courseId)) continue
    activities.set(action.id, {
      id: action.id,
      courseId,
      name: cleanText(action.activityname ?? cleanEventName(action.name)),
      module: action.modulename ?? '',
      eventType: action.eventtype,
      dueAt: toIso(action.timesort),
      url: action.url,
      pending: true,
      overdue: action.overdue,
      actionLabel: action.action?.name ?? null,
    })
  }
  return [...activities.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}

function cleanEventName(name: string): string {
  return cleanText(name)
    .replace(/\s+está marcad[oa]\(a\) para esta data$/i, '')
    .replace(/\s+\(Data limite\)$/i, '')
    .replace(/^Término de\s+/i, '')
}

function toIso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}

// ---------------------------------------------------------------- attendance

/**
 * The "Presença" (mod_attendance) web services are not available to the mobile token, so the
 * sessions are read from the activity page (GET only, read-only). The page needs a web session:
 * the one created at login, or a new one opened with the mobile autologin key.
 */
async function readAttendance(
  auth: MoodleAuth,
  cmidsByCourse: Map<number, number[]>,
): Promise<{ attendance: Record<number, CourseAttendance>; session: string | null; issue: AttendanceIssue | null }> {
  const targets = [...cmidsByCourse].flatMap(([courseId, cmids]) => cmids.map((cmid) => ({ courseId, cmid })))
  const attendance: Record<number, CourseAttendance> = {}
  if (targets.length === 0) return { attendance, session: auth.session, issue: null }

  const pageUrl = (cmid: number) => `${MOODLE_URL}/mod/attendance/view.php?id=${cmid}&view=5`
  const client = new HttpClient()
  let session = auth.session
  let firstPage: string | null = null

  if (session) {
    client.jar.add(MOODLE_HOST, session)
    const response = await client.request(pageUrl(targets[0].cmid))
    if (response.status === 200) firstPage = await response.text()
    else await response.body?.cancel()
  }

  if (firstPage === null) {
    if (!auth.privateToken) return { attendance, session: null, issue: 'session_failed' }
    try {
      const key = await callWs<{ key: string; autologinurl: string }>(
        auth.token,
        'tool_mobile_get_autologin_key',
        { privatetoken: auth.privateToken },
        MOODLE_APP_USER_AGENT,
      )
      const freshClient = new HttpClient()
      const url = `${key.autologinurl}?userid=${auth.userId}&key=${key.key}&urltogo=${encodeURIComponent(pageUrl(targets[0].cmid))}`
      const step = await freshClient.follow(url)
      const html = await step.response.text()
      session = freshClient.jar.find(MOODLE_HOST, (name) => name.startsWith('MoodleSession'))
      if (!step.url.startsWith(`${MOODLE_URL}/mod/attendance/`) || !session) {
        return { attendance, session: null, issue: 'session_failed' }
      }
      client.jar.add(MOODLE_HOST, session)
      firstPage = html
    } catch (error) {
      if (error instanceof AppError) throw error
      const lockout = error instanceof MoodleWsError && error.errorcode === 'autologinkeygenerationlockout'
      return { attendance, session: null, issue: lockout ? 'lockout' : 'session_failed' }
    }
  }

  const pages = await Promise.all(
    targets.map(async ({ cmid }, index) => {
      if (index === 0) return firstPage
      const response = await client.request(pageUrl(cmid))
      if (response.status !== 200) {
        await response.body?.cancel()
        return ''
      }
      return response.text()
    }),
  )

  targets.forEach(({ courseId, cmid }, index) => {
    const sessions = parseAttendancePage(pages[index] ?? '')
    const entry = attendance[courseId] ?? { cmids: [], sessions: [] }
    entry.cmids.push(cmid)
    entry.sessions.push(...sessions)
    entry.sessions.sort((a, b) => a.start.localeCompare(b.start))
    attendance[courseId] = entry
  })
  return { attendance, session: client.jar.find(MOODLE_HOST, (name) => name.startsWith('MoodleSession')) ?? session, issue: null }
}

export function parseAttendancePage(html: string): AttendanceSession[] {
  if (!html) return []
  const document = parse(html)
  const table = document.querySelectorAll('table.generaltable').find((candidate) => candidate.querySelector('td.datecol'))
  if (!table) return []
  const sessions: AttendanceSession[] = []
  for (const row of table.querySelectorAll('tr')) {
    const dateCell = row.querySelector('td.datecol')
    if (!dateCell) continue
    const range = parseDateRange(cleanText(dateCell.text))
    if (!range) continue
    const statusLabel = cleanText(row.querySelector('td.statuscol')?.text ?? '')
    const pointsText = cleanText(row.querySelector('td.pointscol')?.text ?? '')
    const durationClasses = Math.max(1, Math.round((Date.parse(range.end) - Date.parse(range.start)) / 60_000 / CLASS_MINUTES))
    const points = parsePoints(pointsText, statusLabel, durationClasses)
    sessions.push({
      start: range.start,
      end: range.end,
      description: cleanText(row.querySelector('td.desccol')?.text ?? ''),
      status: classify(points.points, points.maxPoints, statusLabel),
      statusLabel,
      points: points.points,
      maxPoints: points.maxPoints,
    })
  }
  return sessions
}

/** "10/08/26 (seg.) 18:30 - 20:10" or "4/12/26 (sex.) 20:20 - 22". Times are America/Sao_Paulo. */
function parseDateRange(text: string): { start: string; end: string } | null {
  const date = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/)
  if (!date) return null
  const [, day, month, rawYear] = date
  const year = rawYear.length === 2 ? `20${rawYear}` : rawYear
  const time = text.slice(date.index! + date[0].length).match(/(\d{1,2})(?::(\d{2}))?\s*-\s*(\d{1,2})(?::(\d{2}))?/)
  const pad = (value: string | undefined) => (value ?? '00').padStart(2, '0')
  const isoDate = `${year}-${pad(month)}-${pad(day)}`
  if (!time) return { start: `${isoDate}T00:00:00${BRAZIL_OFFSET}`, end: `${isoDate}T23:59:00${BRAZIL_OFFSET}` }
  const [, startHour, startMinute, endHour, endMinute] = time
  return {
    start: `${isoDate}T${pad(startHour)}:${pad(startMinute)}:00${BRAZIL_OFFSET}`,
    end: `${isoDate}T${pad(endHour)}:${pad(endMinute)}:00${BRAZIL_OFFSET}`,
  }
}

function parsePoints(text: string, statusLabel: string, durationClasses: number): { points: number | null; maxPoints: number } {
  const match = text.match(/([\d.,?]+)\s*\/\s*([\d.,]+)/)
  if (match) {
    const maxPoints = Number(match[2].replace(',', '.')) || durationClasses
    const points = match[1].includes('?') ? null : Number(match[1].replace(',', '.'))
    return { points: Number.isNaN(points) ? null : points, maxPoints }
  }
  // Activity without grades: infer from the status text and the session length.
  if (!statusLabel || statusLabel === '?') return { points: null, maxPoints: durationClasses }
  const absent = /ausente|falt|justific/i.test(statusLabel)
  return { points: absent ? 0 : durationClasses, maxPoints: durationClasses }
}

function classify(points: number | null, maxPoints: number, label: string): SessionStatus {
  if (points === null) return 'pending'
  if (/justific/i.test(label)) return 'justified'
  if (points >= maxPoints) return 'present'
  if (points <= 0) return 'absent'
  return 'partial'
}
