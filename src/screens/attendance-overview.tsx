import { cn } from 'cn'
import { motion } from 'motion/react'
import { AnimatedNumber } from '@/components/animated-number'
import { AttendanceBar } from '@/components/attendance-bar'
import { EASE_OUT, TONE_BG, TONE_TEXT } from '@/components/tone'
import { formatRelativeDay, formatTime, plural } from '@/lib/format'
import { type DisciplineView, nextMeetings, type Tone } from '@/lib/model'
import { useClock } from '@/lib/store'
import { useUi } from '@/lib/ui'

const LEGEND: Array<{ tone: Tone; label: string }> = [
  { tone: 'good', label: '85% ou mais' },
  { tone: 'warn', label: '75 a 84%' },
  { tone: 'bad', label: 'abaixo de 75%' },
]

export function OverviewView({ views }: { views: DisciplineView[] }) {
  const tracked = views.filter((view) => view.stats.hasData)
  const counts = { good: 0, warn: 0, bad: 0, neutral: 0 }
  for (const view of tracked) counts[view.stats.failed ? 'bad' : view.stats.tone]++
  const absences = tracked.reduce((total, view) => total + view.stats.absences, 0)
  const allowed = tracked.reduce((total, view) => total + view.stats.allowedAbsences, 0)

  if (views.length === 0) {
    return <p className="rounded-3xl border bg-card px-5 py-6 text-center text-sm text-muted-foreground">Nenhuma disciplina encontrada neste semestre.</p>
  }

  return (
    <div className="space-y-3">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="rounded-3xl border bg-card p-4"
      >
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Faltas no semestre</p>
            <p className="tabular text-2xl font-semibold">
              {absences}
              <span className="text-base font-medium text-muted-foreground"> de {allowed} permitidas</span>
            </p>
          </div>
          <p className="pb-1 text-right text-xs text-muted-foreground">{plural(tracked.length, 'disciplina', 'disciplinas')}</p>
        </div>
        <div className="mt-3 flex h-2 gap-1 overflow-hidden rounded-full">
          {(['good', 'warn', 'bad'] as const).map((tone) =>
            counts[tone] > 0 ? (
              <motion.span
                key={tone}
                className={cn('h-full rounded-full', TONE_BG[tone])}
                initial={{ flexGrow: 0 }}
                animate={{ flexGrow: counts[tone] }}
                transition={{ duration: 0.6, ease: EASE_OUT }}
              />
            ) : null,
          )}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {LEGEND.map(({ tone, label }) => (
            <li key={tone} className="flex items-center gap-1.5">
              <span className={cn('size-2 rounded-full', TONE_BG[tone])} />
              <span className="tabular font-semibold text-foreground">{counts[tone]}</span> {label}
            </li>
          ))}
        </ul>
      </motion.section>

      {views.map((view, index) => (
        <OverviewRow key={view.id} view={view} index={index} />
      ))}
    </div>
  )
}

function OverviewRow({ view, index }: { view: DisciplineView; index: number }) {
  const now = useClock((state) => state.now)
  const openDiscipline = useUi((state) => state.openDiscipline)
  const { stats } = view
  const next = nextMeetings(view, now, 1)[0]
  const delay = 0.04 + Math.min(index, 8) * 0.04

  return (
    <motion.button
      type="button"
      onClick={() => openDiscipline(view.id)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay }}
      whileTap={{ scale: 0.985 }}
      className="block w-full rounded-3xl border bg-card px-4 py-3.5 text-left"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-semibold">{view.name}</span>
        <AnimatedNumber value={stats.percent} className={cn('tabular shrink-0 text-lg font-semibold', TONE_TEXT[stats.tone])} />
      </div>
      <AttendanceBar percent={stats.percent} tone={stats.tone} className="mt-2.5" delay={delay} />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        {stats.hasData ? (
          <span className={cn(stats.failed && 'font-medium text-bad')}>
            Faltas <span className="tabular font-semibold text-foreground">{stats.absences}</span> de {stats.allowedAbsences}
          </span>
        ) : (
          <span>Sem chamadas</span>
        )}
        {next && (
          <span className="truncate">
            Próxima: <span className="text-foreground">{formatRelativeDay(next.start, now)}</span>, {formatTime(next.start)}
          </span>
        )}
      </div>
    </motion.button>
  )
}
