import { cn } from 'cn'
import { Check, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { activeRecords } from '@shared/notes'
import { AnimatedNumber } from '@/components/animated-number'
import { AttendanceBar } from '@/components/attendance-bar'
import { Segmented } from '@/components/segmented'
import { Stepper } from '@/components/stepper'
import { EASE_OUT, SPRING_UI, TONE_SOFT, TONE_TEXT } from '@/components/tone'
import { formatDayCount, formatDayMonth, formatPercent, plural, weekdayShort } from '@/lib/format'
import {
  absenceDays,
  budgetTone,
  type DisciplineView,
  type ManualSimulation,
  manualStats,
  type Simulation,
  simulate,
  simulateManual,
  type Tone,
  upcomingClassDays,
} from '@/lib/model'
import { useNotes } from '@/lib/notes'
import { useClock, useSemester } from '@/lib/store'

type Mode = 'same' | 'each'
/** Which absences the simulation starts from: Moodle's roll calls or the ones noted in the Manual tab. */
type Source = 'moodle' | 'manual'

interface SimulatorState {
  source: Source
  selected: string[]
  mode: Mode
  sameCount: number
  counts: Record<string, number>
  setSource: (source: Source) => void
  toggle: (id: string) => void
  setSelected: (ids: string[]) => void
  setMode: (mode: Mode) => void
  setSameCount: (count: number) => void
  setCount: (id: string, count: number) => void
}

// Kept in memory so switching tabs does not reset the simulation; only the source is remembered.
const useSimulator = create<SimulatorState>()(
  persist(
    (set) => ({
      source: 'moodle',
      selected: [],
      mode: 'same',
      sameCount: 2,
      counts: {},
      setSource: (source) => set({ source }),
      toggle: (id) =>
        set((state) => ({
          selected: state.selected.includes(id) ? state.selected.filter((item) => item !== id) : [...state.selected, id],
        })),
      setSelected: (selected) => set({ selected }),
      setMode: (mode) => set({ mode }),
      setSameCount: (sameCount) => set({ sameCount }),
      setCount: (id, count) => set((state) => ({ counts: { ...state.counts, [id]: count } })),
    }),
    { name: 'chamada:simulador:v1', storage: createJSONStorage(() => localStorage), partialize: ({ source }) => ({ source }) },
  ),
)

const SOURCE_HINT: Record<Source, string> = {
  moodle: 'Parte das chamadas do Moodle. A porcentagem conta só as aulas que já tiveram chamada.',
  manual: 'Parte das faltas que você anotou na aba Manual. A porcentagem conta todas as aulas do semestre.',
}

const COUNT_HINT: Record<Source, string> = {
  moodle: 'Contando a partir da próxima aula de cada disciplina.',
  manual: 'Cada falta é um dia de aula, a partir do próximo dia de aula de cada disciplina.',
}

/** A discipline that can be simulated from the chosen source. */
interface Candidate {
  view: DisciplineView
  percent: number | null
  tone: Tone
  /** Classes (Moodle) or class days (Manual) ahead that can be missed. */
  available: number
  records: Array<{ date: string | null }>
}

function useCandidates(views: DisciplineView[], source: Source): Candidate[] {
  const semester = useSemester()
  const notes = useNotes((state) => state.notes)
  const now = useClock((state) => state.now)
  return useMemo(() => {
    if (source === 'moodle') {
      return views
        .filter((view) => view.stats.hasData && view.stats.upcoming.length > 0)
        .map((view) => ({ view, percent: view.stats.percent, tone: view.stats.tone, available: view.stats.upcoming.length, records: [] }))
    }
    return views.flatMap((view) => {
      const records = activeRecords(notes, semester, view.id)
      const stats = manualStats(view, records)
      const available = upcomingClassDays(view, now).length
      return stats.total > 0 && available > 0 ? [{ view, percent: stats.percent, tone: stats.tone, available, records }] : []
    })
  }, [views, source, notes, semester, now])
}

export function SimulatorView({ views }: { views: DisciplineView[] }) {
  const { source, selected, mode, sameCount, counts, setSource, toggle, setSelected, setMode, setSameCount, setCount } = useSimulator()
  const now = useClock((state) => state.now)
  const fromMoodle = useCandidates(views, 'moodle')
  const fromManual = useCandidates(views, 'manual')
  const candidates = source === 'moodle' ? fromMoodle : fromManual
  const chosen = candidates.filter((candidate) => selected.includes(candidate.view.id))
  const maxAvailable = Math.max(1, ...chosen.map((candidate) => candidate.available))
  const effectiveMode: Mode = chosen.length > 1 ? mode : 'same'
  const countFor = (candidate: Candidate) =>
    effectiveMode === 'same' ? sameCount : (counts[candidate.view.id] ?? Math.min(sameCount, candidate.available))
  const allSelected = candidates.length > 0 && chosen.length === candidates.length

  return (
    <div className="space-y-5">
      <section>
        <h2 className="mb-2 px-1 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Simular a partir das faltas</h2>
        <Segmented
          value={source}
          onChange={setSource}
          layoutId="simulator-source"
          options={[
            { value: 'moodle', label: 'Do Moodle' },
            { value: 'manual', label: 'Da aba Manual' },
          ]}
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={source}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.16 }}
            className="mt-2 px-1 text-xs leading-relaxed text-muted-foreground"
          >
            {SOURCE_HINT[source]}
          </motion.p>
        </AnimatePresence>
      </section>

      {candidates.length === 0 ? (
        <div className="rounded-3xl border bg-card px-5 py-6 text-center text-sm text-muted-foreground">
          {source === 'moodle' ? 'Não há aulas futuras com lista de presença no Moodle para simular.' : 'Não há aulas futuras na sua grade para simular.'}
          {source === 'moodle' && fromManual.length > 0 && (
            <button type="button" onClick={() => setSource('manual')} className="mt-3 block w-full font-semibold text-foreground">
              Simular com as faltas da aba Manual
            </button>
          )}
        </div>
      ) : (
        <>
          <section>
            <div className="mb-2 flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Disciplinas</h2>
              <button
                type="button"
                className="text-[13px] font-medium text-muted-foreground"
                onClick={() => setSelected(allSelected ? [] : candidates.map((candidate) => candidate.view.id))}
              >
                {allSelected ? 'Limpar' : 'Selecionar todas'}
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {candidates.map(({ view, percent, tone }) => {
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
                    <span className={cn('tabular text-xs', active ? 'opacity-70' : TONE_TEXT[tone])}>{formatPercent(percent)}</span>
                    {source === 'moodle' && view.attendanceFailed && (
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
                    <Stepper value={Math.min(sameCount, maxAvailable)} max={maxAvailable} onChange={setSameCount} unit={['falta', 'faltas']} />
                    <p className="text-center text-xs text-muted-foreground">{COUNT_HINT[source]}</p>
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
                {chosen.map((candidate) => {
                  const count = countFor(candidate)
                  const stepper =
                    effectiveMode === 'each' ? (
                      <Stepper
                        size="sm"
                        value={Math.min(count, candidate.available)}
                        max={candidate.available}
                        onChange={(value) => setCount(candidate.view.id, value)}
                        unit={['falta', 'faltas']}
                      />
                    ) : null
                  return source === 'moodle' ? (
                    <ResultCard key={`moodle-${candidate.view.id}`} simulation={simulate(candidate.view, count)} stepper={stepper} />
                  ) : (
                    <ManualResultCard
                      key={`manual-${candidate.view.id}`}
                      simulation={simulateManual(candidate.view, candidate.records, count, now)}
                      stepper={stepper}
                    />
                  )
                })}
              </AnimatePresence>
            </section>
          )}
        </>
      )}
    </div>
  )
}

function describeMissed(missed: Date[]): string {
  if (missed.length === 0) return 'Nenhuma falta simulada'
  const days = missed.map((date) => `${weekdayShort(date)} ${formatDayMonth(date)}`)
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
        {describeMissed(missed.map((meeting) => meeting.start))}
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

/** Same card for the Manual tab's count: absences in class days, over all the classes of the semester. */
function ManualResultCard({ simulation, stepper }: { simulation: ManualSimulation; stepper: ReactNode }) {
  const { view, missed, missedClasses, before, after } = simulation
  const outcomeTone = budgetTone(after.allowed - after.classes, after.allowed, after.failed)

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
        {describeMissed(missed.map((day) => new Date(`${day}T12:00:00`)))}
        {missedClasses > 0 && ` · ${plural(missedClasses, 'aula', 'aulas')}`}
      </p>
      {stepper && <div className="mt-3 flex justify-center rounded-2xl bg-secondary/50 py-2">{stepper}</div>}

      <div className="mt-4 space-y-2.5">
        <CompareRow label="Agora" percent={before.percent} tone={before.tone} muted />
        <CompareRow label="Depois" percent={after.percent} tone={after.tone} />
      </div>

      <div className="mt-3.5 flex flex-wrap gap-1.5 text-xs">
        <span className="tabular rounded-full bg-secondary px-2.5 py-1">
          Faltas {before.days} → <span className="font-semibold">{after.days}</span> de {plural(before.maxDays, 'dia', 'dias')}
        </span>
        <span className="tabular rounded-full bg-secondary px-2.5 py-1">
          {before.classes} → <span className="font-semibold">{after.classes}</span> de {before.allowed} aulas
        </span>
        <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold', TONE_SOFT[outcomeTone])}>
          {after.failed && <TriangleAlert className="size-3.5" />}
          {after.failed
            ? 'Reprovaria por falta'
            : after.remainingDays === 0
              ? 'No limite: mais um dia de falta reprova'
              : `Ainda poderia faltar ${plural(after.remainingDays, 'dia', 'dias')}`}
        </span>
      </div>
      {simulation.requested > simulation.available && (
        <p className="mt-2 text-xs text-muted-foreground">Só há {plural(simulation.available, 'dia de aula', 'dias de aula')} pela frente para simular.</p>
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
