// POST /api/notes  { token, notes? }  ->  { notes }
// Reads (and, with `notes`, merges and saves) the student's manual absences. The Moodle token
// proves who the student is; only an HMAC of the Moodle user id and encrypted notes are stored.

import { clampToNow, sanitizeNotes, type NotesResponse } from '../shared/notes.js'
import { AppError } from '../server/http.js'
import { getMoodleUserId } from '../server/moodle.js'
import { readNotes, rowKeyFor, saveNotes } from '../server/notes.js'
import { forbidden, isCrossSite } from '../server/origin.js'

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return forbidden()
  const body = (await request.json().catch(() => null)) as { token?: unknown; notes?: unknown } | null
  const token = typeof body?.token === 'string' && /^[a-f0-9]{32}$/.test(body.token) ? body.token : null
  const incoming = body?.notes === undefined ? null : sanitizeNotes(body.notes)
  if (!token || (body?.notes !== undefined && !incoming)) {
    return Response.json({ code: 'bad_request', message: 'Requisição inválida.' }, { status: 400 })
  }

  try {
    const rowKey = rowKeyFor(await getMoodleUserId(token))
    const notes = incoming ? await saveNotes(rowKey, clampToNow(incoming, new Date())) : await readNotes(rowKey)
    return Response.json({ notes } satisfies NotesResponse, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status })
    }
    console.error('notes failed:', error instanceof Error ? error.message : error)
    return Response.json({ code: 'unknown', message: 'Não consegui acessar suas anotações agora.' }, { status: 500 })
  }
}
