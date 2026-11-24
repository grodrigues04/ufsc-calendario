// Manual absences: saved on the device first (instant, offline) and synced to the server
// (encrypted in Neon, keyed by the Moodle account) so they survive a new phone or "Sair".

import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ApiError } from '@shared/types'
import { type ManualNotes, type NotesResponse, sameNotes } from '@shared/notes'
import { useApp } from './store'

type SyncState = 'idle' | 'saving' | 'offline' | 'error'

interface NotesState {
  /** Moodle user id that owns the local notes. */
  ownerId: number | null
  notes: ManualNotes
  /** Local changes the server has not confirmed yet. */
  dirty: boolean
  status: SyncState
  setAbsences: (semester: string, disciplineId: string, absences: number) => void
}

export const useNotes = create<NotesState>()(
  persist(
    (set) => ({
      ownerId: null,
      notes: {},
      dirty: false,
      status: 'idle',
      setAbsences: (semester, disciplineId, absences) => {
        set((state) => ({
          dirty: true,
          notes: {
            ...state.notes,
            [semester]: { ...state.notes[semester], [disciplineId]: { absences, updatedAt: new Date().toISOString() } },
          },
        }))
        scheduleSave()
      },
    }),
    {
      name: 'chamada:notes:v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ ownerId, notes, dirty }) => ({ ownerId, notes, dirty }),
    },
  ),
)

const SAVE_DELAY_MS = 900
let saveTimer: number | undefined
let inFlight: Promise<void> | null = null

function scheduleSave(): void {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void syncNotes(), SAVE_DELAY_MS)
}

/** Sends local changes (if any) and brings the saved notes back, merging by update time. */
export function syncNotes(): Promise<void> {
  if (inFlight) {
    // A change made during a request is sent right after it.
    return inFlight.then(() => (useNotes.getState().dirty ? syncNotes() : undefined))
  }
  const auth = useApp.getState().auth
  if (!auth) return Promise.resolve()
  if (!navigator.onLine) {
    useNotes.setState({ status: 'offline' })
    return Promise.resolve()
  }
  const sent = useNotes.getState()
  useNotes.setState({ status: 'saving' })
  inFlight = (async () => {
    try {
      const response = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: auth.token, ...(sent.dirty ? { notes: sent.notes } : {}) }),
      })
      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as ApiError | null
        throw new Error(error?.message ?? 'Não consegui salvar.')
      }
      const { notes: saved } = (await response.json()) as NotesResponse
      // The server's copy wins, except for what changed on the device while the request ran.
      const changed = changedSince(useNotes.getState().notes, sent.notes)
      const merged = { ...saved }
      for (const [semester, disciplines] of Object.entries(changed)) merged[semester] = { ...merged[semester], ...disciplines }
      useNotes.setState({ notes: merged, dirty: !sameNotes(merged, saved), status: 'idle' })
    } catch {
      useNotes.setState({ status: navigator.onLine ? 'error' : 'offline' })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

/** Entries of `current` that differ from the `sent` snapshot. */
function changedSince(current: ManualNotes, sent: ManualNotes): ManualNotes {
  const changed: ManualNotes = {}
  for (const [semester, disciplines] of Object.entries(current)) {
    for (const [discipline, entry] of Object.entries(disciplines)) {
      const before = sent[semester]?.[discipline]
      if (!before || before.absences !== entry.absences || before.updatedAt !== entry.updatedAt) {
        changed[semester] = { ...changed[semester], [discipline]: entry }
      }
    }
  }
  return changed
}

/** Sends pending changes before signing out (best effort, a few seconds at most). */
export async function flushNotes(): Promise<void> {
  window.clearTimeout(saveTimer)
  if (!useNotes.getState().dirty) return
  await Promise.race([syncNotes(), new Promise((resolve) => setTimeout(resolve, 4000))])
}

export function clearNotes(): void {
  window.clearTimeout(saveTimer)
  useNotes.setState({ ownerId: null, notes: {}, dirty: false, status: 'idle' })
}

/** Loads the saved notes when the app opens, and retries pending changes when back online. */
export function useNotesSync(userId: number | null): void {
  useEffect(() => {
    if (userId === null) return
    if (useNotes.getState().ownerId !== userId) {
      // Another account used this device: its notes are not this student's.
      useNotes.setState({ ownerId: userId, notes: {}, dirty: false, status: 'idle' })
    }
    void syncNotes()
    const onOnline = () => void syncNotes()
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [userId])
}
