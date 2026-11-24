import { useEffect, useRef } from 'react'
import { create } from 'zustand'

interface UiState {
  disciplineId: string | null
  profileOpen: boolean
  openDiscipline: (id: string) => void
  closeDiscipline: () => void
  setProfileOpen: (open: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  disciplineId: null,
  profileOpen: false,
  openDiscipline: (disciplineId) => set({ disciplineId }),
  closeDiscipline: () => set({ disciplineId: null }),
  setProfileOpen: (profileOpen) => set({ profileOpen }),
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
