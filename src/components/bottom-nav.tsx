import { cn } from 'cn'
import { CalendarCheck2, ChartNoAxesColumnIncreasing, ListTodo } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'wouter'
import { useApp, useClock } from '@/lib/store'
import { SPRING_UI } from './tone'

export const TABS = [
  { href: '/', key: 'hoje', label: 'Hoje', icon: CalendarCheck2 },
  { href: '/presenca', key: 'presenca', label: 'Presença', icon: ChartNoAxesColumnIncreasing },
  { href: '/atividades', key: 'atividades', label: 'Atividades', icon: ListTodo },
] as const

export type TabKey = (typeof TABS)[number]['key']

export function tabFromPath(path: string): TabKey {
  if (path.startsWith('/presenca')) return 'presenca'
  if (path.startsWith('/atividades')) return 'atividades'
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

export function BottomNav({ active }: { active: TabKey }) {
  const dueSoon = useDueSoonCount()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-safe backdrop-blur-xl" aria-label="Navegação">
      <div className="mx-auto grid max-w-lg grid-cols-3 px-2">
        {TABS.map((tab) => {
          const selected = tab.key === active
          const Icon = tab.icon
          return (
            <Link
              key={tab.key}
              href={tab.href}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'relative flex flex-col items-center gap-0.5 pt-2 pb-2 text-[11px] font-medium transition-colors',
                selected ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              <span className="relative grid h-8 w-16 place-items-center">
                {selected && (
                  <motion.span layoutId="tab-pill" className="absolute inset-0 rounded-full bg-secondary" transition={SPRING_UI} />
                )}
                <Icon className="relative size-[21px]" strokeWidth={selected ? 2.2 : 1.8} />
                {tab.key === 'atividades' && dueSoon > 0 && (
                  <span className="tabular absolute top-0.5 right-3 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] leading-none font-semibold text-white">
                    {dueSoon}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
