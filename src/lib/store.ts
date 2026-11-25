import { semesterOf } from '@shared/semester'
import type { CourseAttendance, Discipline, LoginNotice, LoginResult, MoodleAuth, Student, SyncResult } from '@shared/types'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

interface AppState {
  auth: MoodleAuth | null
  student: Student | null
  disciplines: Discipline[]
  sync: SyncResult | null
  notices: LoginNotice[]
  syncing: boolean
  signIn: (result: LoginResult) => void
  applySync: (result: SyncResult) => void
  setSyncing: (syncing: boolean) => void
  signOut: () => void
}

/** Everything the app shows lives on the device (localStorage). The password is never stored. */
export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      auth: null,
      student: null,
      disciplines: [],
      sync: null,
      notices: [],
      syncing: false,
      signIn: (result) =>
        set({
          auth: result.auth,
          student: result.student,
          disciplines: result.disciplines,
          sync: withReadings(result.sync, null),
          notices: result.notices,
        }),
      applySync: (result) => {
        const { auth, sync: previous } = get()
        if (!auth) return
        set({ sync: withReadings(result, previous), auth: { ...auth, session: result.session } })
      },
      setSyncing: (syncing) => set({ syncing }),
      signOut: () => set({ auth: null, student: null, disciplines: [], sync: null, notices: [] }),
    }),
    {
      name: 'chamada:v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ auth, student, disciplines, sync, notices }) => ({ auth, student, disciplines, sync, notices }),
    },
  ),
)

/**
 * Stamps when each course's attendance was read. Courses Moodle did not let the app read keep
 * their last reading: the screens show it with a warning instead of an empty discipline.
 */
function withReadings(result: SyncResult, previous: SyncResult | null): SyncResult {
  const attendance: Record<number, CourseAttendance> = {}
  for (const [courseId, entry] of Object.entries(result.attendance)) attendance[Number(courseId)] = { ...entry, readAt: result.syncedAt }
  // Before attendanceFailed existed, attendanceIssue meant "nothing was read".
  const failed = result.attendanceFailed ?? (result.attendanceIssue && previous ? Object.keys(previous.attendance).map(Number) : [])
  for (const courseId of failed) {
    const last = previous?.attendance[courseId]
    if (last && !attendance[courseId]) attendance[courseId] = { ...last, readAt: last.readAt ?? previous!.syncedAt }
  }
  return { ...result, attendance, attendanceFailed: failed }
}

/**
 * Semester the manual absences belong to: CAGR's, else Moodle's, but never one the calendar says
 * already ended. The server deletes those, and an app still logged in from last semester (the
 * CAGR grade is only read at login) would otherwise save new absences that disappear right away.
 */
export function notesSemester(state: Pick<AppState, 'student' | 'sync'>, now = new Date()): string {
  const calendar = semesterOf(now)
  const known = state.student?.semester || state.sync?.semester
  return known && known > calendar ? known : calendar
}

export function useSemester(): string {
  return useApp((state) => notesSemester(state))
}

/** A clock shared by the screens, ticking every 30 seconds. */
export const useClock = create<{ now: Date; tick: () => void }>()((set) => ({
  now: new Date(),
  tick: () => set({ now: new Date() }),
}))
