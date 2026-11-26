import { cn } from 'cn'
import { ActivityChip } from '@/components/calendar-items'
import { hueStyle } from '@/components/calendar-style'
import { disciplineAcronym } from '@/lib/calendar'
import { formatLongDate, isSameDay, plural } from '@/lib/format'
import { type CalendarDay, STICKY_TOP } from './calendar-time-grid'

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
/** Items a day shows before "+N" (activities first, like all-day events in Google Calendar). */
const CELL_MAX = 3

export function MonthView({ month, days, now, onOpenDay }: { month: number; days: CalendarDay[]; now: Date; onOpenDay: (day: Date) => void }) {
  const weeks: CalendarDay[][] = []
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7))

  return (
    <div className="overflow-clip rounded-3xl border bg-card">
      <div className={cn('sticky z-20 grid grid-cols-7 border-b bg-card py-2', STICKY_TOP)}>
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="text-center text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            {weekday}
          </span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0].day.toISOString()} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((entry) => (
            <MonthCell key={entry.day.toISOString()} entry={entry} inMonth={entry.day.getMonth() === month} now={now} onOpenDay={onOpenDay} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** The whole day is a button: it opens the day view, like tapping a day in Google Calendar. */
function MonthCell({ entry, inMonth, now, onOpenDay }: { entry: CalendarDay; inMonth: boolean; now: Date; onOpenDay: (day: Date) => void }) {
  const { day, classes, activities } = entry
  const today = isSameDay(day, now)
  const total = activities.length + classes.length
  const room = total > CELL_MAX ? CELL_MAX - 1 : CELL_MAX
  const shownActivities = activities.slice(0, room)
  const shownClasses = classes.slice(0, room - shownActivities.length)
  const more = total - shownActivities.length - shownClasses.length

  return (
    <button
      type="button"
      onClick={() => onOpenDay(day)}
      aria-label={`${formatLongDate(day)}: ${plural(classes.length, 'aula', 'aulas')}, ${plural(activities.length, 'atividade', 'atividades')}`}
      className={cn(
        'flex min-h-[5.75rem] min-w-0 flex-col gap-0.5 border-l px-0.5 pt-1 pb-1.5 text-left first:border-l-0 active:bg-secondary/60',
        !inMonth && 'bg-secondary/40',
      )}
    >
      <span
        className={cn(
          'tabular mx-auto mb-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
          today ? 'bg-foreground text-background' : !inMonth && 'text-muted-foreground',
        )}
      >
        {day.getDate()}
      </span>
      <span className={cn('flex min-w-0 flex-col gap-0.5', !inMonth && 'opacity-55')}>
        {shownActivities.map((item) => (
          <ActivityChip key={item.activity.id} item={item} now={now} interactive={false} />
        ))}
        {shownClasses.map(({ key, view, meeting }) => (
          <span
            key={key}
            className={cn(
              'event-tint block h-4 truncate rounded-[5px] bg-(--event-surface) px-1 text-[9.5px] leading-4 font-semibold text-(--event-text)',
              meeting.end < now && 'opacity-60',
            )}
            style={hueStyle(view.hue)}
          >
            {disciplineAcronym(view.name)}
          </span>
        ))}
        {more > 0 && <span className="px-0.5 text-[9.5px] leading-4 font-semibold text-muted-foreground">+{more}</span>}
      </span>
    </button>
  )
}
