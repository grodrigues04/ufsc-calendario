import { cn } from 'cn'
import { RotateCw, TriangleAlert } from 'lucide-react'
import { formatRelativeDay, formatTime } from '@/lib/format'
import type { DisciplineView } from '@/lib/model'
import { useApp, useClock } from '@/lib/store'
import { syncNow } from '@/lib/sync'

/** Which reading is on screen when Moodle did not let the app read the discipline now. */
function readingShown(view: DisciplineView, now: Date): string {
  if (!view.stats.hasData) return 'Ainda não há uma leitura desta disciplina.'
  if (!view.attendanceReadAt) return 'Mostrando a última leitura.'
  return `Mostrando a leitura de ${formatRelativeDay(view.attendanceReadAt, now)}, ${formatTime(view.attendanceReadAt)}.`
}

/**
 * Shown on a discipline whose attendance page Moodle did not open, even after a new login.
 * `retry` is off inside elements that are already buttons (a button cannot hold another).
 */
export function AttendanceWarning({ view, retry = true, className }: { view: DisciplineView; retry?: boolean; className?: string }) {
  const now = useClock((state) => state.now)
  const syncing = useApp((state) => state.syncing)
  if (!view.attendanceFailed) return null

  return (
    <div role="status" className={cn('flex items-start gap-2.5 rounded-2xl bg-warn/12 px-3 py-2.5 text-left text-xs', className)}>
      <TriangleAlert className="mt-px size-4 shrink-0 text-warn" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-warn">Não consegui ler a presença no Moodle</p>
        <p className="mt-0.5 leading-relaxed text-muted-foreground">{readingShown(view, now)}</p>
      </div>
      {retry && <RetryButton syncing={syncing} />}
    </div>
  )
}

/** Syncs again (a new Moodle login happens on the server when the saved one no longer works). */
export function RetryButton({ syncing, className }: { syncing: boolean; className?: string }) {
  return (
    <button
      type="button"
      disabled={syncing}
      onClick={() => void syncNow()}
      className={cn(
        '-my-1 inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold text-foreground active:bg-warn/15 disabled:opacity-60',
        className,
      )}
    >
      <RotateCw className={cn('size-3.5', syncing && 'animate-spin')} />
      Tentar de novo
    </button>
  )
}

/** Compact version for small cards. */
export function AttendanceWarningChip({ view, className }: { view: DisciplineView; className?: string }) {
  if (!view.attendanceFailed) return null
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full bg-warn/14 px-2 py-0.5 text-[11px] font-semibold text-warn', className)}>
      <TriangleAlert className="size-3" />
      Não atualizada
    </span>
  )
}
