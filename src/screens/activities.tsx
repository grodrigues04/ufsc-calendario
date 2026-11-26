import { cn } from 'cn'
import { PartyPopper } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useMemo } from 'react'
import { create } from 'zustand'
import { Screen } from '@/components/screen'
import { EASE_OUT } from '@/components/tone'
import { dayDiff, formatDistance } from '@/lib/format'
import { type ActivityItem, activityItems, activityKind } from '@/lib/model'
import { useApp, useClock } from '@/lib/store'
import { useDisciplines } from '@/lib/sync'
import { DueLabel } from './today'

interface Filters {
  courseId: number | null
  showAllOverdue: boolean
}

const useFilters = create<Filters & { set: (patch: Partial<Filters>) => void }>()((set) => ({
  courseId: null,
  showAllOverdue: false,
  set: (patch) => set(patch),
}))

// Old overdue items (often group choices nobody made) would bury the real deadlines.
const COLLAPSED_OVERDUE = 2

interface Group {
  key: string
  title: string
  items: ActivityItem[]
  tone?: 'bad'
}

/** Only what still needs the student: delivered, graded or closed activities never show up. */
function groupItems(items: ActivityItem[], now: Date): Group[] {
  const overdue: ActivityItem[] = []
  const buckets: Record<string, ActivityItem[]> = { hoje: [], amanha: [], semana: [], depois: [] }
  for (const item of items) {
    if (!item.activity.pending) continue
    if (item.due < now) {
      overdue.push(item)
      continue
    }
    const days = dayDiff(now, item.due)
    const bucket = days <= 0 ? 'hoje' : days === 1 ? 'amanha' : days <= 7 ? 'semana' : 'depois'
    buckets[bucket].push(item)
  }
  const groups: Group[] = [
    { key: 'atrasadas', title: 'Atrasadas', items: overdue.reverse(), tone: 'bad' },
    { key: 'hoje', title: 'Hoje', items: buckets.hoje },
    { key: 'amanha', title: 'Amanhã', items: buckets.amanha },
    { key: 'semana', title: 'Próximos 7 dias', items: buckets.semana },
    { key: 'depois', title: 'Mais adiante', items: buckets.depois },
  ]
  return groups.filter((group) => group.items.length > 0)
}

export function ActivitiesScreen() {
  const views = useDisciplines()
  const sync = useApp((state) => state.sync)
  const now = useClock((state) => state.now)
  const { courseId, showAllOverdue, set } = useFilters()

  const items = useMemo(() => activityItems(sync, views), [sync, views])
  const visible = courseId === null ? items : items.filter((item) => item.activity.courseId === courseId)
  const groups = useMemo(() => groupItems(visible, now), [visible, now])
  const courseOptions = views.filter(
    (view) => view.course && items.some((item) => item.activity.pending && item.activity.courseId === view.course!.id),
  )
  const pendingCount = items.filter((item) => item.activity.pending && item.due >= now).length

  return (
    <Screen title="Atividades" subtitle={pendingCount ? `${pendingCount} com prazo pela frente` : 'Tudo em dia'}>
      {courseOptions.length > 1 && (
        <div data-no-pull className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip active={courseId === null} onClick={() => set({ courseId: null })}>
            Todas
          </FilterChip>
          {courseOptions.map((view) => (
            <FilterChip key={view.id} active={courseId === view.course!.id} onClick={() => set({ courseId: view.course!.id })}>
              <span className="size-2 rounded-full" style={{ background: `oklch(0.65 0.15 ${view.hue})` }} />
              {view.shortName}
            </FilterChip>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={courseId ?? 'todas'}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          {groups.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-2 rounded-3xl border bg-card px-6 py-10 text-center">
              <PartyPopper className="size-7 text-muted-foreground" />
              <p className="font-semibold">Nada pendente por aqui</p>
              <p className="text-sm text-muted-foreground">
                Atividades entregues, já avaliadas ou encerradas ficam só no Calendário. Quando surgir algo novo com prazo no
                Moodle, aparece nesta lista.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key}>
                <h2
                  className={cn(
                    'mt-6 mb-2 px-1 text-[13px] font-semibold tracking-wide uppercase',
                    group.tone === 'bad' ? 'text-bad' : 'text-muted-foreground',
                  )}
                >
                  {group.title}
                  <span className="tabular ml-1.5 font-medium opacity-70">{group.items.length}</span>
                </h2>
                <ul className="divide-y overflow-hidden rounded-3xl border bg-card">
                  {(group.key === 'atrasadas' && !showAllOverdue ? group.items.slice(0, COLLAPSED_OVERDUE) : group.items).map(
                    (item) => (
                      <ActivityRow key={item.activity.id} item={item} now={now} />
                    ),
                  )}
                  {group.key === 'atrasadas' && group.items.length > COLLAPSED_OVERDUE && (
                    <li>
                      <button
                        type="button"
                        onClick={() => set({ showAllOverdue: !showAllOverdue })}
                        className="w-full px-4 py-3 text-left text-[13px] font-medium text-muted-foreground active:bg-secondary/60"
                      >
                        {showAllOverdue ? 'Mostrar menos' : `Mostrar mais ${group.items.length - COLLAPSED_OVERDUE} atrasadas`}
                      </button>
                    </li>
                  )}
                </ul>
              </section>
            ))
          )}
        </motion.div>
      </AnimatePresence>
    </Screen>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={cn(
        'flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium whitespace-nowrap transition-colors',
        active ? 'border-foreground bg-foreground text-background' : 'bg-card text-foreground',
      )}
    >
      {children}
    </motion.button>
  )
}

function ActivityRow({ item, now }: { item: ActivityItem; now: Date }) {
  const { activity, due } = item
  return (
    <li>
      <a href={activity.url} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-4 py-3 active:bg-secondary/60">
        <span
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: item.view ? `oklch(0.65 0.15 ${item.view.hue})` : 'var(--muted-foreground)' }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{activity.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.courseName} · {activityKind(activity)}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-0.5">
          <DueLabel date={due} />
          <span className="tabular text-[11px] text-muted-foreground">{formatDistance(due, now)}</span>
        </span>
      </a>
    </li>
  )
}
