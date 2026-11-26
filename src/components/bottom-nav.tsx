import { cn } from 'cn'
import { Bell, CalendarCheck2, CalendarDays, ChartNoAxesColumnIncreasing, Check, ListTodo, type LucideIcon } from 'lucide-react'
import { AnimatePresence, motion, useAnimate } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'wouter'
import { useVisibleNews } from '@/lib/inbox'
import { useApp, useClock } from '@/lib/store'
import { SPRING_UI } from './tone'

interface Tab {
  href: string
  key: TabKey
  label: string
  icon: LucideIcon
}

export type TabKey = 'hoje' | 'calendario' | 'presenca' | 'atividades' | 'avisos'

const BASE_TABS: Tab[] = [
  { href: '/', key: 'hoje', label: 'Hoje', icon: CalendarCheck2 },
  { href: '/calendario', key: 'calendario', label: 'Calendário', icon: CalendarDays },
  { href: '/presenca', key: 'presenca', label: 'Presença', icon: ChartNoAxesColumnIncreasing },
  { href: '/atividades', key: 'atividades', label: 'Atividades', icon: ListTodo },
]

/** Only shown while there is news (or while the student is reading it). */
const NEWS_TAB: Tab = { href: '/avisos', key: 'avisos', label: 'Avisos', icon: Bell }

export function tabFromPath(path: string): TabKey {
  if (path.startsWith('/calendario')) return 'calendario'
  if (path.startsWith('/presenca')) return 'presenca'
  if (path.startsWith('/atividades')) return 'atividades'
  if (path.startsWith('/avisos')) return 'avisos'
  return 'hoje'
}

function useDueSoonCount(): number {
  const activities = useApp((state) => state.sync?.activities)
  const now = useClock((state) => state.now)
  return useMemo(() => {
    const limit = now.getTime() + 48 * 3_600_000
    return (activities ?? []).filter((activity) => {
      const due = new Date(activity.dueAt).getTime()
      return activity.pending && due >= now.getTime() && due <= limit
    }).length
  }, [activities, now])
}

// The "Avisos" tab gets crushed against the bar: a quick stretch up, flattened, then gone.
const CRUSH = {
  scaleY: [1, 1.22, 0.18, 0.18],
  scaleX: [1, 0.84, 1.5, 0],
  rotate: [0, -4, 3, 0],
  opacity: [1, 1, 1, 0],
  transition: { duration: 0.56, times: [0, 0.2, 0.58, 1], ease: 'easeInOut' as const },
}

const CONFETTI = ['var(--good)', 'var(--warn)', 'var(--bad)', 'oklch(0.66 0.16 255)', 'oklch(0.66 0.16 300)', 'oklch(0.7 0.13 205)']

/** Confetti and a "Lidos" tag where the tab used to be. */
function Burst({ x, onDone }: { x: number; onDone: () => void }) {
  const particles = 14
  return (
    <div aria-hidden className="pointer-events-none absolute top-1/2 z-10" style={{ left: x }}>
      {Array.from({ length: particles }, (_, index) => {
        const angle = (index / particles) * Math.PI * 2 + (index % 2 ? 0.22 : 0)
        const distance = 24 + (index % 3) * 11
        return (
          <motion.span
            key={index}
            className={cn('absolute -mt-1 -ml-1 size-2', index % 3 === 0 ? 'rounded-[2px]' : 'rounded-full')}
            style={{ background: CONFETTI[index % CONFETTI.length] }}
            initial={{ x: 0, y: 0, scale: 0.3, opacity: 0, rotate: 0 }}
            animate={{
              x: Math.cos(angle) * distance,
              y: Math.sin(angle) * distance - 10,
              scale: [0.3, 1.25, 0],
              opacity: [0, 1, 0],
              rotate: index % 2 ? 160 : -140,
            }}
            transition={{ duration: 0.8, delay: 0.24, ease: [0.22, 1, 0.36, 1] }}
          />
        )
      })}
      <motion.span
        className="absolute flex -translate-x-1/2 items-center gap-1 rounded-full bg-good px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-white shadow-md"
        initial={{ y: -6, opacity: 0, scale: 0.5 }}
        animate={{ y: -54, opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1, 0.95] }}
        transition={{ duration: 1.25, delay: 0.26, times: [0, 0.22, 0.72, 1], ease: 'easeOut' }}
        onAnimationComplete={onDone}
      >
        <Check className="size-3" strokeWidth={3} />
        Lidos
      </motion.span>
    </div>
  )
}

function TabLink({ tab, selected, badge }: { tab: Tab; selected: boolean; badge: number }) {
  const Icon = tab.icon
  return (
    <Link
      href={tab.href}
      aria-current={selected ? 'page' : undefined}
      aria-label={badge && tab.key === 'avisos' ? `${tab.label}: ${badge} novos` : undefined}
      className={cn(
        'relative flex flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-medium transition-colors',
        selected ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      <span className="relative grid h-8 w-16 place-items-center">
        {selected && <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-secondary" transition={SPRING_UI} />}
        <motion.span
          className="relative grid place-items-center"
          // The bell rings when the tab shows up.
          animate={tab.key === 'avisos' ? { rotate: [0, -18, 14, -9, 5, 0] } : undefined}
          transition={{ duration: 0.9, delay: 0.35, ease: 'easeInOut' }}
          style={{ originY: 0.15 }}
        >
          <Icon className="size-[21px]" strokeWidth={selected ? 2.2 : 1.8} />
        </motion.span>
        {badge > 0 && (
          <motion.span
            key={badge}
            initial={{ scale: 0.3 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', bounce: 0.6, duration: 0.45 }}
            className="tabular absolute top-0.5 right-3 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] leading-none font-semibold text-white"
          >
            {badge}
          </motion.span>
        )}
      </span>
      {tab.label}
    </Link>
  )
}

export function BottomNav({ active }: { active: TabKey }) {
  const dueSoon = useDueSoonCount()
  const newsCount = useVisibleNews().length
  const showNews = newsCount > 0 || active === 'avisos'
  const tabs = showNews ? [...BASE_TABS, NEWS_TAB] : BASE_TABS
  const [bar, animateBar] = useAnimate<HTMLElement>()
  const newsTab = useRef<HTMLDivElement>(null)
  const wasShowing = useRef(showNews)
  const [burst, setBurst] = useState<{ id: number; x: number } | null>(null)
  // While the tab is being crushed, the others wait a beat before taking its place.
  const [previousShow, setPreviousShow] = useState(showNews)
  const [crushing, setCrushing] = useState(false)
  if (previousShow !== showNews) {
    setPreviousShow(showNews)
    setCrushing(previousShow && !showNews)
  }
  useEffect(() => {
    if (!crushing) return
    const timer = setTimeout(() => setCrushing(false), 900)
    return () => clearTimeout(timer)
  }, [crushing])

  // When the tab goes away: confetti where it was, and the bar takes the hit.
  useLayoutEffect(() => {
    if (wasShowing.current && !showNews && newsTab.current && bar.current) {
      const tab = newsTab.current.getBoundingClientRect()
      const box = bar.current.getBoundingClientRect()
      setBurst({ id: Date.now(), x: tab.left + tab.width / 2 - box.left })
      void animateBar(bar.current, { y: [0, 4, -2, 1, 0] }, { duration: 0.5, delay: 0.2 })
      navigator.vibrate?.([12, 50, 20])
    }
    wasShowing.current = showNews
  }, [showNews, animateBar, bar])

  return (
    <nav ref={bar} className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-safe backdrop-blur-xl" aria-label="Navegação">
      <div className="relative mx-auto flex max-w-lg px-2">
        <AnimatePresence mode="popLayout" initial={false}>
          {tabs.map((tab) => (
            <motion.div
              key={tab.key}
              ref={tab.key === 'avisos' ? newsTab : undefined}
              layout
              className="flex-1 origin-bottom"
              initial={tab.key === 'avisos' ? { scaleX: 0.3, scaleY: 0.3, opacity: 0, y: 10 } : false}
              animate={{ scaleX: 1, scaleY: 1, opacity: 1, y: 0, rotate: 0 }}
              exit={CRUSH}
              // The other tabs stretch into the free space with a little wobble.
              transition={{
                layout: { type: 'spring', bounce: 0.42, duration: 0.65, delay: crushing ? 0.24 : 0 },
                default: { type: 'spring', bounce: 0.45, duration: 0.55 },
              }}
            >
              <TabLink
                tab={tab}
                selected={tab.key === active}
                badge={tab.key === 'atividades' ? dueSoon : tab.key === 'avisos' ? newsCount : 0}
              />
            </motion.div>
          ))}
        </AnimatePresence>
        <AnimatePresence>{burst && <Burst key={burst.id} x={burst.x} onDone={() => setBurst(null)} />}</AnimatePresence>
      </div>
    </nav>
  )
}
