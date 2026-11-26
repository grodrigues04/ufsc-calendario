import { cn } from 'cn'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { AnimatePresence, motion, type PanInfo } from 'motion/react'
import { type MouseEvent as ClickEvent, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { hueColor } from '@/components/calendar-style'
import { Screen } from '@/components/screen'
import { Segmented } from '@/components/segmented'
import { EASE_OUT } from '@/components/tone'
import {
  activitiesByDay,
  type CalendarMode,
  classesOfDay,
  classPeriod,
  containsToday,
  disciplineAcronym,
  FULL_RANGE,
  hourRange,
  inPercentRange,
  type PercentRange,
  periodDays,
  periodDescription,
  periodKey,
  periodTitle,
  shiftDate,
  showsActivity,
} from '@/lib/calendar'
import { plural } from '@/lib/format'
import { activityItems, type DisciplineView, isoDay } from '@/lib/model'
import { useApp, useClock } from '@/lib/store'
import { useDisciplines } from '@/lib/sync'
import { CalendarFilters } from './calendar-filters'
import { MonthView } from './calendar-month'
import { type CalendarDay, DayView, WeekView } from './calendar-time-grid'

interface CalendarState {
  mode: CalendarMode
  /** Day the view is on (YYYY-MM-DD); null follows today. */
  day: string | null
  /** Show activities Moodle no longer expects (delivered, graded, closed). */
  showDone: boolean
  /** Only classes of disciplines with attendance in this range. */
  range: PercentRange
  set: (patch: Partial<Pick<CalendarState, 'mode' | 'day' | 'showDone' | 'range'>>) => void
}

// The view and the filters are remembered on the device; the calendar always opens on today.
const useCalendar = create<CalendarState>()(
  persist(
    (set) => ({
      mode: 'semana',
      day: null,
      showDone: true,
      range: FULL_RANGE,
      set: (patch) => set(patch),
    }),
    {
      name: 'chamada:calendario:v1',
      storage: createJSONStorage(() => localStorage),
      partialize: ({ mode, showDone, range }) => ({ mode, showDone, range }),
    },
  ),
)

const MODES = [
  { value: 'dia', label: 'Dia' },
  { value: 'semana', label: 'Semana' },
  { value: 'mes', label: 'Mês' },
] as const

const STEP_LABELS: Record<CalendarMode, [string, string]> = {
  dia: ['Dia anterior', 'Próximo dia'],
  semana: ['Semana anterior', 'Próxima semana'],
  mes: ['Mês anterior', 'Próximo mês'],
}

const IN_PERIOD: Record<CalendarMode, string> = { dia: 'neste dia', semana: 'nesta semana', mes: 'neste mês' }

const variants = {
  enter: (direction: number) => ({ x: direction * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (direction: number) => ({ x: direction * -48, opacity: 0 }),
}

const SWIPE_DISTANCE = 70

function fromIsoDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

export function CalendarScreen() {
  const views = useDisciplines()
  const sync = useApp((state) => state.sync)
  const semester = useApp((state) => state.student?.semester || state.sync?.semester || null)
  const now = useClock((state) => state.now)
  const { mode, day, showDone, range, set } = useCalendar()
  const anchor = day ?? isoDay(now)
  const date = useMemo(() => fromIsoDay(anchor), [anchor])
  const key = periodKey(mode, date)

  // Slides toward where the arrows (or the swipe) went; another view just fades in.
  const [shownPeriod, setShownPeriod] = useState({ mode, time: date.getTime(), direction: 0 })
  if (shownPeriod.mode !== mode || shownPeriod.time !== date.getTime()) {
    setShownPeriod({ mode, time: date.getTime(), direction: shownPeriod.mode !== mode ? 0 : date.getTime() > shownPeriod.time ? 1 : -1 })
  }
  const { direction } = shownPeriod

  const period = useMemo(() => classPeriod(views, semester), [views, semester])
  const items = useMemo(() => activityItems(sync, views), [sync, views])
  const days = useMemo(() => periodDays(mode, date), [mode, date])

  const shownViews = useMemo(() => views.filter((view) => inPercentRange(view.stats.percent, range)), [views, range])
  const { calendarDays, hidden } = useMemo(() => {
    const allByDay = activitiesByDay(items)
    const shownByDay = activitiesByDay(items.filter((item) => showsActivity(item.activity, showDone)))
    const hidden = { classes: 0, activities: 0 }
    const calendarDays: CalendarDay[] = days.map((entry) => {
      const key = isoDay(entry)
      const classes = classesOfDay(shownViews, entry, period)
      const activities = shownByDay.get(key) ?? []
      // What the filters hide is counted only inside the period (not the next month's days in the grid).
      if (mode !== 'mes' || entry.getMonth() === date.getMonth()) {
        hidden.classes += classesOfDay(views, entry, period).length - classes.length
        hidden.activities += (allByDay.get(key) ?? []).length - activities.length
      }
      return { day: entry, classes, activities }
    })
    return { calendarDays, hidden }
  }, [views, shownViews, items, days, period, showDone, mode, date])
  const hours = useMemo(() => hourRange(views, calendarDays.flatMap((entry) => entry.classes)), [views, calendarDays])

  const go = (step: number) => set({ day: isoDay(shiftDate(mode, date, step)) })
  const openDay = (target: Date) => set({ mode: 'dia', day: isoDay(target) })
  const onToday = containsToday(mode, date, now)

  // A swipe that ends over a class must not open it.
  const dragging = useRef(false)
  const onDragEnd = (_: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.15
    if (swipe < -SWIPE_DISTANCE) go(1)
    else if (swipe > SWIPE_DISTANCE) go(-1)
    window.setTimeout(() => {
      dragging.current = false
    }, 0)
  }
  const onClickCapture = (event: ClickEvent) => {
    if (!dragging.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  const hiddenText = [
    hidden.classes > 0 && plural(hidden.classes, 'aula', 'aulas'),
    hidden.activities > 0 && plural(hidden.activities, 'atividade entregue', 'atividades entregues'),
  ]
    .filter(Boolean)
    .join(' e ')

  return (
    <Screen title="Calendário" subtitle="Aulas e atividades">
      <Segmented value={mode} options={[...MODES]} onChange={(value) => set({ mode: value })} layoutId="calendar-mode" className="mb-4" />

      <div className="mb-1 flex items-center gap-1">
        <h2 aria-hidden className="min-w-0 flex-1 truncate pl-1 text-xl font-semibold tracking-tight first-letter:uppercase">
          {periodTitle(mode, date, now)}
        </h2>
        <button
          type="button"
          onClick={() => set({ day: null })}
          className={cn(
            'mr-1 h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition-colors active:bg-secondary',
            onToday ? 'text-muted-foreground' : 'bg-card',
          )}
        >
          Hoje
        </button>
        <button
          type="button"
          aria-label={STEP_LABELS[mode][0]}
          onClick={() => go(-1)}
          className="grid size-9 shrink-0 place-items-center rounded-full active:bg-secondary"
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          type="button"
          aria-label={STEP_LABELS[mode][1]}
          onClick={() => go(1)}
          className="grid size-9 shrink-0 place-items-center rounded-full active:bg-secondary"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {periodDescription(mode, date)}
      </p>

      <CalendarFilters
        views={views}
        showDone={showDone}
        range={range}
        onShowDone={(value) => set({ showDone: value })}
        onRange={(value) => set({ range: value })}
      />

      <div className="relative">
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={key}
            custom={direction}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.26, ease: EASE_OUT }}
            drag="x"
            dragDirectionLock
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            dragSnapToOrigin
            onDragStart={() => {
              dragging.current = true
            }}
            onDragEnd={onDragEnd}
            onClickCapture={onClickCapture}
          >
            {mode === 'dia' && <DayView entry={calendarDays[0]} hours={hours} now={now} />}
            {mode === 'semana' && <WeekView days={calendarDays} hours={hours} now={now} onOpenDay={openDay} />}
            {mode === 'mes' && <MonthView month={date.getMonth()} days={calendarDays} now={now} onOpenDay={openDay} />}
          </motion.div>
        </AnimatePresence>
      </div>

      {mode !== 'dia' && <Legend views={shownViews} />}

      {hiddenText && (
        <p className="mt-3 px-1 text-xs leading-relaxed text-muted-foreground">
          Os filtros escondem {hiddenText} {IN_PERIOD[mode]}.{' '}
          <button type="button" onClick={() => set({ showDone: true, range: FULL_RANGE })} className="font-semibold text-foreground">
            Mostrar tudo
          </button>
        </p>
      )}
    </Screen>
  )
}

/** Week and month show short names: which color and short name is which discipline. */
function Legend({ views }: { views: DisciplineView[] }) {
  if (!views.length) return null
  return (
    <ul aria-label="Legenda" className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 px-1 text-xs text-muted-foreground">
      {views.map((view) => {
        const acronym = disciplineAcronym(view.name)
        return (
          <li key={view.id} className="flex min-w-0 items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: hueColor(view.hue) }} />
            <span className="shrink-0 font-semibold text-foreground">{acronym}</span>
            {acronym !== view.name && <span className="truncate">{view.name}</span>}
          </li>
        )
      })}
    </ul>
  )
}
