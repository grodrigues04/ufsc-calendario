import type { CSSProperties } from 'react'
import type { SessionStatus } from '@shared/types'
import { activityState } from '@/lib/calendar'
import type { ActivityItem } from '@/lib/model'

/** Lets `.event-tint` (index.css) color an element with the discipline hue. */
export function hueStyle(hue: number | undefined): CSSProperties {
  return { '--hue': hue ?? 260 } as CSSProperties
}

/** The color of the discipline dots used across the app. */
export function hueColor(hue: number | undefined): string {
  return hue === undefined ? 'var(--muted-foreground)' : `oklch(0.65 0.15 ${hue})`
}

/** Text of an activity: struck through once delivered, red when late, faded when over. */
export function activityTextClass(item: ActivityItem, now: Date): string {
  const state = activityState(item.activity, now)
  if (state === 'overdue') return 'text-bad'
  if (state === 'done') return 'text-muted-foreground line-through decoration-muted-foreground/60'
  if (state === 'closed' || (state === 'event' && item.due < now)) return 'text-muted-foreground'
  return 'text-foreground'
}

/** What the Moodle roll call said about a class that already happened. */
export const MEETING_STATUS: Partial<Record<SessionStatus, { label: string; className: string }>> = {
  present: { label: 'Presente', className: 'text-good' },
  absent: { label: 'Falta', className: 'text-bad' },
  partial: { label: 'Parcial', className: 'text-warn' },
  justified: { label: 'Justificada', className: 'text-muted-foreground' },
}
