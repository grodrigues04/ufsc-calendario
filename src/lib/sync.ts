import { useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { ApiFailure, sync } from './api'
import { plural } from './format'
import { processNews } from './inbox'
import { buildDisciplines } from './model'
import { useApp, useClock } from './store'

const STALE_AFTER_MS = 5 * 60_000

let inFlight: Promise<void> | null = null

/** Refreshes attendance and activities. Concurrent calls share the same request. */
export function syncNow({ silent = false }: { silent?: boolean } = {}): Promise<void> {
  if (inFlight) return inFlight
  const { auth, student, sync: previous, setSyncing } = useApp.getState()
  if (!auth) return Promise.resolve()
  if (!navigator.onLine) {
    if (!silent) toast('Você está offline', { description: 'Mostrando os últimos dados salvos.' })
    return Promise.resolve()
  }

  setSyncing(true)
  inFlight = (async () => {
    try {
      const attendanceCmids = Object.fromEntries(
        Object.entries(previous?.attendance ?? {}).map(([courseId, attendance]) => [courseId, attendance.cmids]),
      )
      const result = await sync({
        auth,
        semester: student?.semester || previous?.semester || null,
        attendanceCmids,
      })
      useApp.getState().applySync(result)
      void processNews(result)
      const notRead = result.attendanceFailed?.length ?? 0
      if (silent) {
        // Automatic syncs stay quiet: the disciplines that were not read are marked on screen.
      } else if (result.attendanceIssue === 'lockout') {
        toast('O Moodle não deixou entrar de novo agora', { description: 'Ele libera um novo login a cada 6 minutos. As disciplinas não atualizadas ficam marcadas.' })
      } else if (notRead > 0) {
        toast.error(`Não consegui ler a presença de ${plural(notRead, 'disciplina', 'disciplinas')}`, {
          description: 'Entrei de novo no Moodle e tentei outra vez. Elas ficam marcadas até a próxima leitura.',
        })
      } else {
        toast.success('Tudo atualizado')
      }
    } catch (error) {
      if (error instanceof ApiFailure && error.code === 'invalid_token') {
        useApp.getState().signOut()
        toast.error('Seu acesso ao Moodle expirou', { description: 'Entre de novo com o idUFSC.' })
      } else if (!silent) {
        toast.error(error instanceof ApiFailure ? error.message : 'Não consegui atualizar agora.')
      }
    } finally {
      useApp.getState().setSyncing(false)
      inFlight = null
    }
  })()
  return inFlight
}

function isStale(): boolean {
  const syncedAt = useApp.getState().sync?.syncedAt
  return !syncedAt || Date.now() - new Date(syncedAt).getTime() > STALE_AFTER_MS
}

/** Syncs when the app opens or comes back to the foreground with old data. Also drives the clock. */
export function useAutoSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    if (isStale()) void syncNow({ silent: true })
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      useClock.getState().tick()
      if (isStale()) void syncNow({ silent: true })
    }
    const onOnline = () => isStale() && void syncNow({ silent: true })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    const timer = window.setInterval(() => useClock.getState().tick(), 30_000)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.clearInterval(timer)
    }
  }, [enabled])
}

/** Disciplines with attendance stats, recomputed when data changes or every minute. */
export function useDisciplines() {
  const disciplines = useApp((state) => state.disciplines)
  const syncResult = useApp((state) => state.sync)
  const now = useClock((state) => state.now)
  const minute = Math.floor(now.getTime() / 60_000)
  return useMemo(() => buildDisciplines(disciplines, syncResult, new Date(minute * 60_000)), [disciplines, syncResult, minute])
}
