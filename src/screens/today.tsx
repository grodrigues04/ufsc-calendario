import { cn } from 'cn'
import { ArrowDownRight, ArrowUpRight, CalendarOff, Check, ChevronRight, X } from 'lucide-react'
import { motion } from 'motion/react'
import { useMemo } from 'react'
import { Link } from 'wouter'
import type { Activity } from '@shared/types'
import { AnimatedNumber } from '@/components/animated-number'
import { AttendanceBar } from '@/components/attendance-bar'
import { AttendanceWarning } from '@/components/attendance-warning'
import { Screen, SectionTitle } from '@/components/screen'
import { EASE_OUT, TONE_TEXT } from '@/components/tone'
import {
  dayDiff,
  formatDayCount,
  formatDistance,
  formatDue,
  formatLongDate,
  formatPercent,
  formatRelativeDay,
  formatTimeRange,
  plural,
} from '@/lib/format'
import { absenceDays, activityItems, type ClassItem, classesOn, nextClassDay, toneFor } from '@/lib/model'
import { useApp, useClock } from '@/lib/store'
import { useDisciplines } from '@/lib/sync'
import { useUi } from '@/lib/ui'

const DEADLINE_DAYS = 7
// Older overdue items stay in the Atividades tab; the card only nags about recent ones.
const RECENT_OVERDUE_DAYS = 14

export function TodayScreen() {
  const views = useDisciplines()
  const sync = useApp((state) => state.sync)
  const now = useClock((state) => state.now)

  const today = useMemo(() => classesOn(views, now), [views, now])
  const remainingToday = today.filter((item) => item.meeting.end > now)
  const next = useMemo(() => (remainingToday.length === 0 ? nextClassDay(views, now) : null), [remainingToday.length, views, now])

  // Deadlines of disciplines that already have a card on this screen are shown inside the card.
  const deadlines = useMemo(() => {
    const shownCourses = new Set([...today, ...(next?.classes ?? [])].map((item) => item.view.course?.id))
    return activityItems(sync, views).filter(
      (item) =>
        item.activity.pending &&
        item.due >= now &&
        dayDiff(now, item.due) <= DEADLINE_DAYS &&
        !shownCourses.has(item.activity.courseId),
    )
  }, [sync, views, now, today, next])

  return (
    <Screen title="Hoje" subtitle={formatLongDate(now)}>
      {today.length > 0 ? (
        <div className="space-y-3">
          {today.map((item, index) => (
            <ClassCard key={`${item.view.id}-${item.meeting.start.toISOString()}`} item={item} index={index} />
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE_OUT }}
          className="flex items-center gap-4 rounded-3xl border bg-card px-5 py-5"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-secondary">
            <CalendarOff className="size-5 text-muted-foreground" />
          </span>
          <div>
            <h2 className="font-semibold">Sem aulas hoje</h2>
            <p className="text-sm text-muted-foreground">
              {next ? `Próxima: ${formatRelativeDay(next.day, now)}, ${formatTimeRange(next.classes[0].meeting.start, next.classes[0].meeting.end)}` : 'Nenhuma aula nas próximas duas semanas.'}
            </p>
          </div>
        </motion.div>
      )}

      {next && (
        <>
          <SectionTitle>
            Próximas aulas · <span className="normal-case">{formatRelativeDay(next.day, now)}</span>
          </SectionTitle>
          <div className="space-y-3">
            {next.classes.map((item, index) => (
              <ClassCard key={`${item.view.id}-${item.meeting.start.toISOString()}`} item={item} index={index + today.length} />
            ))}
          </div>
        </>
      )}

      {deadlines.length > 0 && (
        <>
          <SectionTitle
            action={
              <Link href="/atividades" className="text-[13px] font-medium text-muted-foreground">
                Ver todas
              </Link>
            }
          >
            Próximos prazos
          </SectionTitle>
          <div className="divide-y rounded-3xl border bg-card">
            {deadlines.slice(0, 5).map((item) => (
              <a
                key={item.activity.id}
                href={item.activity.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-4 py-3 active:bg-secondary/60"
              >
                <span className="size-2 shrink-0 rounded-full" style={{ background: `oklch(0.65 0.15 ${item.view?.hue ?? 260})` }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.activity.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{item.courseName}</span>
                </span>
                <DueLabel date={item.due} />
              </a>
            ))}
          </div>
        </>
      )}
    </Screen>
  )
}

function ClassCard({ item, index }: { item: ClassItem; index: number }) {
  const now = useClock((state) => state.now)
  const openDiscipline = useUi((state) => state.openDiscipline)
  const { view, meeting, whatIf } = item
  const { stats } = view
  const days = absenceDays(view)
  const live = now >= meeting.start && now <= meeting.end
  const ended = now > meeting.end

  const pending = view.activities
    .filter((activity) => activity.pending)
    .map((activity) => ({ activity, due: new Date(activity.dueAt) }))
  const upcomingDeadlines = pending.filter(({ due }) => due >= now).sort((a, b) => a.due.getTime() - b.due.getTime())
  const overdue = pending.filter(({ due }) => due < now && dayDiff(due, now) <= RECENT_OVERDUE_DAYS).length

  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE_OUT, delay: Math.min(index, 6) * 0.05 }}
      className={cn('rounded-3xl border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04)]', ended && 'opacity-70')}
    >
      <button type="button" onClick={() => openDiscipline(view.id)} className="block w-full px-4 pt-4 text-left">
        <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
          <span className="tabular font-semibold text-foreground">{formatTimeRange(meeting.start, meeting.end)}</span>
          {meeting.room && <span className="truncate">· {meeting.room}</span>}
          <span className="ml-auto shrink-0">
            {live ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-good/12 px-2 py-0.5 text-xs font-semibold text-good">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-good opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-good" />
                </span>
                Agora
              </span>
            ) : ended ? (
              <span className="text-xs">Encerrada</span>
            ) : (
              <span className="text-xs">{formatDistance(meeting.start, now)}</span>
            )}
          </span>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-[17px] leading-snug font-semibold">{view.name}</h2>
            <p className="text-xs text-muted-foreground">
              {view.code} · {plural(meeting.classes, 'aula', 'aulas')}
            </p>
            {meeting.note && (
              <p className="mt-1.5 inline-flex max-w-full rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium">
                <span className="truncate first-letter:uppercase">{meeting.note.toLowerCase()}</span>
              </p>
            )}
          </div>
          {stats.hasData && (
            <AnimatedNumber value={stats.percent} className={cn('tabular text-[28px] leading-none font-semibold', TONE_TEXT[stats.tone])} />
          )}
        </div>
      </button>

      <div className="px-4 pb-4">
        <AttendanceWarning view={view} className="mt-3" />
        {stats.hasData ? (
          <>
            <AttendanceBar percent={stats.percent} tone={stats.tone} className="mt-3" delay={0.05 + Math.min(index, 6) * 0.05} />
            <p className="mt-1.5 text-xs text-muted-foreground">
              {stats.failed ? (
                <span className="font-medium text-bad">
                  Faltas acima do limite: {stats.absences} de {stats.allowedAbsences} aulas ({formatDayCount(days.absent)} de{' '}
                  {plural(days.allowed, 'dia', 'dias')})
                </span>
              ) : (
                <>
                  Faltas {stats.absences} de {stats.allowedAbsences} aulas ({formatDayCount(days.absent)} de{' '}
                  {plural(days.allowed, 'dia', 'dias')}) ·{' '}
                  {days.remaining > 0 ? `pode faltar mais ${plural(days.remaining, 'dia', 'dias')}` : 'no limite de faltas'}
                </>
              )}
            </p>
            {whatIf ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Outcome label="Se faltar" value={whatIf.ifAbsent} delta={whatIf.ifAbsent - (stats.percent ?? 0)} />
                <Outcome label="Se for" value={whatIf.ifPresent} delta={whatIf.ifPresent - (stats.percent ?? 0)} />
              </div>
            ) : (
              <RegisteredStatus status={meeting.status} />
            )}
          </>
        ) : (
          !view.attendanceFailed && <p className="mt-3 text-sm text-muted-foreground">Sem lista de presença no Moodle.</p>
        )}

        {(upcomingDeadlines.length > 0 || overdue > 0) && (
          <div className="mt-4 border-t pt-3">
            <p className="mb-1 text-xs font-semibold text-muted-foreground">Prazos</p>
            <ul className="space-y-0.5">
              {upcomingDeadlines.slice(0, 3).map(({ activity, due }) => (
                <DeadlineLine key={activity.id} activity={activity} due={due} />
              ))}
            </ul>
            {overdue > 0 && (
              <Link href="/atividades" className="mt-1 inline-flex items-center text-xs font-medium text-bad">
                {plural(overdue, 'atividade atrasada', 'atividades atrasadas')}
                <ChevronRight className="size-3.5" />
              </Link>
            )}
          </div>
        )}
      </div>
    </motion.article>
  )
}

function Outcome({ label, value, delta }: { label: string; value: number; delta: number }) {
  const tone = toneFor(value)
  const Icon = delta >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="rounded-2xl bg-secondary/70 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex items-baseline gap-1.5">
        <span className={cn('tabular text-lg leading-none font-semibold', TONE_TEXT[tone])}>{formatPercent(value)}</span>
        <span className="tabular inline-flex items-center text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {formatPercent(Math.abs(delta), true).replace('%', '')}
        </span>
      </p>
    </div>
  )
}

function RegisteredStatus({ status }: { status: ClassItem['meeting']['status'] }) {
  const present = status === 'present'
  return (
    <p
      className={cn(
        'mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        present ? 'bg-good/12 text-good' : 'bg-bad/12 text-bad',
      )}
    >
      {present ? <Check className="size-3.5" /> : <X className="size-3.5" />}
      {present ? 'Presença registrada' : status === 'partial' ? 'Presença parcial registrada' : 'Falta registrada'}
    </p>
  )
}

function DeadlineLine({ activity, due }: { activity: Activity; due: Date }) {
  return (
    <li>
      <a href={activity.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 py-1 text-sm">
        <span className="min-w-0 truncate">{activity.name}</span>
        <DueLabel date={due} />
      </a>
    </li>
  )
}

export function DueLabel({ date }: { date: Date }) {
  const now = useClock((state) => state.now)
  const hours = (date.getTime() - now.getTime()) / 3_600_000
  const urgent = hours < 24
  const soon = hours < 72
  return (
    <span
      className={cn(
        'tabular shrink-0 text-xs font-medium',
        hours < 0 || urgent ? 'text-bad' : soon ? 'text-warn' : 'text-muted-foreground',
      )}
    >
      {formatDue(date, now)}
    </span>
  )
}
