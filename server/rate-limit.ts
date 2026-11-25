// Requests per IP on each API route. Past the limit, that IP is locked out of the route for 15
// minutes (login and bug reports are strict; sync and notes are only meant to stop abuse, since
// a whole classroom on the UFSC Wi-Fi shares one IP and the app calls them by itself).
//
// Counts live in this instance's memory (exact for the requests it serves at the same time) and
// in Vercel's Runtime Cache (shared by every instance of the region). Never in the database: a
// locked-out client must not keep it awake. The IP itself is not stored, only an HMAC of it.

import { createHmac } from 'node:crypto'
import { getCache, ipAddress } from '@vercel/functions'
import { KEY_PURPOSES } from './crypto.js'
import { secretKey } from './storage.js'

export type LimitedRoute = 'login' | 'report' | 'sync' | 'notes'

const LIMITS: Record<LimitedRoute, number> = { login: 5, report: 5, sync: 60, notes: 60 }
const WINDOW_MS = 60_000
const LOCK_MS = 15 * 60_000
const MAX_TRACKED = 5000

interface Entry {
  /** When each recent request arrived (with a random fraction, so simultaneous ones stay apart). */
  times: number[]
  lockedUntil: number
}

const memory = new Map<string, Entry>()
// On a Hobby team the Runtime Cache is shared by every project: the namespace keeps these apart.
const shared = getCache({ namespace: 'chamada-limite' })

function clientKey(request: Request, route: LimitedRoute): string {
  const ip = ipAddress(request) ?? 'desconhecido'
  return `${route}:${createHmac('sha256', secretKey(KEY_PURPOSES.rateLimit)).update(ip).digest('hex')}`
}

function recent(times: number[], now: number): number[] {
  return [...new Set(times)].filter((time) => time > now - WINDOW_MS).sort((a, b) => a - b)
}

async function readShared(key: string): Promise<Entry | null> {
  try {
    const value = (await shared.get(key)) as Partial<Entry> | null
    return value && Array.isArray(value.times) ? { times: value.times, lockedUntil: Number(value.lockedUntil) || 0 } : null
  } catch {
    return null
  }
}

async function writeShared(key: string, entry: Entry, now: number): Promise<void> {
  const ttl = Math.ceil((Math.max(entry.lockedUntil - now, WINDOW_MS) + 1000) / 1000)
  await shared.set(key, entry, { ttl, name: 'limite-por-ip' }).catch(() => undefined)
}

function lockedOut(until: number, now: number): Response {
  const minutes = Math.max(1, Math.ceil((until - now) / 60_000))
  return Response.json(
    { code: 'rate_limited', message: `Muitas tentativas seguidas. Tente de novo em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.` },
    { status: 429, headers: { 'Retry-After': String(Math.ceil((until - now) / 1000)), 'Cache-Control': 'no-store' } },
  )
}

/** Null when the request may go on; otherwise the 429 to answer with. */
export async function limitRequest(request: Request, route: LimitedRoute): Promise<Response | null> {
  const now = Date.now()
  let key: string
  try {
    key = clientKey(request, route)
  } catch {
    // Without NOTES_SECRET there is no way to key the IP: the app keeps working without limits.
    return null
  }

  // Memory first, without awaiting anything: requests this instance serves at the same time see each other.
  const local = memory.get(key) ?? { times: [], lockedUntil: 0 }
  if (local.lockedUntil > now) return lockedOut(local.lockedUntil, now)
  local.times = recent([...local.times, now + Math.random()], now)
  memory.set(key, local)
  if (memory.size > MAX_TRACKED) memory.delete(memory.keys().next().value!)
  if (local.times.length > LIMITS[route]) {
    local.lockedUntil = now + LOCK_MS
    await writeShared(key, local, now)
    return lockedOut(local.lockedUntil, now)
  }

  // Then what the other instances counted.
  const other = await readShared(key)
  if (other && other.lockedUntil > now) {
    local.lockedUntil = other.lockedUntil
    return lockedOut(other.lockedUntil, now)
  }
  local.times = recent([...local.times, ...(other?.times ?? [])], now)
  if (local.times.length > LIMITS[route]) local.lockedUntil = now + LOCK_MS
  await writeShared(key, local, now)
  return local.lockedUntil > now ? lockedOut(local.lockedUntil, now) : null
}
