import { cn } from 'cn'
import { CloudCheck, CloudOff, LoaderCircle, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { AnimatedNumber } from '@/components/animated-number'
import { AttendanceBar } from '@/components/attendance-bar'
import { Stepper } from '@/components/stepper'
import { EASE_OUT, TONE_TEXT } from '@/components/tone'
import { plural } from '@/lib/format'
import { classesPerMeeting, type DisciplineView, manualStats } from '@/lib/model'
import { syncNotes, useNotes } from '@/lib/notes'
import { useApp } from '@/lib/store'

const STATUS = {
  idle: { icon: CloudCheck, label: 'Salvo na sua conta', spin: false },
  saving: { icon: LoaderCircle, label: 'Salvando…', spin: true },
  offline: { icon: CloudOff, label: 'Salvo no celular, sincroniza quando voltar a internet', spin: false },
  error: { icon: TriangleAlert, label: 'Salvo no celular, não consegui sincronizar', spin: false },
} as const

export function ManualView({ views }: { views: DisciplineView[] }) {
  const semester = useApp((state) => state.student?.semester || state.sync?.semester || '')
  const notes = useNotes((state) => state.notes[semester])
  const setAbsences = useNotes((state) => state.setAbsences)
  const status = useNotes((state) => (state.dirty && state.status === 'idle' ? 'saving' : state.status))
  const Status = STATUS[status]

  return (
    <div className="space-y-3">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="rounded-3xl border bg-card p-4"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Anote suas faltas em cada disciplina. Aqui só contam as faltas que você anotou: a presença final precisa ficar em
          pelo menos <span className="font-semibold text-foreground">75%</span> das aulas do semestre.
        </p>
        <button
          type="button"
          onClick={() => void syncNotes()}
          className={cn(
            'mt-2.5 inline-flex items-center gap-1.5 text-xs font-medium',
            status === 'error' ? 'text-bad' : 'text-muted-foreground',
          )}
        >
          <Status.icon className={cn('size-3.5', Status.spin && 'animate-spin')} />
          {Status.label}
        </button>
      </motion.section>

      {views.map((view, index) => (
        <ManualRow
          key={view.id}
          view={view}
          index={index}
          absences={notes?.[view.id]?.absences ?? 0}
          onChange={(absences) => semester && setAbsences(semester, view.id, absences)}
        />
      ))}
    </div>
  )
}

function ManualRow({
  view,
  index,
  absences,
  onChange,
}: {
  view: DisciplineView
  index: number
  absences: number
  onChange: (absences: number) => void
}) {
  const stats = manualStats(view, absences)
  const perDay = classesPerMeeting(view)
  const delay = 0.04 + Math.min(index, 8) * 0.04

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE_OUT, delay }}
      className="rounded-3xl border bg-card px-4 pt-3.5 pb-3"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate font-semibold">{view.name}</span>
        <AnimatedNumber
          value={stats.percent}
          fromZero={false}
          className={cn('tabular shrink-0 text-lg font-semibold', TONE_TEXT[stats.tone])}
        />
      </div>
      <AttendanceBar percent={stats.percent} tone={stats.tone} className="mt-2.5" delay={delay} />

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-xs text-muted-foreground">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={stats.failed ? 'failed' : 'ok'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className={cn('font-medium', stats.failed ? 'text-bad' : 'text-foreground')}
            >
              {stats.failed
                ? `${plural(-stats.remaining, 'falta', 'faltas')} acima do limite`
                : stats.remaining === 0
                  ? 'No limite de faltas'
                  : `Pode faltar mais ${plural(stats.remaining, 'aula', 'aulas')}`}
            </motion.p>
          </AnimatePresence>
          <p className="mt-0.5">
            Limite: {stats.allowed} de {stats.total} aulas
          </p>
          <p>1 dia de aula = {plural(perDay, 'falta', 'faltas')}</p>
        </div>
        <Stepper size="sm" value={absences} max={stats.total} onChange={onChange} unit={['falta', 'faltas']} />
      </div>
    </motion.article>
  )
}
