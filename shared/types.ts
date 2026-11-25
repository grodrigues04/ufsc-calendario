// Contract between the serverless functions (api/) and the app (src/).

/** A weekly meeting from the CAGR schedule. `weekday` follows Date#getDay (1 = segunda). */
export interface ScheduleSlot {
  weekday: number
  start: string // "18:30"
  end: string // "20:10"
  classes: number // number of 50-minute classes ("aulas")
  room: string // "CTC/CTC304"
}

export interface Discipline {
  code: string // "INE5614"
  classGroup: string // turma, "05238"
  name: string
  professors: string[]
  schedule: ScheduleSlot[]
}

export interface Student {
  name: string
  registration: string // matrícula
  program: string // curso
  semester: string // "20262"
}

export type SessionStatus = 'present' | 'absent' | 'partial' | 'justified' | 'pending'

/** One row of the Moodle "Presença" activity. Points are counted in classes (aulas). */
export interface AttendanceSession {
  start: string // ISO 8601 with offset
  end: string
  description: string
  status: SessionStatus
  statusLabel: string
  points: number | null // null while the professor has not taken attendance
  maxPoints: number
}

export interface CourseAttendance {
  cmids: number[]
  sessions: AttendanceSession[]
  /** Set by the app: when these sessions were read from Moodle (ISO). */
  readAt?: string
}

export interface Course {
  id: number
  shortname: string
  name: string // fullname without the "CODE-TURMA (SEMESTRE) - " prefix
  code: string | null // "INE5614"
  classGroup: string | null // "05238A/B"
  semester: string | null // "20262"
  url: string
}

export interface Activity {
  id: number // calendar event id
  courseId: number
  name: string
  module: string // assign, quiz, ... ("" for plain calendar events)
  eventType: string
  dueAt: string // ISO 8601
  url: string
  pending: boolean // Moodle still expects an action from the student
  overdue: boolean
  actionLabel: string | null
}

export interface MoodleAuth {
  token: string
  /** Lets the server open a new web session (autologin) without the password. */
  privateToken: string | null
  userId: number
  /** Web session cookie ("MoodleSession...=value"), reused to read attendance pages. */
  session: string | null
}

export type AttendanceIssue = 'lockout' | 'session_failed'

/** A group assignment ("envio em grupo") and whether the group already submitted it. */
export interface GroupSubmission {
  cmid: number
  courseId: number
  name: string
  url: string
  submitted: boolean
  /** When the group's submission was last saved (ISO), if any. */
  submittedAt: string | null
  /**
   * The student opened the discipline in Moodle after (or right before) the submission:
   * most likely they sent it themselves. Moodle does not say who submitted a group's work.
   */
  likelyMine: boolean
}

export interface SyncResult {
  syncedAt: string
  semester: string | null
  courses: Course[]
  activities: Activity[]
  /** Keyed by Moodle course id. */
  attendance: Record<number, CourseAttendance>
  groupSubmissions: GroupSubmission[]
  session: string | null
  attendanceIssue: AttendanceIssue | null
  /** Courses whose attendance could not be read, even after logging in to Moodle again. */
  attendanceFailed?: number[]
}

export interface LoginResult {
  auth: MoodleAuth
  student: Student | null
  disciplines: Discipline[]
  sync: SyncResult
  notices: LoginNotice[]
}

export type LoginNotice = 'collecta' | 'cagr_unavailable'

export type LoginStep = 'auth' | 'moodle' | 'cagr' | 'sync'

export type ErrorCode =
  | 'bad_request'
  | 'invalid_credentials'
  | 'unsupported_login_step'
  | 'ufsc_unavailable'
  | 'moodle_token_failed'
  | 'invalid_token'
  | 'unknown'

export type LoginEvent =
  | { type: 'progress'; step: LoginStep }
  | { type: 'result'; data: LoginResult }
  | { type: 'error'; code: ErrorCode; message: string }

export interface SyncRequest {
  auth: MoodleAuth
  semester: string | null
  /** Course id -> attendance cmids already known, so their pages load in parallel. */
  attendanceCmids?: Record<number, number[]>
}

export interface ApiError {
  code: ErrorCode
  message: string
}
