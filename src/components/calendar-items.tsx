import { cn } from 'cn'
import { Circle, CircleAlert, CircleCheck, CircleX, Flag, type LucideIcon } from 'lucide-react'
import { type ActivityState, activityState } from '@/lib/calendar'
import type { ActivityItem } from '@/lib/model'
import { useUi } from '@/lib/ui'
import { activityTextClass, hueColor } from './calendar-style'

const STATE_ICON: Record<ActivityState, LucideIcon> = {
  pending: Circle,
  overdue: CircleAlert,
  done: CircleCheck,
  closed: CircleX,
  event: Flag,
}

/** Status of an activity at a glance: open circle, alert when late, check when delivered. */
export function ActivityIcon({ item, now, className }: { item: ActivityItem; now: Date; className?: string }) {
  const state = activityState(item.activity, now)
  const Icon = STATE_ICON[state]
  const upcoming = item.due >= now
  return (
    <Icon
      aria-hidden
      className={cn(
        'shrink-0',
        state === 'overdue' && 'text-bad',
        state === 'done' && 'text-good',
        (state === 'closed' || (state === 'event' && !upcoming)) && 'text-muted-foreground',
        className,
      )}
      style={state === 'pending' || (state === 'event' && upcoming) ? { color: hueColor(item.view?.hue) } : undefined}
      strokeWidth={2.4}
    />
  )
}

/** Small activity tag of the week strip and the month cells (inside a cell it is not a button). */
export function ActivityChip({ item, now, interactive = true }: { item: ActivityItem; now: Date; interactive?: boolean }) {
  const openActivity = useUi((state) => state.openActivity)
  const className = 'flex h-4 w-full min-w-0 items-center gap-0.5 rounded-[5px] border bg-card px-0.5 text-[9.5px] leading-none font-medium'
  const content = (
    <>
      <ActivityIcon item={item} now={now} className="size-2.5" />
      <span className={cn('min-w-0 truncate', activityTextClass(item, now))}>{item.activity.name}</span>
    </>
  )
  if (!interactive) return <span className={className}>{content}</span>
  return (
    <button
      type="button"
      onClick={() => openActivity(item.activity.id)}
      aria-label={item.activity.name}
      className={cn(className, 'active:bg-secondary')}
    >
      {content}
    </button>
  )
}
