// On-screen keyboard, measured from the visual viewport. On iPhone the keyboard does not resize the
// page: it covers its bottom, and Safari also scrolls the screen up to show the focused field.

import { useEffect, useState } from 'react'

export interface Keyboard {
  /** How far above the bottom of the page a sheet must sit to stay just above the keyboard (0 when closed). */
  inset: number
  /** Height of the area left visible above the keyboard. */
  visibleHeight: number
}

const CLOSED: Keyboard = { inset: 0, visibleHeight: 0 }
// Smaller differences are the browser bars, not a keyboard.
const MIN_KEYBOARD = 80

export function useKeyboard(active: boolean): Keyboard {
  const [keyboard, setKeyboard] = useState<Keyboard>(CLOSED)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!active || !viewport) return
    const update = () => {
      // Pinch zoom also shrinks the visual viewport: only the keyboard matters here.
      if (viewport.scale > 1.01) return
      // What Safari already scrolled (offsetTop) is part of how the screen moved: counting only the
      // keyboard height would push a sheet up twice.
      const inset = Math.round(window.innerHeight - viewport.height - viewport.offsetTop)
      const covered = window.innerHeight - viewport.height
      setKeyboard(covered >= MIN_KEYBOARD ? { inset: Math.max(0, inset), visibleHeight: Math.round(viewport.height) } : CLOSED)
    }
    viewport.addEventListener('resize', update)
    viewport.addEventListener('scroll', update)
    return () => {
      viewport.removeEventListener('resize', update)
      viewport.removeEventListener('scroll', update)
      setKeyboard(CLOSED)
    }
  }, [active])

  return keyboard
}
