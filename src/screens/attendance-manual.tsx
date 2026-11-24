import { cn } from 'cn'
import { ChevronDown, ChevronRight, CloudCheck, CloudOff, LoaderCircle, Plus, TriangleAlert } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState } from 'react'
import { type AbsenceRecord, activeRecords } from '@shared/notes'
import { AnimatedNumber } from '@/components/animated-number'
import { AttendanceBar } from '@/components/attendance-bar'
import { EASE_OUT, SPRING_UI, TONE_TEXT } from '@/components/tone'
import { formatDayMonth, plural, weekdayShort } from '@/lib/format'
import { type DisciplineView, manualStats } from '@/lib/model'
import { syncNotes, useNotes } from '@/lib/notes'
import { useApp } from '@/lib/store'
import { useUi } from '@/lib/ui'

const STATUS = {
  idle: { icon: CloudCheck, label: 'Salvo na sua conta', spin: false },
  saving: { icon: LoaderCircle, label: 'Salvando…', spin: true },
  offline: { icon: CloudOff, label: 'Salvo no celular, sincroniza quando voltar a internet', spin: false },
  error: { icon: TriangleAlert, label: 'Salvo no celular, não consegui sincronizar', spin: false },
} as const

type DatedRecord = AbsenceRecord & { id: string }

export function ManualView({ views }: { views: DisciplineView[] }) {
  const semester = useApp((state) => state.student?.semester || state.sync?.semester || '')
  const notes = useNotes((state) => state.notes)
  const status = useNotes((state) => (state.dirty && state.status === 'idle' ? 'saving' : state.status))
  const Status = STATUS[status]
  const recordsByDiscipline = useMemo(
    () => new Map(views.map((view) => [view.id, activeRecords(notes, semester, view.id)])),
    [notes, semester, views],
  )

  return (
    <div className="space-y-3">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
        className="rounded-3xl border bg-card p-4"
      >
        <p className="text-sm leading-relaxed text-muted-foreground">
          Registre cada dia de aula que você faltou. Aqui só contam essas faltas: para passar, a presença precisa ficar em pelo
          menos <span className="font-semibold text-foreground">75%</span> das aulas do semestre.
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
        <ManualRow key={view.id} view={view} index={index} records={recordsByDiscipline.get(view.id) ?? []} />
      ))}
    </div>
  )
}

function recordDate(record: DatedRecord): string {
  if (!record.date) return 'Sem data'
  const date = new Date(`${record.date}T12:00:00`)
  return `${weekdayShort(date)} ${formatDayMonth(date)}`
}

function ManualRow({ view, index, records }: { view: DisciplineView; index: number; records: DatedRecord[] }) {
  const openAbsence = useUi((state) => state.openAbsence)
  const [expanded, setExpanded] = useState(false)
  const stats = manualStats(view, records)
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

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm">
            <span className="tabular font-semibold">{stats.days}</span>
            <span className="text-muted-foreground"> de {plural(stats.maxDays, 'falta', 'faltas')}</span>
          </p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={stats.failed ? 'failed' : stats.remainingDays === 0 ? 'limit' : 'ok'}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className={cn('text-xs font-medium', stats.failed ? 'text-bad' : stats.remainingDays === 0 ? 'text-warn' : 'text-muted-foreground')}
            >
              {stats.failed
                ? `${plural(stats.overDays, 'falta', 'faltas')} acima do limite`
                : stats.remainingDays === 0
                  ? 'No limite: mais uma falta reprova'
                  : `Pode faltar mais ${stats.remainingDays}`}
            </motion.p>
          </AnimatePresence>
          <p className="mt-0.5 text-xs text-muted-foreground">
            1 falta = 1 dia de aula ({plural(stats.perDay, 'aula', 'aulas')})
          </p>
        </div>
        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          transition={SPRING_UI}
          onClick={() => openAbsence(view.id)}
          aria-label={`Registrar falta em ${view.name}`}
          className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-foreground pr-4 pl-3 text-[13px] font-semibold text-background"
        >
          <Plus className="size-4" />
          Falta
        </motion.button>
      </div>

      {records.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mt-3 flex w-full items-center justify-between border-t pt-2.5 text-[13px] font-medium text-muted-foreground"
          >
            {expanded ? 'Esconder faltas' : `Ver faltas (${records.length})`}
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={SPRING_UI}>
              <ChevronDown className="size-4" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.ul
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.26, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                {records.map((record) => (
                  <li key={record.id}>
                    <button
                      type="button"
                      onClick={() => openAbsence(view.id, record.id)}
                      className="flex w-full items-center gap-3 rounded-xl py-2 text-left active:bg-secondary/60"
                    >
                      <span className="tabular w-[4.5rem] shrink-0 text-sm font-medium">{recordDate(record)}</span>
                      <span className={cn('min-w-0 flex-1 truncate text-sm', record.note ? '' : 'text-muted-foreground')}>
                        {record.note || 'Sem anotação'}
                      </span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.article>
  )
}
