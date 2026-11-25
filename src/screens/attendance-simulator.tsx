import { cn } from 'cn'
import { Check, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { create } from 'zustand'
import { AnimatedNumber } from '@/components/animated-number'
import { AttendanceBar } from '@/components/attendance-bar'
import { Segmented } from '@/components/segmented'
import { Stepper } from '@/components/stepper'
import { EASE_OUT, SPRING_UI, TONE_SOFT, TONE_TEXT } from '@/components/tone'
import { formatDayCount, formatDayMonth, formatPercent, plural, weekdayShort } from '@/lib/format'
import { absenceDays, budgetTone, type DisciplineView, type Meeting, type Simulation, simulate, type Tone } from '@/lib/model'

type Mode = 'same' | 'each'

interface SimulatorState {
  selected: string[]
  mode: Mode
  sameCount: number
  counts: Record<string, number>
  toggle: (id: string) => void
  setSelected: (ids: string[]) => void
  setMode: (mode: Mode) => void
  setSameCount: (count: number) => void
  setCount: (id: string, count: number) => void
}

// Kept in memory so switching tabs does not reset the simulation.
const useSimulator = create<SimulatorState>()((set) => ({
  selected: [],
  mode: 'same',
  sameCount: 2,
  counts: {},
  toggle: (id) =>
    set((state) => ({
      selected: state.selected.includes(id) ? state.selected.filter((item) => item !== id) : [...state.selected, id],
    })),
  setSelected: (selected) => set({ selected }),
  setMode: (mode) => set({ mode }),
  setSameCount: (sameCount) => set({ sameCount }),
  setCount: (id, count) => set((state) => ({ counts: { ...state.counts, [id]: count } })),
}))

export function SimulatorView({ views }: { views: DisciplineView[] }) {
  const { selected, mode, sameCount, counts, toggle, setSelected, setMode, setSameCount, setCount } = useSimulator()
  const candidates = views.filter((view) => view.stats.hasData && view.stats.upcoming.length > 0)
  const chosen = candidates.filter((view) => selected.includes(view.id))
  const maxUpcoming = Math.max(1, ...chosen.map((view) => view.stats.upcoming.length))
  const effectiveMode: Mode = chosen.length > 1 ? mode : 'same'
  const simulations = chosen.map((view) =>
    simulate(view, effectiveMode === 'same' ? sameCount : (counts[view.id] ?? Math.min(sameCount, view.stats.upcoming.length))),
  )
  const allSelected = candidates.length > 0 && chosen.length === candidates.length

  if (candidates.length === 0) {
    return (
      <p className="rounded-3xl border bg-card px-5 py-6 text-center text-sm text-muted-foreground">
        Não há aulas futuras com lista de presença para simular.
      </p>
    )
  }

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Disciplinas</h2>
          <button
            type="button"
            className="text-[13px] font-medium text-muted-foreground"
            onClick={() => setSelected(allSelected ? [] : candidates.map((view) => view.id))}
          >
            {allSelected ? 'Limpar' : 'Selecionar todas'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {candidates.map((view) => {
            const active = selected.includes(view.id)
            return (
              <motion.button
                key={view.id}
                type="button"
                layout
                whileTap={{ scale: 0.94 }}
                transition={SPRING_UI}
                onClick={() => toggle(view.id)}
                aria-pressed={active}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors',
                  active ? 'border-foreground bg-foreground text-background' : 'bg-card',
                )}
              >
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.span
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 'auto', opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <Check className="size-3.5" />
                    </motion.span>
                  )}
                </AnimatePresence>
                {view.shortName}
                <span className={cn('tabular text-xs', active ? 'opacity-70' : TONE_TEXT[view.stats.tone])}>
                  {formatPercent(view.stats.percent)}
                </span>
                {view.attendanceFailed && (
                  <TriangleAlert className={cn('size-3.5', !active && 'text-warn')} aria-label="presença não atualizada agora" />
                )}
              </motion.button>
            )
          })}
        </div>
      </section>

      <AnimatePresence initial={false}>
        {chosen.length > 0 && (
          <motion.section
            key="controls"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.25, ease: EASE_OUT }}
            className="rounded-3xl border bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Quantas vezes faltar?</h2>
            </div>
            {chosen.length > 1 && (
              <Segmented
                value={mode}
                onChange={setMode}
                layoutId="simulator-mode"
                className="mt-3"
                options={[
                  { value: 'same', label: 'Igual para todas' },
                  { value: 'each', label: 'Por disciplina' },
                ]}
              />
            )}
            {effectiveMode === 'same' ? (
              <div className="mt-4 flex flex-col items-center gap-2">
                <Stepper value={Math.min(sameCount, maxUpcoming)} max={maxUpcoming} onChange={setSameCount} unit={['falta', 'faltas']} />
                <p className="text-center text-xs text-muted-foreground">
                  Contando a partir da próxima aula de cada disciplina.
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">Ajuste as faltas em cada disciplina abaixo.</p>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {chosen.length === 0 ? (
        <p className="px-1 text-center text-sm text-muted-foreground">Escolha uma ou mais disciplinas para simular suas faltas.</p>
      ) : (
        <section className="space-y-3">
          <h2 className="px-1 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Resultado</h2>
          <AnimatePresence initial={false} mode="popLayout">
            {simulations.map((simulation) => (
              <ResultCard
                key={simulation.view.id}
                simulation={simulation}
                stepper={
                  effectiveMode === 'each' ? (
                    <Stepper
                      size="sm"
                      value={simulation.requested}
                      max={simulation.view.stats.upcoming.length}
                      onChange={(count) => setCount(simulation.view.id, count)}
                      unit={['falta', 'faltas']}
                    />
                  ) : null
                }
              />
            ))}
          </AnimatePresence>
        </section>
      )}
    </div>
  )
}

function describeMissed(missed: Meeting[]): string {
  if (missed.length === 0) return 'Nenhuma falta simulada'
  const days = missed.map((meeting) => `${weekdayShort(meeting.start)} ${formatDayMonth(meeting.start)}`)
  if (days.length <= 3) return `Faltando ${days.slice(0, -1).join(', ')}${days.length > 1 ? ' e ' : ''}${days.at(-1)}`
  return `Faltando ${days.slice(0, 2).join(', ')} e mais ${days.length - 2}`
}

function ResultCard({ simulation, stepper }: { simulation: Simulation; stepper: ReactNode }) {
  const { view, missed, missedClasses } = simulation
  const { stats } = view
  const limitedBySemester = simulation.requested > stats.upcoming.length
  // The pill follows the official rule (absence budget), the bars follow the attendance percentage.
  const outcomeTone = budgetTone(simulation.remainingAbsences, stats.allowedAbsences, simulation.failed)
  const daysBefore = absenceDays(view)
  const daysAfter = absenceDays(view, simulation.absences)

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="rounded-3xl border bg-card p-4"
    >
      <h3 className="leading-snug font-semibold">{view.name}</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {describeMissed(missed)}
        {missedClasses > 0 && ` · ${plural(missedClasses, 'aula', 'aulas')}`}
      </p>
      {stepper && <div className="mt-3 flex justify-center rounded-2xl bg-secondary/50 py-2">{stepper}</div>}

      <div className="mt-4 space-y-2.5">
        <CompareRow label="Agora" percent={stats.percent} tone={stats.tone} muted />
        <CompareRow label="Depois" percent={simulation.percent} tone={simulation.tone} />
      </div>

      <div className="mt-3.5 flex flex-wrap gap-1.5 text-xs">
        <span className="tabular rounded-full bg-secondary px-2.5 py-1">
          Faltas {stats.absences} → <span className="font-semibold">{simulation.absences}</span> de {stats.allowedAbsences} aulas
        </span>
        <span className="tabular rounded-full bg-secondary px-2.5 py-1">
          {formatDayCount(daysBefore.absent)} → <span className="font-semibold">{formatDayCount(daysAfter.absent)}</span> de{' '}
          {plural(daysBefore.allowed, 'dia', 'dias')}
        </span>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', TONE_SOFT[outcomeTone])}>
          {simulation.failed && <TriangleAlert className="size-3.5" />}
          {simulation.failed
            ? 'Reprovaria por falta'
            : daysAfter.remaining === 0
              ? 'No limite: mais um dia de falta reprova'
              : `Ainda poderia faltar ${plural(daysAfter.remaining, 'dia', 'dias')}`}
        </span>
      </div>
      {limitedBySemester && (
        <p className="mt-2 text-xs text-muted-foreground">Só restam {plural(stats.upcoming.length, 'aula', 'aulas')} no semestre.</p>
      )}
    </motion.article>
  )
}

function CompareRow({ label, percent, tone, muted = false }: { label: string; percent: number | null; tone: Tone; muted?: boolean }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr_3.25rem] items-center gap-2.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <AttendanceBar percent={percent} tone={tone} muted={muted} className="h-2.5" />
      <AnimatedNumber
        value={percent}
        fromZero={false}
        className={cn('tabular text-right text-sm font-semibold', muted ? 'text-muted-foreground' : TONE_TEXT[tone])}
      />
    </div>
  )
}
