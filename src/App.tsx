import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Toaster, toast } from 'sonner'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useLocation, useSearch } from 'wouter'
import { BottomNav, type TabKey, tabFromPath } from '@/components/bottom-nav'
import { EASE_OUT } from '@/components/tone'
import { loadInbox, useInbox } from '@/lib/inbox'
import { useNotesSync } from '@/lib/notes'
import { useApp } from '@/lib/store'
import { useAutoSync } from '@/lib/sync'
import { useUi } from '@/lib/ui'
import { ActivitiesScreen } from '@/screens/activities'
import { AttendanceScreen } from '@/screens/attendance'
import { LoginScreen } from '@/screens/login'
import { NewsScreen } from '@/screens/news'
import { TodayScreen } from '@/screens/today'

function usePwaUpdate() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Long-lived installed apps check for a new version every hour.
      if (registration) window.setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })
  useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível', {
      id: 'pwa-update',
      duration: Infinity,
      action: { label: 'Atualizar', onClick: () => void updateServiceWorker(true) },
    })
  }, [needRefresh, updateServiceWorker])
}

const Sheets = lazy(() => import('@/components/sheets'))

// The calendar is its own chunk (it brings the slider of its filter): fetched while the browser is
// idle, so the first tap on the tab does not wait for the network.
const loadCalendar = () => import('@/screens/calendar')
const CalendarScreen = lazy(() => loadCalendar().then((module) => ({ default: module.CalendarScreen })))

function usePreloadCalendar() {
  useEffect(() => {
    const preload = () => void loadCalendar().catch(() => {})
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(preload, { timeout: 4000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = setTimeout(preload, 2500)
    return () => clearTimeout(timer)
  }, [])
}

/** Mounts the sheets when the browser is idle, or right away if one is requested before that. */
function LazySheets() {
  const requested = useUi(
    (state) => state.disciplineId !== null || state.activityId !== null || state.profileOpen || state.absence !== null,
  )
  const [idle, setIdle] = useState(false)
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(() => setIdle(true), { timeout: 2000 })
      return () => window.cancelIdleCallback(handle)
    }
    const timer = setTimeout(() => setIdle(true), 1200)
    return () => clearTimeout(timer)
  }, [])
  if (!idle && !requested) return null
  return (
    <Suspense fallback={null}>
      <Sheets />
    </Suspense>
  )
}

/** Notification links: /presenca/manual?registrar=INE5615&data=2026-11-20 opens the prefilled form. */
function useNotificationLinks() {
  const [location, navigate] = useLocation()
  const search = useSearch()
  useEffect(() => {
    const params = new URLSearchParams(search)
    const disciplineId = params.get('registrar')
    if (!disciplineId) return
    const date = params.get('data')
    useUi.getState().openAbsence(disciplineId, undefined, date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined)
    navigate(location, { replace: true })
  }, [search, location, navigate])
}

/** News found by the service worker while the app was closed. */
function useInboxLoader() {
  useEffect(() => {
    void loadInbox()
    const onVisible = () => document.visibilityState === 'visible' && void loadInbox()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}

function Shell() {
  const [location] = useLocation()
  const tab = tabFromPath(location)
  useNotificationLinks()
  useInboxLoader()
  usePreloadCalendar()
  const positions = useRef<Record<TabKey, number>>({ hoje: 0, calendario: 0, presenca: 0, atividades: 0, avisos: 0 })
  const shownTab = useRef<TabKey>(tab)
  const previousTab = useRef<TabKey>(tab)

  // Leaving "Avisos" marks the news as read: the tab gets crushed out of the bar.
  useEffect(() => {
    if (previousTab.current === 'avisos' && tab !== 'avisos') useInbox.getState().markAllRead()
    // The quick toasts repeat what the "Avisos" screen shows.
    if (tab === 'avisos') toast.dismiss()
    previousTab.current = tab
  }, [tab])

  useEffect(() => {
    const onScroll = () => {
      positions.current[shownTab.current] = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <AnimatePresence
        mode="wait"
        initial={false}
        onExitComplete={() => {
          shownTab.current = tab
          window.scrollTo(0, positions.current[tab])
        }}
      >
        <motion.main
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: 0.09 } }}
        >
          {tab === 'hoje' && <TodayScreen />}
          {tab === 'calendario' && (
            <Suspense fallback={null}>
              <CalendarScreen />
            </Suspense>
          )}
          {tab === 'presenca' && <AttendanceScreen />}
          {tab === 'atividades' && <ActivitiesScreen />}
          {tab === 'avisos' && <NewsScreen />}
        </motion.main>
      </AnimatePresence>
      <BottomNav active={tab} />
      <LazySheets />
    </>
  )
}

export function App() {
  const authenticated = useApp((state) => state.auth !== null)
  const userId = useApp((state) => state.auth?.userId ?? null)
  useAutoSync(authenticated)
  useNotesSync(userId)
  usePwaUpdate()

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={authenticated ? 'app' : 'login'}
          initial={{ opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.985 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
        >
          {authenticated ? <Shell /> : <LoginScreen />}
        </motion.div>
      </AnimatePresence>
      <Toaster
        position="top-center"
        theme="system"
        mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 8px)' }}
        toastOptions={{ className: 'rounded-2xl! font-sans' }}
      />
    </MotionConfig>
  )
}
