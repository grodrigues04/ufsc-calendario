import { cn } from 'cn'
import { ExternalLink } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo, useRef } from 'react'
import type { SessionStatus } from '@shared/types'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { formatDayCount, formatDayMonth, formatPercent, formatRelativeDay, formatTimeRange, plural, weekdayShort } from '@/lib/format'
import { absenceDays, type DisciplineView, displayRoom, nextMeetings, TONE_LABEL } from '@/lib/model'
import { useClock } from '@/lib/store'
import { useDisciplines } from '@/lib/sync'
import { useBackToClose, useUi } from '@/lib/ui'
import { AnimatedNumber } from './animated-number'
import { Ring } from './ring'
import { TONE_SOFT, TONE_TEXT } from './tone'

const WEEKDAY_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const STATUS: Record<SessionStatus, { label: string; className: string }> = {
  present: { label: 'Presente', className: 'bg-good/12 text-good' },
  absent: { label: 'Falta', className: 'bg-bad/12 text-bad' },
  partial: { label: 'Parcial', className: 'bg-warn/14 text-warn' },
  justified: { label: 'Justificada', className: 'bg-secondary text-muted-foreground' },
  pending: { label: 'Aguardando chamada', className: 'bg-secondary text-muted-foreground' },
}

export function DisciplineDrawer() {
  const id = useUi((state) => state.disciplineId)
  const close = useUi((state) => state.closeDiscipline)
  const views = useDisciplines()
  const view = views.find((candidate) => candidate.id === id) ?? null
  // Keep rendering the last discipline while the sheet animates out.
  const last = useRef<DisciplineView | null>(null)
  if (view) last.current = view
  const shown = view ?? last.current
  useBackToClose(Boolean(id), close)

  return (
    <Drawer open={Boolean(id)} onOpenChange={(open) => !open && close()}>
      <DrawerContent className="max-h-[92dvh]">{shown && <DisciplineDetail view={shown} />}</DrawerContent>
    </Drawer>
  )
}

function DisciplineDetail({ view }: { view: DisciplineView }) {
  const now = useClock((state) => state.now)
  const { stats } = view
  const days = absenceDays(view)
  const upcoming = useMemo(() => nextMeetings(view, now, 4), [view, now])
  const history = useMemo(
    () => view.meetings.filter((meeting) => meeting.points !== null || meeting.end <= now).reverse(),
    [view, now],
  )

  return (
    <div className="mx-auto w-full max-w-lg overflow-y-auto px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <DrawerTitle className="text-xl leading-snug font-semibold">{view.name}</DrawerTitle>
      <DrawerDescription className="mt-0.5">
        {[view.code, view.classGroup && `turma ${view.classGroup}`].filter(Boolean).join(' · ')}
        {view.professors.length > 0 && <span className="block truncate">{view.professors.join(', ')}</span>}
      </DrawerDescription>

      {stats.hasData ? (
        <>
          <div className="mt-5 flex items-center gap-5">
            <Ring percent={stats.percent} tone={stats.tone} size={112} stroke={10}>
              <AnimatedNumber value={stats.percent} className={cn('tabular text-2xl font-semibold', TONE_TEXT[stats.tone])} />
            </Ring>
            <div className="min-w-0 space-y-1.5">
              <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', TONE_SOFT[stats.tone])}>
                {stats.failed ? 'Reprovaria por falta' : TONE_LABEL[stats.tone]}
              </span>
              <p className="text-sm text-muted-foreground">
                Presença nas aulas já registradas no Moodle ({plural(stats.takenMax, 'aula', 'aulas')}).
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-2">
            <Stat
              label="Faltas"
              value={`${stats.absences} de ${stats.allowedAbsences} aulas`}
              hint={`= ${formatDayCount(days.absent)} de ${plural(days.allowed, 'dia de aula', 'dias de aula')}`}
              tone={stats.failed ? 'text-bad' : undefined}
            />
            <Stat
              label="Ainda pode faltar"
              value={days.remaining > 0 ? plural(days.remaining, 'dia', 'dias') : 'Nenhum dia'}
              hint={
                stats.remainingAbsences > 0
                  ? `${plural(stats.remainingAbsences, 'aula', 'aulas')} (1 dia = ${plural(days.perDay, 'aula', 'aulas')})`
                  : 'limite de 25% atingido'
              }
              tone={days.remaining <= 0 ? 'text-bad' : undefined}
            />
            <Stat label="Máximo possível" value={formatPercent(stats.maxPossiblePercent)} hint="indo em todas as próximas" />
            <Stat
              label="Chamadas feitas"
              value={`${view.meetings.filter((meeting) => meeting.points !== null).length} de ${view.meetings.length}`}
              hint={stats.pendingPast ? `${stats.pendingPast} aguardando` : 'encontros no semestre'}
            />
          </dl>
        </>
      ) : (
        <p className="mt-5 rounded-2xl bg-secondary/70 px-4 py-3 text-sm text-muted-foreground">
          Esta disciplina ainda não tem lista de presença no Moodle.
        </p>
      )}

      {view.schedule.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Horário</h3>
          <div className="flex flex-wrap gap-2">
            {view.schedule.map((slot) => (
              <span key={`${slot.weekday}-${slot.start}`} className="rounded-full bg-secondary px-3 py-1.5 text-[13px]">
                <span className="font-semibold">{WEEKDAY_SHORT[slot.weekday]}</span> {slot.start}–{slot.end}
                {slot.room && <span className="text-muted-foreground"> · {displayRoom(slot.room)}</span>}
              </span>
            ))}
          </div>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Próximas aulas</h3>
          <ul className="divide-y rounded-2xl border">
            {upcoming.map((meeting) => (
              <li key={meeting.start.toISOString()} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="font-medium first-letter:uppercase">{formatRelativeDay(meeting.start, now)}</span>
                <span className="tabular truncate text-muted-foreground">
                  {formatTimeRange(meeting.start, meeting.end)}
                  {meeting.room && ` · ${meeting.room}`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {history.length > 0 && (
        <section className="mt-6">
          <h3 className="mb-2 text-[13px] font-semibold tracking-wide text-muted-foreground uppercase">Histórico</h3>
          <ul className="divide-y rounded-2xl border">
            {history.map((meeting, index) => {
              const status = STATUS[meeting.status]
              return (
                <motion.li
                  key={meeting.start.toISOString()}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: Math.min(index, 12) * 0.02 }}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="tabular">
                    <span className="font-medium">{formatDayMonth(meeting.start)}</span>{' '}
                    <span className="text-muted-foreground">{weekdayShort(meeting.start)}</span>
                  </span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', status.className)}>
                    {meeting.status === 'partial' ? `${meeting.points}/${meeting.classes} aulas` : status.label}
                  </span>
                </motion.li>
              )
            })}
          </ul>
        </section>
      )}

      {(view.attendanceUrl || view.course) && (
        <a
          href={view.attendanceUrl ?? view.course!.url}
          target="_blank"
          rel="noreferrer"
          className="mt-6 flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-medium"
        >
          Abrir no Moodle
          <ExternalLink className="size-4" />
        </a>
      )}
    </div>
  )
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: string }) {
  return (
    <div className="rounded-2xl bg-secondary/70 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular mt-0.5 text-lg leading-tight font-semibold', tone)}>{value}</dd>
      <dd className="text-[11px] text-muted-foreground">{hint}</dd>
    </div>
  )
}
