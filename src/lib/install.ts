import { useEffect, useState } from 'react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

/** Must run at startup: Chrome fires the event once, early. */
export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    listeners.forEach((listener) => listener())
  })
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null
    listeners.forEach((listener) => listener())
  })
}

export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function useInstallPrompt() {
  const [prompt, setPrompt] = useState(deferredPrompt)
  useEffect(() => {
    const update = () => setPrompt(deferredPrompt)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
  const standalone = isStandalone()
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return {
    canInstall: Boolean(prompt) && !standalone,
    showIosHint: ios && !standalone,
    install: async () => {
      if (!prompt) return
      await prompt.prompt()
      await prompt.userChoice.catch(() => null)
      deferredPrompt = null
      setPrompt(null)
    },
  }
}
