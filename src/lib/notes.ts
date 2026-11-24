// Manual absences: saved on the device first (instant, offline) and synced to the server
// (encrypted in Neon, keyed by the Moodle account) so they survive a new phone or "Sair".

import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { ApiError } from '@shared/types'
import {
  changedSince,
  type ManualNotes,
  MAX_NOTE_LENGTH,
  type NotesResponse,
  sameNotes,
  sanitizeNotes,
  setRecord,
} from '@shared/notes'
import { useApp } from './store'

type SyncState = 'idle' | 'saving' | 'offline' | 'error'

export interface AbsenceInput {
  date: string | null
  note: string
}

interface NotesState {
  /** Moodle user id that owns the local notes. */
  ownerId: number | null
  notes: ManualNotes
  /** Local changes the server has not confirmed yet. */
  dirty: boolean
  status: SyncState
  /** Returns the new record id (used by "Desfazer"). */
  addAbsence: (semester: string, disciplineId: string, input: AbsenceInput) => string
  updateAbsence: (semester: string, disciplineId: string, recordId: string, input: AbsenceInput) => void
  deleteAbsence: (semester: string, disciplineId: string, recordId: string) => void
}

function newId(): string {
  return crypto.randomUUID()
}

export const useNotes = create<NotesState>()(
  persist(
    (set, get) => {
      const save = (notes: ManualNotes) => {
        set({ notes, dirty: true })
        scheduleSave()
      }
      const record = (input: AbsenceInput) => ({
        date: input.date,
        note: input.note.trim().slice(0, MAX_NOTE_LENGTH),
        updatedAt: new Date().toISOString(),
      })
      return {
        ownerId: null,
        notes: {},
        dirty: false,
        status: 'idle',
        addAbsence: (semester, disciplineId, input) => {
          const id = newId()
          save(setRecord(get().notes, semester, disciplineId, id, record(input)))
          return id
        },
        updateAbsence: (semester, disciplineId, recordId, input) =>
          save(setRecord(get().notes, semester, disciplineId, recordId, record(input))),
        deleteAbsence: (semester, disciplineId, recordId) => {
          const current = get().notes[semester]?.[disciplineId]?.[recordId]
          if (!current) return
          save(setRecord(get().notes, semester, disciplineId, recordId, { ...current, deleted: true, updatedAt: new Date().toISOString() }))
        },
      }
    },
    {
      name: 'chamada:notes:v1',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ ownerId, notes, dirty }) => ({ ownerId, notes, dirty }),
      // Version 1 stored a count per discipline: it becomes undated absences.
      migrate: (persisted) => {
        const state = (persisted ?? {}) as { ownerId?: number | null; notes?: unknown; dirty?: boolean }
        return { ownerId: state.ownerId ?? null, notes: sanitizeNotes(state.notes) ?? {}, dirty: Boolean(state.dirty) } as NotesState
      },
    },
  ),
)

const SAVE_DELAY_MS = 700
let saveTimer: number | undefined
let inFlight: Promise<void> | null = null

function scheduleSave(): void {
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => void syncNotes(), SAVE_DELAY_MS)
}

/** Sends local changes (if any) and brings the saved notes back. */
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
      let merged = saved
      for (const [semester, disciplines] of Object.entries(changed)) {
        for (const [discipline, records] of Object.entries(disciplines)) {
          for (const [id, record] of Object.entries(records)) merged = setRecord(merged, semester, discipline, id, record)
        }
      }
      useNotes.setState({ notes: merged, dirty: !sameNotes(merged, saved), status: 'idle' })
    } catch {
      useNotes.setState({ status: navigator.onLine ? 'error' : 'offline' })
    } finally {
      inFlight = null
    }
  })()
  return inFlight
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
