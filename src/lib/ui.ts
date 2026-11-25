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

// Sheets open right now, oldest first. A sheet can open over another ("Como funciona" over the
// profile): "back" closes only the one on top.
const openSheets: Array<() => void> = []
// history.back() calls made below after a sheet closed by swipe or button: their popstate is not a "back".
let ownBacks = 0
let listening = false

function onPopState(): void {
  if (ownBacks > 0) {
    ownBacks--
    return
  }
  openSheets.at(-1)?.()
}

/** Android/browser "back" closes the sheet on top instead of leaving the screen. */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    if (!listening) {
      window.addEventListener('popstate', onPopState)
      listening = true
    }
    let closedByBack = false
    const closeByBack = () => {
      closedByBack = true
      close.current()
    }
    openSheets.push(closeByBack)
    window.history.pushState({ sheet: true }, '')
    return () => {
      const index = openSheets.indexOf(closeByBack)
      if (index >= 0) openSheets.splice(index, 1)
      if (!closedByBack && window.history.state?.sheet) {
        ownBacks++
        window.history.back()
      }
    }
  }, [open])
}
