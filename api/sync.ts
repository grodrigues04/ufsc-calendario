// POST /api/sync  { auth, semester }  ->  SyncResult
// Refreshes attendance and activities with the Moodle app token (no password needed).

import type { MoodleAuth, SyncRequest } from '../shared/types.js'
import { AppError } from '../server/http.js'
import { syncMoodle } from '../server/moodle.js'
import { forbidden, isCrossSite } from '../server/origin.js'
import { limitRequest } from '../server/rate-limit.js'

const MAX_KNOWN_COURSES = 20

function readAttendanceCmids(value: unknown): Record<number, number[]> {
  if (value === null || typeof value !== 'object') return {}
  const entries = Object.entries(value as Record<string, unknown>)
    .slice(0, MAX_KNOWN_COURSES)
    .filter(
      (entry): entry is [string, number[]] =>
        /^\d+$/.test(entry[0]) &&
        Array.isArray(entry[1]) &&
        entry[1].length <= 5 &&
        entry[1].every((cmid) => Number.isInteger(cmid) && cmid > 0),
    )
  return Object.fromEntries(entries.map(([courseId, cmids]) => [Number(courseId), cmids]))
}

function readRequest(body: unknown): SyncRequest | null {
  if (body === null || typeof body !== 'object') return null
  const { auth, semester, attendanceCmids } = body as {
    auth?: Partial<MoodleAuth>
    semester?: unknown
    attendanceCmids?: unknown
  }
  if (!auth || typeof auth.token !== 'string' || !/^[a-f0-9]{32}$/.test(auth.token)) return null
  if (typeof auth.userId !== 'number' || !Number.isInteger(auth.userId)) return null
  const privateToken = typeof auth.privateToken === 'string' && auth.privateToken.length < 200 ? auth.privateToken : null
  const session = typeof auth.session === 'string' && /^MoodleSession\w*=[\w-]+$/.test(auth.session) ? auth.session : null
  return {
    auth: { token: auth.token, privateToken, userId: auth.userId, session },
    semester: typeof semester === 'string' && /^\d{5}$/.test(semester) ? semester : null,
    attendanceCmids: readAttendanceCmids(attendanceCmids),
  }
}

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return forbidden()
  const limited = await limitRequest(request, 'sync')
  if (limited) return limited
  const input = readRequest(await request.json().catch(() => null))
  if (!input) return Response.json({ code: 'bad_request', message: 'Requisição inválida.' }, { status: 400 })
  try {
    const result = await syncMoodle(input.auth, input.semester, input.attendanceCmids)
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status })
    }
    console.error('sync failed:', error instanceof Error ? error.message : error)
    return Response.json({ code: 'unknown', message: 'Não consegui atualizar agora.' }, { status: 500 })
  }
}
