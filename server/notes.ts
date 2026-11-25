// Manual absence notes in Neon Postgres.
// - The row key is the account key (an HMAC of the Moodle user id): the table alone does not
//   reveal whose data it is.
// - The notes are encrypted with AES-256-GCM, bound to the row key (AAD).
// - They only last for their semester: a semester's notes are deleted when the next one starts
//   (shared/semester.ts). Reads and saves drop them as soon as that happens, and
//   api/jobs/delete-past-semesters.ts deletes the rows of everyone who did not come back.

import { dropSemestersBefore, mergeNotes, newestSemester, sameNotes, sanitizeNotes, type ManualNotes } from '../shared/notes.js'
import { semesterOf } from '../shared/semester.js'
import { KEY_PURPOSES, seal, unseal } from './crypto.js'
import { AppError } from './http.js'
import { database, secretKey } from './storage.js'

const MAX_WRITE_ATTEMPTS = 3

interface Row {
  notes: ManualNotes
  version: number
}

function encrypt(notes: ManualNotes, rowKey: string): string {
  return seal(secretKey(KEY_PURPOSES.notes), JSON.stringify(notes), rowKey)
}

function decrypt(payload: string, rowKey: string): ManualNotes {
  return sanitizeNotes(JSON.parse(unseal(secretKey(KEY_PURPOSES.notes), payload, rowKey))) ?? {}
}

async function readRow(rowKey: string): Promise<Row | null> {
  const rows = (await database()`select payload, version from manual_notes where user_key = ${rowKey}`) as Array<{
    payload: string
    version: number
  }>
  if (!rows[0]) return null
  return { notes: decrypt(rows[0].payload, rowKey), version: rows[0].version }
}

/**
 * Replaces `row` (null: there is none yet) with `notes`, unless another device wrote in between.
 * With nothing left to keep, the row is deleted. `semester` (the newest one in the notes, in the
 * clear) is what lets the scheduled job delete rows without decrypting them.
 */
async function writeRow(rowKey: string, row: Row | null, notes: ManualNotes): Promise<boolean> {
  const sql = database()
  const semester = newestSemester(notes)
  if (!semester) {
    if (!row) return true
    const deleted = await sql`delete from manual_notes where user_key = ${rowKey} and version = ${row.version} returning version`
    return deleted.length > 0
  }
  const payload = encrypt(notes, rowKey)
  const written = row
    ? await sql`update manual_notes set payload = ${payload}, semester = ${semester}, version = version + 1, updated_at = now()
                where user_key = ${rowKey} and version = ${row.version} returning version`
    : await sql`insert into manual_notes (user_key, payload, semester) values (${rowKey}, ${payload}, ${semester})
                on conflict (user_key) do nothing returning version`
  return written.length > 0
}

export async function readNotes(rowKey: string, now: Date): Promise<ManualNotes> {
  const row = await readRow(rowKey)
  if (!row) return {}
  const notes = dropSemestersBefore(row.notes, semesterOf(now))
  // A semester that ended since the last visit leaves the database now. If another device writes
  // at the same moment, its save drops it instead.
  if (!sameNotes(notes, row.notes)) await writeRow(rowKey, row, notes)
  return notes
}

/** Merges and saves with optimistic locking (two devices saving at once both keep their changes). */
export async function saveNotes(rowKey: string, incoming: ManualNotes, now: Date): Promise<ManualNotes> {
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const row = await readRow(rowKey)
    const merged = dropSemestersBefore(mergeNotes(row?.notes ?? {}, incoming), semesterOf(now))
    if (sameNotes(row?.notes ?? {}, merged)) return merged
    if (await writeRow(rowKey, row, merged)) return merged
  }
  throw new AppError('unknown', 'Não consegui salvar agora. Tente de novo.', 409)
}

/** Deletes every account whose notes all belong to semesters that already ended. Returns how many. */
export async function deletePastSemesters(now: Date): Promise<number> {
  const [{ deleted }] = (await database()`with gone as (delete from manual_notes where semester < ${semesterOf(now)} returning 1)
                                          select count(*)::int as deleted from gone`) as Array<{ deleted: number }>
  return deleted
}
