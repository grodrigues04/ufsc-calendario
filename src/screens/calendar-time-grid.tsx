import { cn } from 'cn'
import { CalendarOff, ListTodo } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { ActivityChip, ActivityIcon } from '@/components/calendar-items'
import { activityTextClass, hueStyle, MEETING_STATUS } from '@/components/calendar-style'
import { TONE_TEXT } from '@/components/tone'
import { activityStatus, type ClassEvent, classSpan, disciplineAcronym, minutesOf, placeSideBySide } from '@/lib/calendar'
import { dayDiff, formatLongDate, formatPercent, formatTime, formatTimeRange, isSameDay, plural, weekdayShort } from '@/lib/format'
import type { ActivityItem } from '@/lib/model'
import { useUi } from '@/lib/ui'

export interface CalendarDay {
  day: Date
  classes: ClassEvent[]
  activities: ActivityItem[]
}

const HOUR_HEIGHT = 52
/** Room above the first and below the last hour line, so their labels fit. */
const GRID_PADDING = 10
/** Day headers stick below the compact title bar of the screen while the page scrolls. */
export const STICKY_TOP = 'top-[calc(env(safe-area-inset-top)+2.75rem)]'
/** Activities per day in the week strip before "+N". */
const WEEK_STRIP_MAX = 3

const WEEK_COLUMNS = 'grid-cols-[2rem_repeat(7,minmax(0,1fr))]'
const DAY_COLUMNS = 'grid-cols-[2.75rem_minmax(0,1fr)]'

function dayTitle(day: Date, now: Date): string {
  const diff = dayDiff(now, day)
  if (diff === 0) return 'Hoje'
  if (diff === 1) return 'Amanhã'
  if (diff === -1) return 'Ontem'
  return formatLongDate(day)
}

export function DayView({ entry, hours, now }: { entry: CalendarDay; hours: [number, number] | null; now: Date }) {
  const { day, classes, activities } = entry
  const today = isSameDay(day, now)
  const summary = [classes.length && plural(classes.length, 'aula', 'aulas'), activities.length && plural(activities.length, 'atividade', 'atividades')]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="overflow-clip rounded-3xl border bg-card">
      <header className={cn('sticky z-20 flex items-center gap-3 border-b bg-card px-3 py-2', STICKY_TOP)}>
        <span className="flex w-11 shrink-0 flex-col items-center">
          <span className={cn('text-[10px] font-semibold tracking-wide uppercase', today ? 'text-foreground' : 'text-muted-foreground')}>
            {weekdayShort(day)}
          </span>
          <span
            className={cn('tabular grid size-9 place-items-center rounded-full text-lg font-semibold', today && 'bg-foreground text-background')}
          >
            {day.getDate()}
          </span>
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold first-letter:uppercase">{dayTitle(day, now)}</span>
          <span className="block text-xs text-muted-foreground">{summary || 'Nada marcado'}</span>
        </span>
      </header>

      {activities.length > 0 && (
        <ul className="divide-y border-b">
          {activities.map((item) => (
            <ActivityRow key={item.activity.id} item={item} now={now} />
          ))}
        </ul>
      )}

      {classes.length > 0 && hours ? (
        <TimeGrid days={[entry]} hours={hours} now={now} wide />
      ) : (
        <Empty>{activities.length ? 'Sem aulas neste dia' : 'Sem aulas nem atividades neste dia'}</Empty>
      )}
    </div>
  )
}

export function WeekView({
  days,
  hours,
  now,
  onOpenDay,
}: {
  days: CalendarDay[]
  hours: [number, number] | null
  now: Date
  onOpenDay: (day: Date) => void
}) {
  const hasActivities = days.some((entry) => entry.activities.length > 0)
  const hasClasses = days.some((entry) => entry.classes.length > 0)

  return (
    <div className="overflow-clip rounded-3xl border bg-card">
      <div className={cn('sticky z-20 grid border-b bg-card pt-2 pb-1.5', WEEK_COLUMNS, STICKY_TOP)}>
        <span />
        {days.map(({ day, classes, activities }) => {
          const today = isSameDay(day, now)
          return (
            <button
              key={day.toISOString()}
              type="button"
              onClick={() => onOpenDay(day)}
              aria-label={`${formatLongDate(day)}: ${plural(classes.length, 'aula', 'aulas')}, ${plural(activities.length, 'atividade', 'atividades')}`}
              className="flex flex-col items-center gap-0.5"
            >
              <span className={cn('text-[10px] font-semibold tracking-wide uppercase', today ? 'text-foreground' : 'text-muted-foreground')}>
                {weekdayShort(day)}
              </span>
              <span
                className={cn(
                  'tabular grid size-7 place-items-center rounded-full text-[15px] font-semibold',
                  today && 'bg-foreground text-background',
                )}
              >
                {day.getDate()}
              </span>
            </button>
          )
        })}
      </div>

      {hasActivities && (
        <div className={cn('grid border-b py-1', WEEK_COLUMNS)}>
          <span className="flex justify-center pt-px" title="Atividades">
            <ListTodo aria-hidden className="size-3.5 text-muted-foreground" />
          </span>
          {days.map(({ day, activities }) => {
            const shown = activities.length > WEEK_STRIP_MAX ? activities.slice(0, WEEK_STRIP_MAX - 1) : activities
            return (
              <div key={day.toISOString()} className="min-w-0 space-y-0.5 px-px">
                {shown.map((item) => (
                  <ActivityChip key={item.activity.id} item={item} now={now} />
                ))}
                {activities.length > shown.length && (
                  <button
                    type="button"
                    onClick={() => onOpenDay(day)}
                    aria-label={`Mais ${activities.length - shown.length} atividades em ${formatLongDate(day)}`}
                    className="block h-4 w-full text-center text-[9.5px] font-semibold text-muted-foreground"
                  >
                    +{activities.length - shown.length}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {hasClasses && hours ? <TimeGrid days={days} hours={hours} now={now} wide={false} /> : <Empty>Sem aulas nesta semana</Empty>}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
      <CalendarOff aria-hidden className="size-4" />
      {children}
    </p>
  )
}

function ActivityRow({ item, now }: { item: ActivityItem; now: Date }) {
  const openActivity = useUi((state) => state.openActivity)
  const time = formatTime(item.due)
  return (
    <li>
      <button
        type="button"
        onClick={() => openActivity(item.activity.id)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left active:bg-secondary/60"
      >
        <ActivityIcon item={item} now={now} className="size-[18px]" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', activityTextClass(item, now))}>{item.activity.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {item.courseName} · {activityStatus(item.activity, now)}
          </span>
        </span>
        <span className="tabular shrink-0 text-xs font-medium text-muted-foreground">{item.activity.module ? `até ${time}` : time}</span>
      </button>
    </li>
  )
}

/** Hours down the side, a column per day; classes placed by time, like Google Calendar. */
function TimeGrid({ days, hours, now, wide }: { days: CalendarDay[]; hours: [number, number]; now: Date; wide: boolean }) {
  const [startHour, endHour] = hours
  const y = (minutes: number) => GRID_PADDING + (minutes / 60 - startHour) * HOUR_HEIGHT
  const nowMinutes = minutesOf(now)
  const showNow = nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60

  return (
    <div className="relative" style={{ height: (endHour - startHour) * HOUR_HEIGHT + GRID_PADDING * 2 }}>
      {Array.from({ length: endHour - startHour + 1 }, (_, index) => {
        const hour = startHour + index
        return (
          <div key={hour} aria-hidden className="pointer-events-none absolute inset-x-0" style={{ top: y(hour * 60) }}>
            {/* The last line closes the grid: its label would sit on the rounded corner. */}
            {hour < endHour && (
              <span
                className={cn(
                  'tabular absolute -translate-y-1/2 pr-1.5 text-right text-[10px] leading-none text-muted-foreground',
                  wide ? 'w-11' : 'w-8',
                )}
              >
                {String(hour).padStart(2, '0')}:00
              </span>
            )}
            <span className={cn('absolute right-0 border-t', wide ? 'left-11' : 'left-8')} />
          </div>
        )
      })}
      <div className={cn('absolute inset-0 grid', wide ? DAY_COLUMNS : WEEK_COLUMNS)}>
        <span />
        {days.map((entry) => (
          <div key={entry.day.toISOString()} className={cn('relative', !wide && 'border-l')}>
            {placeSideBySide(entry.classes, (event) => classSpan(event.meeting)).map(({ event, lane, lanes }) => {
              const [start, end] = classSpan(event.meeting)
              const top = y(start)
              const height = Math.max(18, y(end) - top - 2)
              // Week columns are narrow: every pixel of the gap goes to the text.
              const gap = wide ? 2 : 1
              return (
                <ClassBlock
                  key={event.key}
                  event={event}
                  now={now}
                  wide={wide}
                  height={height}
                  style={{ top, height, left: `calc(${(lane / lanes) * 100}% + ${gap}px)`, width: `calc(${100 / lanes}% - ${gap * 2}px)` }}
                />
              )
            })}
            {showNow && isSameDay(entry.day, now) && (
              <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-1/2 bg-bad" style={{ top: y(nowMinutes) }}>
                <span className="absolute top-1/2 -left-1 size-2.5 -translate-y-1/2 rounded-full bg-bad" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function ClassBlock({ event, now, wide, height, style }: { event: ClassEvent; now: Date; wide: boolean; height: number; style: CSSProperties }) {
  const openDiscipline = useUi((state) => state.openDiscipline)
  const { view, meeting } = event
  const status = meeting.points !== null ? MEETING_STATUS[meeting.status] : undefined
  const label = [view.name, formatTimeRange(meeting.start, meeting.end), meeting.room && `sala ${meeting.room}`, status?.label]
    .filter(Boolean)
    .join(', ')

  return (
    <button
      type="button"
      onClick={() => openDiscipline(view.id)}
      aria-label={label}
      className={cn(
        'event-tint absolute z-[1] flex flex-col overflow-hidden border-(--event-accent) bg-(--event-surface) text-left text-(--event-text) transition-[filter] active:brightness-95',
        wide ? 'rounded-xl border-l-[3px] px-2.5 py-1.5' : 'rounded-md border-l-2 py-0.5 pr-0.5 pl-[3px]',
        meeting.end < now && 'opacity-60',
      )}
      style={{ ...hueStyle(view.hue), ...style }}
    >
      {wide ? (
        <>
          <span className="flex items-start justify-between gap-2">
            <span className={cn('min-w-0 text-[13px] leading-snug font-semibold', height < 64 ? 'line-clamp-1' : 'line-clamp-2')}>{view.name}</span>
            {view.stats.hasData && (
              <span className={cn('tabular shrink-0 text-[13px] leading-snug font-semibold', TONE_TEXT[view.stats.tone])}>
                {formatPercent(view.stats.percent)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] leading-tight">
            <span className="tabular shrink-0 opacity-85">{formatTimeRange(meeting.start, meeting.end)}</span>
            {meeting.room && <span className="truncate opacity-85">· {meeting.room}</span>}
            {status && <span className={cn('ml-auto shrink-0 font-semibold', status.className)}>{status.label}</span>}
          </span>
          {meeting.note && height >= 84 && (
            <span className="mt-1 truncate text-[11px] leading-tight font-medium first-letter:uppercase">{meeting.note.toLowerCase()}</span>
          )}
        </>
      ) : (
        <>
          <span className="text-[11px] leading-[13px] font-semibold [overflow-wrap:anywhere]">{disciplineAcronym(view.name)}</span>
          {meeting.room && height >= 40 && <span className="mt-0.5 truncate text-[9.5px] leading-[11px] opacity-80">{meeting.room}</span>}
        </>
      )}
    </button>
  )
}
