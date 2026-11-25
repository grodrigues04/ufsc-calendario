// Moodle UFSC (presencial.moodle.ufsc.br): mobile token, web services and attendance pages.

import { createHash, randomBytes } from 'node:crypto'
import { parse } from 'node-html-parser'
import type {
  Activity,
  AttendanceIssue,
  GroupSubmission,
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

// ---------------------------------------------------------------- identity

const identities = new Map<string, { userId: number; expires: number }>()
const IDENTITY_TTL_MS = 10 * 60_000

/** Asks Moodle who owns the token (cached briefly by a hash of the token, never the token itself). */
export async function getMoodleUserId(token: string): Promise<number> {
  const cacheKey = createHash('sha256').update(token).digest('hex')
  const cached = identities.get(cacheKey)
  if (cached && cached.expires > Date.now()) return cached.userId
  const site = await callWs<{ userid: number }>(token, 'core_webservice_get_site_info')
  identities.set(cacheKey, { userId: site.userid, expires: Date.now() + IDENTITY_TTL_MS })
  if (identities.size > 1000) identities.delete(identities.keys().next().value!)
  return site.userid
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
  /** Last time the student opened the course (Moodle updates it at most once a minute). */
  lastaccess?: number | null
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
  // Courses first: opening an attendance page updates the course "last access", which is how
  // group submissions made by someone else are told apart from the student's own.
  const enrolled = await callWs<WsCourse[]>(auth.token, 'core_enrol_get_users_courses', {
    userid: auth.userId,
    returnusercount: 0,
  })
  const knownTargets = new Map(Object.entries(knownAttendance).map(([courseId, cmids]) => [Number(courseId), cmids]))
  const earlyAttendance = knownTargets.size ? readAttendance(auth, knownTargets) : null
  // Avoid an unhandled rejection while the web services below are still running.
  earlyAttendance?.catch(() => {})

  const courses = enrolled.map(toCourse)
  const semester = semesterHint ?? currentSemester(enrolled, now)
  const current = courses.filter((course) => course.semester === semester)
  const currentIds = new Set(current.map((course) => course.id))
  // Only real disciplines define the semester start (some institutional courses are years old).
  const disciplineStarts = enrolled
    .filter((course) => currentIds.has(course.id) && toCourse(course).code && course.startdate)
    .map((course) => course.startdate!)
  const semesterStart = Math.min(disciplineStarts.length ? Math.min(...disciplineStarts) : now, now - 30 * DAY_SECONDS)

  const lastAccess = new Map(enrolled.map((course) => [course.id, course.lastaccess ?? 0]))
  const statusCache = new Map<number, Promise<AssignStatus>>()
  const submissionStatus = (assignId: number) => {
    if (!statusCache.has(assignId)) {
      statusCache.set(assignId, callWs<AssignStatus>(auth.token, 'mod_assign_get_submission_status', { assignid: assignId }))
    }
    return statusCache.get(assignId)!
  }

  // Courses whose contents did not load: their attendance activities are unknown in this sync.
  const contentsFailed = new Set<number>()
  const [contents, calendar, actions, assignments] = await Promise.all([
    Promise.all(
      current.map((course) =>
        callWs<Array<{ modules: WsModule[] }>>(auth.token, 'core_course_get_contents', {
          courseid: course.id,
          options: [{ name: 'excludecontents', value: 1 }],
        }).catch((error: unknown) => {
          if (error instanceof AppError) throw error
          contentsFailed.add(course.id)
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
    current.length
      ? callWs<{ courses: Array<{ id: number; assignments: WsAssignment[] }> }>(auth.token, 'mod_assign_get_assignments', {
          courseids: current.map((course) => course.id),
        }).catch((error: unknown) => {
          if (error instanceof AppError) throw error
          return { courses: [] }
        })
      : Promise.resolve({ courses: [] }),
  ])

  const modules = new Map<string, WsModule>()
  const modulesByCmid = new Map<number, WsModule>()
  const attendanceCmids = new Map<number, number[]>()
  current.forEach((course, index) => {
    for (const section of contents[index]) {
      for (const module of section.modules) {
        modules.set(`${module.modname}:${module.instance}`, module)
        modulesByCmid.set(module.id, module)
        if (module.modname === 'attendance' && module.uservisible !== false) {
          attendanceCmids.set(course.id, [...(attendanceCmids.get(course.id) ?? []), module.id])
        }
      }
    }
  })

  const [activities, groupSubmissions, attendanceRead] = await Promise.all([
    pendingActivities(auth, buildActivities(calendar.events, actions, modules, modulesByCmid, currentIds, now), now, submissionStatus),
    readGroupSubmissions(assignments.courses, lastAccess, now, submissionStatus),
    earlyAttendance ?? readAttendance(auth, attendanceCmids),
  ])
  let { attendance, session, issue } = attendanceRead
  if (earlyAttendance) {
    // Keep only current courses and read attendance activities the hint did not know about.
    attendance = Object.fromEntries(
      Object.entries(attendance).filter(([courseId]) => attendanceCmids.has(Number(courseId)) || contentsFailed.has(Number(courseId))),
    )
    const missing = new Map(
      [...attendanceCmids]
        .map(([courseId, cmids]) => [courseId, cmids.filter((cmid) => !knownTargets.get(courseId)?.includes(cmid))] as const)
        .filter(([, cmids]) => cmids.length > 0),
    )
    if (missing.size && session) {
      const extra = await readAttendance({ ...auth, session }, missing)
      for (const courseId of missing.keys()) {
        const entry = extra.attendance[courseId]
        if (!entry) {
          // Half a course would look complete: it counts as not read.
          delete attendance[courseId]
          continue
        }
        const merged = attendance[courseId] ?? { cmids: [], sessions: [] }
        merged.cmids.push(...entry.cmids)
        merged.sessions = [...merged.sessions, ...entry.sessions].sort((a, b) => a.start.localeCompare(b.start))
        attendance[courseId] = merged
      }
      session = extra.session ?? session
      issue = issue ?? extra.issue
    }
  }
  // Courses with an attendance activity (or whose contents did not load) that were not read:
  // the app keeps their last reading and tells the student it could not update them.
  const attendanceFailed = [...new Set([...attendanceCmids.keys(), ...contentsFailed])].filter((courseId) => !attendance[courseId])
  // Older app versions only look at attendanceIssue: with it set they keep the attendance they had.
  if (attendanceFailed.length && !issue) issue = 'session_failed'

  return {
    syncedAt: new Date().toISOString(),
    semester,
    courses: current,
    activities,
    attendance,
    groupSubmissions,
    session,
    attendanceIssue: issue,
    attendanceFailed,
  }
}

interface WsAssignment {
  id: number
  cmid: number
  name: string
  duedate: number
  teamsubmission: number
}

// Group assignments outside this window are settled history.
const GROUP_WINDOW_PAST = 30 * DAY_SECONDS
const GROUP_WINDOW_FUTURE = 120 * DAY_SECONDS
// Moodle updates "last access" at most once a minute; submitting takes a few page loads.
const OWN_SUBMISSION_TOLERANCE = 5 * 60

async function readGroupSubmissions(
  courses: Array<{ id: number; assignments: WsAssignment[] }>,
  lastAccess: Map<number, number>,
  now: number,
  submissionStatus: (assignId: number) => Promise<AssignStatus>,
): Promise<GroupSubmission[]> {
  const candidates = courses.flatMap((course) =>
    course.assignments
      .filter((assignment) => assignment.teamsubmission)
      .filter((assignment) => !assignment.duedate || (assignment.duedate > now - GROUP_WINDOW_PAST && assignment.duedate < now + GROUP_WINDOW_FUTURE))
      .map((assignment) => ({ assignment, courseId: course.id })),
  )
  const results = await Promise.all(
    candidates.map(async ({ assignment, courseId }): Promise<GroupSubmission | null> => {
      try {
        const team = (await submissionStatus(assignment.id)).lastattempt?.teamsubmission
        const submitted = team?.status === 'submitted'
        const savedAt = team?.timemodified ?? 0
        return {
          cmid: assignment.cmid,
          courseId,
          name: cleanText(assignment.name),
          url: `${MOODLE_URL}/mod/assign/view.php?id=${assignment.cmid}`,
          submitted,
          submittedAt: submitted && savedAt ? toIso(savedAt) : null,
          likelyMine: submitted && (lastAccess.get(courseId) ?? 0) >= savedAt - OWN_SUBMISSION_TOLERANCE,
        }
      } catch {
        return null
      }
    }),
  )
  return results.filter((result): result is GroupSubmission => result !== null)
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

/** An activity plus the ids needed to check it with the module's own web services. */
interface ActivityCandidate extends Activity {
  instance: number | null
  cmid: number | null
}

function cmidFromUrl(url: string | undefined): number | null {
  if (!url) return null
  const id = Number(new URL(url).searchParams.get('id'))
  return Number.isInteger(id) && id > 0 ? id : null
}

function buildActivities(
  events: WsEvent[],
  actionEvents: WsActionEvent[],
  modules: Map<string, WsModule>,
  modulesByCmid: Map<number, WsModule>,
  currentIds: Set<number>,
  now: number,
): ActivityCandidate[] {
  const actions = new Map(actionEvents.map((event) => [event.id, event]))
  const activities = new Map<number, ActivityCandidate>()

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
      // Module events count while Moodle expects an action; plain course events (exams) while upcoming.
      pending: module ? Boolean(action) : event.timestart >= now,
      overdue: action?.overdue ?? false,
      actionLabel: action?.action?.name ?? null,
      instance: event.instance ?? null,
      cmid: info?.id ?? cmidFromUrl(action?.url),
    })
  }
  // Pending events outside the calendar window still matter.
  for (const action of actionEvents) {
    const courseId = action.course?.id ?? 0
    if (activities.has(action.id) || !currentIds.has(courseId)) continue
    const cmid = cmidFromUrl(action.url)
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
      instance: (cmid && modulesByCmid.get(cmid)?.instance) || null,
      cmid,
    })
  }
  return [...activities.values()].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
}

interface AssignStatus {
  lastattempt?: {
    submission?: { status: string }
    teamsubmission?: { status: string; timemodified?: number }
    submissionsenabled?: boolean
    canedit?: boolean
    graded?: boolean
    gradingstatus?: string
  }
  feedback?: unknown
}

// Class group created from CAGR in combined courses: "INE5645-05238B (20262)".
const CLASS_GROUP_NAME = /^[A-Z]{3}\d{4}-\S+\s*\(\d{5}\)$/

/**
 * Moodle's timeline keeps items "pending" that need nothing else from the student. This checks
 * each one with its module: submitted (by the student or the group), already graded (in-class
 * evaluations), closed for submissions, or a group choice the student already made.
 */
async function isSettled(
  auth: MoodleAuth,
  activity: ActivityCandidate,
  now: number,
  submissionStatus: (assignId: number) => Promise<AssignStatus>,
): Promise<boolean> {
  const past = Date.parse(activity.dueAt) / 1000 < now
  if (activity.module === 'assign' && activity.instance) {
    const status = await submissionStatus(activity.instance)
    const attempt = status.lastattempt
    if (attempt?.submission?.status === 'submitted' || attempt?.teamsubmission?.status === 'submitted') return true
    if (attempt?.graded || attempt?.gradingstatus === 'graded' || status.feedback) return true
    // Before the due date "cannot edit" may only mean "not open yet".
    return past && (attempt?.submissionsenabled === false || attempt?.canedit === false)
  }
  if (activity.module === 'quiz' && activity.instance) {
    const { attempts } = await callWs<{ attempts: unknown[] }>(auth.token, 'mod_quiz_get_user_attempts', {
      quizid: activity.instance,
      status: 'finished',
      includepreviews: 0,
    })
    return attempts.length > 0
  }
  if (activity.module === 'groupselect') {
    const groupingId = activity.cmid
      ? ((await callWs<{ cm?: { groupingid?: number } }>(auth.token, 'core_course_get_course_module', { cmid: activity.cmid })).cm
          ?.groupingid ?? 0)
      : 0
    const { groups } = await callWs<{ groups: Array<{ name: string }> }>(auth.token, 'core_group_get_course_user_groups', {
      courseid: activity.courseId,
      userid: auth.userId,
      groupingid: groupingId,
    })
    return groups.some((group) => groupingId > 0 || !CLASS_GROUP_NAME.test(cleanText(group.name)))
  }
  return false
}

/** Keeps only what still needs the student (the Atividades tab hides delivered work). */
async function pendingActivities(
  auth: MoodleAuth,
  candidates: ActivityCandidate[],
  now: number,
  submissionStatus: (assignId: number) => Promise<AssignStatus>,
): Promise<Activity[]> {
  const checked = await Promise.all(
    candidates.map(async (candidate) => {
      if (!candidate.pending || !candidate.module) return candidate
      // If a check fails, Moodle's own answer stands.
      const settled = await isSettled(auth, candidate, now, submissionStatus).catch(() => false)
      return settled ? { ...candidate, pending: false } : candidate
    }),
  )
  return checked
    .filter((candidate) => candidate.pending)
    .map(({ id, courseId, name, module, eventType, dueAt, url, pending, overdue, actionLabel }) => ({
      id,
      courseId,
      name,
      module,
      eventType,
      dueAt,
      url,
      pending,
      overdue,
      actionLabel,
    }))
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
 * the one the app saved, or a new login with the app's autologin key (no password needed).
 * Pages that do not open get a new login and one more try; courses still unread are left out
 * (the caller reports them as failed, and the app shows that it could not update them).
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
  const pages: Array<string | null> = targets.map(() => null)
  let session = auth.session
  let loggedIn = false
  let loginIssue: AttendanceIssue | null = null

  /** New web session landing on the page at `index` (Moodle allows one every 6 minutes). */
  const logIn = async (index: number): Promise<boolean> => {
    loggedIn = true
    const login = await openWebSession(auth, pageUrl(targets[index].cmid))
    if ('issue' in login) {
      loginIssue = login.issue
      return false
    }
    session = login.session
    client.jar.add(MOODLE_HOST, login.session)
    pages[index] = login.html
    return true
  }
  const readPage = async (cmid: number): Promise<string | null> => {
    try {
      const response = await client.request(pageUrl(cmid))
      if (response.status !== 200) {
        await response.body?.cancel()
        return null
      }
      const html = await response.text()
      return isAttendancePage(html) ? html : null
    } catch {
      return null
    }
  }
  const readMissing = async () => {
    const missing = targets.flatMap((_, index) => (pages[index] === null ? [index] : []))
    const htmls = await Promise.all(missing.map((index) => readPage(targets[index].cmid)))
    missing.forEach((index, position) => {
      pages[index] = htmls[position]
    })
  }

  // The first page tells whether the saved session still works; if not, log in again.
  if (session) {
    client.jar.add(MOODLE_HOST, session)
    pages[0] = await readPage(targets[0].cmid)
  }
  if (pages[0] === null && !(await logIn(0))) return { attendance, session: null, issue: loginIssue ?? 'session_failed' }
  await readMissing()
  // A page that still did not open: a new login (unless this session was just opened), then one more try.
  if (pages.includes(null)) {
    if (!loggedIn) await logIn(pages.indexOf(null))
    await readMissing()
  }

  // Half a course would look complete: a course with any unread page counts as not read.
  const failed = new Set(targets.filter((_, index) => pages[index] === null).map(({ courseId }) => courseId))
  targets.forEach(({ courseId, cmid }, index) => {
    const page = pages[index]
    if (page === null || failed.has(courseId)) return
    const entry = attendance[courseId] ?? { cmids: [], sessions: [] }
    entry.cmids.push(cmid)
    entry.sessions.push(...parseAttendancePage(page))
    entry.sessions.sort((a, b) => a.start.localeCompare(b.start))
    attendance[courseId] = entry
  })
  return {
    attendance,
    session: client.jar.find(MOODLE_HOST, (name) => name.startsWith('MoodleSession')) ?? session,
    issue: failed.size ? (loginIssue ?? 'session_failed') : null,
  }
}

/** Logs in to the Moodle website with the app's autologin key and opens `landingUrl`. */
async function openWebSession(
  auth: MoodleAuth,
  landingUrl: string,
): Promise<{ session: string; html: string | null } | { issue: AttendanceIssue }> {
  if (!auth.privateToken) return { issue: 'session_failed' }
  try {
    const key = await callWs<{ key: string; autologinurl: string }>(
      auth.token,
      'tool_mobile_get_autologin_key',
      { privatetoken: auth.privateToken },
      MOODLE_APP_USER_AGENT,
    )
    const client = new HttpClient()
    const step = await client.follow(`${key.autologinurl}?userid=${auth.userId}&key=${key.key}&urltogo=${encodeURIComponent(landingUrl)}`)
    const html = await step.response.text()
    const session = client.jar.find(MOODLE_HOST, (name) => name.startsWith('MoodleSession'))
    // Landing on the page means Moodle took the key; the page itself may still have failed.
    if (!session || !step.url.startsWith(`${MOODLE_URL}/mod/attendance/`)) return { issue: 'session_failed' }
    return { session, html: isAttendancePage(html) ? html : null }
  } catch (error) {
    if (error instanceof AppError) throw error
    const lockout = error instanceof MoodleWsError && error.errorcode === 'autologinkeygenerationlockout'
    return { issue: lockout ? 'lockout' : 'session_failed' }
  }
}

/** Moodle answers with another page when it cannot show this one (expired session, error, notice). */
function isAttendancePage(html: string): boolean {
  return html.includes('id="page-mod-attendance-view"')
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
