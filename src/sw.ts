/// <reference lib="webworker" />
// Service worker: offline app shell, prompt-based updates and background checks for news.
// Background checks only happen where the browser allows it (Periodic Background Sync, Android).

import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import type { SyncResult } from '../shared/types'
import { kvGet, kvSet } from './lib/kv'
import { detectNews, MAX_INBOX, NEWS_SYNC_TAG, type NewsItem, type NewsSnapshot, newsText, newsUrl, type SeenState } from './lib/news'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<string | { url: string; revision: string | null }>
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string
}

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }))

// "Atualizar" on the new-version toast.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})

self.addEventListener('periodicsync', ((event: PeriodicSyncEvent) => {
  if (event.tag === NEWS_SYNC_TAG) event.waitUntil(checkNews())
}) as EventListener)

/** Same check the app does when it opens, with the token kept on the device. */
async function checkNews(): Promise<void> {
  const [snapshot, enabled] = await Promise.all([kvGet<NewsSnapshot | null>('snapshot'), kvGet<boolean>('notify')])
  if (!snapshot || !enabled) return
  const response = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth: snapshot.auth, semester: snapshot.semester, attendanceCmids: snapshot.attendanceCmids }),
  })
  if (!response.ok) return
  const sync = (await response.json()) as SyncResult
  if (sync.session) await kvSet('snapshot', { ...snapshot, auth: { ...snapshot.auth, session: sync.session } })

  const { seen, news } = detectNews(await kvGet<SeenState>('seen'), sync, snapshot, new Date())
  await kvSet('seen', seen)
  if (!news.length) return
  const inbox = (await kvGet<NewsItem[]>('inbox')) ?? []
  await kvSet('inbox', [...news, ...inbox].slice(0, MAX_INBOX))
  for (const item of news) {
    const { title, body } = newsText(item)
    await self.registration.showNotification(title, {
      body,
      tag: item.key,
      icon: '/pwa-192x192.png',
      badge: '/pwa-64x64.png',
      data: { url: newsUrl(item) },
    })
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL((event.notification.data?.url as string | undefined) ?? '/', self.location.origin)
  event.waitUntil(
    (async () => {
      if (target.origin !== self.location.origin) {
        await self.clients.openWindow(target.href)
        return
      }
      const windows = (await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) as WindowClient[]
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        await open.focus()
        await open.navigate(target.href)
      } else {
        await self.clients.openWindow(target.href)
      }
    })(),
  )
})
