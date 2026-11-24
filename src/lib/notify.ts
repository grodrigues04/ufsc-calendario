// System notifications while the app is closed. Web apps can only check by themselves where the
// browser offers Periodic Background Sync (Android, installed app). On iPhone, news show up
// inside the app when it opens.

import { useEffect, useState } from 'react'
import { isStandalone } from './install'
import { kvGet, kvSet } from './kv'
import { NEWS_SYNC_TAG } from './news'

interface PeriodicSyncManager {
  register: (tag: string, options?: { minInterval: number }) => Promise<void>
  unregister: (tag: string) => Promise<void>
}

type RegistrationWithPeriodicSync = ServiceWorkerRegistration & { periodicSync?: PeriodicSyncManager }

// A hint: Android decides the real frequency (usually a few times a day for apps in use).
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000

export type NotifySupport = 'background' | 'install-first' | 'in-app'

export function notifySupport(): NotifySupport {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
  const periodic =
    'serviceWorker' in navigator && 'Notification' in window && 'periodicSync' in ServiceWorkerRegistration.prototype
  if (ios || !periodic) return 'in-app'
  return isStandalone() ? 'background' : 'install-first'
}

export async function enableBackgroundNews(): Promise<'enabled' | 'denied' | 'unavailable'> {
  if (notifySupport() !== 'background') return 'unavailable'
  if ((await Notification.requestPermission()) !== 'granted') return 'denied'
  const status = await navigator.permissions
    .query({ name: 'periodic-background-sync' as PermissionName })
    .catch(() => null)
  if (status && status.state !== 'granted') return 'unavailable'
  const registration = (await navigator.serviceWorker.ready) as RegistrationWithPeriodicSync
  await registration.periodicSync!.register(NEWS_SYNC_TAG, { minInterval: CHECK_EVERY_MS })
  await kvSet('notify', true)
  return 'enabled'
}

export async function disableBackgroundNews(): Promise<void> {
  await kvSet('notify', false)
  const registration = (await navigator.serviceWorker.ready) as RegistrationWithPeriodicSync
  await registration.periodicSync?.unregister(NEWS_SYNC_TAG).catch(() => {})
}

export function useBackgroundNews() {
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    void kvGet<boolean>('notify')
      .then((value) => setEnabled(Boolean(value) && 'Notification' in window && Notification.permission === 'granted'))
      .catch(() => setEnabled(false))
  }, [])
  return { support: notifySupport(), enabled, setEnabled }
}
