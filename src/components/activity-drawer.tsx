import { cn } from 'cn'
import { ExternalLink } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { activityHint, activityState, activityStatus } from '@/lib/calendar'
import { formatDistance, formatLongDate, formatTime } from '@/lib/format'
import { type ActivityItem, activityItems, activityKind } from '@/lib/model'
import { useApp, useClock } from '@/lib/store'
import { useDisciplines } from '@/lib/sync'
import { useBackToClose, useUi } from '@/lib/ui'
import { ActivityIcon } from './calendar-items'
import { hueColor } from './calendar-style'

/** An activity opened from the Calendário: when, its status, and the way to Moodle. */
export function ActivityDrawer() {
  const id = useUi((state) => state.activityId)
  const close = useUi((state) => state.closeActivity)
  const views = useDisciplines()
  const sync = useApp((state) => state.sync)
  const item = useMemo(
    () => (id === null ? null : (activityItems(sync, views).find((candidate) => candidate.activity.id === id) ?? null)),
    [id, sync, views],
  )
  // Keep rendering the last activity while the sheet animates out.
  const [shown, setShown] = useState(item)
  if (item && item !== shown) setShown(item)
  useBackToClose(id !== null, close)

  return (
    <Drawer open={id !== null} onOpenChange={(open) => !open && close()}>
      <DrawerContent>{shown && <ActivityDetail item={shown} />}</DrawerContent>
    </Drawer>
  )
}

function ActivityDetail({ item }: { item: ActivityItem }) {
  const now = useClock((state) => state.now)
  const { activity, due, view } = item
  const state = activityState(activity, now)

  return (
    <div className="mx-auto w-full max-w-lg overflow-y-auto px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
      <p className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <span className="size-2 shrink-0 rounded-full" style={{ background: hueColor(view?.hue) }} />
        <span className="truncate">{item.courseName}</span>
      </p>
      <DrawerTitle className="mt-1 text-xl leading-snug font-semibold">{activity.name}</DrawerTitle>
      <DrawerDescription className="mt-0.5">{activityKind(activity)}</DrawerDescription>

      <dl className="mt-5 grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-secondary/70 px-4 py-3">
          <dt className="text-xs text-muted-foreground">{activity.module ? 'Prazo' : 'Quando'}</dt>
          <dd className="mt-0.5 leading-snug font-semibold first-letter:uppercase">{formatLongDate(due)}</dd>
          <dd className="tabular mt-0.5 text-xs text-muted-foreground">
            {formatTime(due)} · {formatDistance(due, now)}
          </dd>
        </div>
        <div className="rounded-2xl bg-secondary/70 px-4 py-3">
          <dt className="text-xs text-muted-foreground">Situação</dt>
          <dd className={cn('mt-0.5 flex items-center gap-1.5 font-semibold', state === 'overdue' && 'text-bad')}>
            <ActivityIcon item={item} now={now} className="size-4" />
            {activityStatus(activity, now)}
          </dd>
          <dd className="mt-0.5 text-xs leading-snug text-muted-foreground">{activityHint(activity, now)}</dd>
        </div>
      </dl>

      <a
        href={activity.url}
        target="_blank"
        rel="noreferrer"
        className="mt-5 flex h-11 items-center justify-center gap-2 rounded-full border text-sm font-medium"
      >
        Abrir no Moodle
        <ExternalLink className="size-4" />
      </a>
    </div>
  )
}
