// News inside the app: detected after each sync (and by the service worker in the background),
// kept on the device in IndexedDB until the student dismisses them.

import { useMemo } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { activeRecords } from '@shared/notes'
import type { SyncResult } from '@shared/types'
import { kvDelete, kvGet, kvSet } from './kv'
import { buildDisciplines } from './model'
import { detectNews, MAX_INBOX, type NewsItem, type NewsSnapshot, newsText, type SeenState } from './news'
import { useNotes } from './notes'
import { notesSemester, useApp, useSemester } from './store'
import { useUi } from './ui'

interface InboxState {
  items: NewsItem[]
  dismiss: (key: string) => void
  /** Leaving the "Avisos" tab marks everything as read. */
  markAllRead: () => void
}

export const useInbox = create<InboxState>()((set, get) => ({
  items: [],
  dismiss: (key) => {
    const items = get().items.filter((item) => item.key !== key)
    set({ items })
    void kvSet('inbox', items).catch(() => {})
  },
  markAllRead: () => {
    if (!get().items.length) return
    set({ items: [] })
    void kvSet('inbox', []).catch(() => {})
  },
}))

/** News still worth showing (an absence already noted in the Manual tab is done). */
export function useVisibleNews(): NewsItem[] {
  const items = useInbox((state) => state.items)
  const notes = useNotes((state) => state.notes)
  const semester = useSemester()
  return useMemo(
    () =>
      items.filter(
        (item) =>
          item.kind !== 'absence' || !activeRecords(notes, semester, item.disciplineId).some((record) => record.date === item.date),
      ),
    [items, notes, semester],
  )
}

/** Picks up news the service worker found while the app was closed. */
export async function loadInbox(): Promise<void> {
  const items = await kvGet<NewsItem[]>('inbox').catch(() => undefined)
  useInbox.setState({ items: items ?? [] })
}

/** Everything the service worker needs to check Moodle alone. Stays on this device. */
function buildSnapshot(): NewsSnapshot | null {
  const { auth, student, disciplines, sync } = useApp.getState()
  if (!auth || !sync) return null
  const now = new Date()
  const views = buildDisciplines(disciplines, sync, now)
  const notes = useNotes.getState().notes
  const recordsSemester = notesSemester({ student, sync }, now)
  const map: NewsSnapshot['disciplines'] = {}
  for (const view of views) if (view.course) map[view.course.id] = { id: view.id, name: view.name }
  return {
    userId: auth.userId,
    auth,
    semester: student?.semester || sync.semester || null,
    attendanceCmids: Object.fromEntries(Object.entries(sync.attendance).map(([courseId, attendance]) => [courseId, attendance.cmids])),
    disciplines: map,
    manualDays: views.flatMap((view) =>
      activeRecords(notes, recordsSemester, view.id)
        .filter((record) => record.date)
        .map((record) => `${view.id}|${record.date}`),
    ),
  }
}

let snapshotTimer: number | undefined

/** Keeps the snapshot current (e.g. absences just noted in the Manual tab are not reported). */
export function scheduleSnapshot(): void {
  window.clearTimeout(snapshotTimer)
  snapshotTimer = window.setTimeout(() => {
    const snapshot = buildSnapshot()
    if (snapshot) void kvSet('snapshot', snapshot).catch(() => {})
  }, 500)
}

useNotes.subscribe((state, previous) => {
  if (state.notes !== previous.notes) scheduleSnapshot()
})

function announce(item: NewsItem): void {
  const { title, body } = newsText(item)
  if (item.kind === 'absence') {
    toast(title, {
      description: `${item.disciplineName}. Quer adicionar às faltas manuais?`,
      duration: 8000,
      action: { label: 'Adicionar', onClick: () => useUi.getState().openAbsence(item.disciplineId, undefined, item.date) },
    })
  } else {
    toast(title, {
      description: body,
      duration: 8000,
      action: { label: 'Ver', onClick: () => window.open(item.url, '_blank', 'noopener') },
    })
  }
}

/** Runs after every sync made by the app: the first one only records what already exists. */
export async function processNews(sync: SyncResult): Promise<void> {
  try {
    const snapshot = buildSnapshot()
    if (!snapshot) return
    await kvSet('snapshot', snapshot)
    const { seen, news } = detectNews(await kvGet<SeenState>('seen'), sync, snapshot, new Date())
    await kvSet('seen', seen)
    if (!news.length) return
    const items = [...news, ...((await kvGet<NewsItem[]>('inbox')) ?? [])].slice(0, MAX_INBOX)
    await kvSet('inbox', items)
    useInbox.setState({ items })
    news.slice(0, 2).forEach(announce)
  } catch {
    // IndexedDB unavailable (private mode): news are a bonus, the app works without them.
  }
}

export async function clearNews(): Promise<void> {
  useInbox.setState({ items: [] })
  await Promise.all(['snapshot', 'seen', 'inbox'].map((key) => kvDelete(key).catch(() => {})))
}
