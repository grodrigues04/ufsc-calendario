import type { Discipline, LoginNotice, LoginResult, MoodleAuth, Student, SyncResult } from '@shared/types'
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
          sync: result.sync,
          notices: result.notices,
        }),
      applySync: (result) => {
        const { auth, sync: previous } = get()
        if (!auth) return
        // When Moodle refused a new web session, keep the attendance we already had.
        const attendance = result.attendanceIssue && previous ? { ...previous.attendance, ...result.attendance } : result.attendance
        set({ sync: { ...result, attendance }, auth: { ...auth, session: result.session } })
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

/** A clock shared by the screens, ticking every 30 seconds. */
export const useClock = create<{ now: Date; tick: () => void }>()((set) => ({
  now: new Date(),
  tick: () => set({ now: new Date() }),
}))
