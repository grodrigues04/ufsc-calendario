import { useEffect, useRef } from 'react'
import { create } from 'zustand'

/** Sheet to register a manual absence (recordId null) or edit one. */
export interface AbsenceSheet {
  disciplineId: string
  recordId: string | null
  /** Class day to start with (from a "falta lançada no Moodle" news). */
  presetDate: string | null
  /** Changes on every opening, so the form always starts fresh. */
  openedAt: number
}

interface UiState {
  disciplineId: string | null
  profileOpen: boolean
  absence: AbsenceSheet | null
  openDiscipline: (id: string) => void
  closeDiscipline: () => void
  setProfileOpen: (open: boolean) => void
  openAbsence: (disciplineId: string, recordId?: string, presetDate?: string) => void
  closeAbsence: () => void
}

export const useUi = create<UiState>()((set) => ({
  disciplineId: null,
  profileOpen: false,
  absence: null,
  openDiscipline: (disciplineId) => set({ disciplineId }),
  closeDiscipline: () => set({ disciplineId: null }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  openAbsence: (disciplineId, recordId, presetDate) =>
    set({ absence: { disciplineId, recordId: recordId ?? null, presetDate: presetDate ?? null, openedAt: Date.now() } }),
  closeAbsence: () => set({ absence: null }),
}))

/** Android/browser "back" closes an open sheet instead of leaving the screen. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    window.history.pushState({ sheet: true }, '')
    let closedByBack = false
    const onPop = () => {
      closedByBack = true
      close.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!closedByBack && window.history.state?.sheet) window.history.back()
    }
  }, [open])
}
