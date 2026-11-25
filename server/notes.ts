// Manual absence notes in Neon Postgres.
// - The row key is the account key (an HMAC of the Moodle user id): the table alone does not
//   reveal whose data it is.
// - The notes are encrypted with AES-256-GCM, bound to the row key (AAD).

import { mergeNotes, sameNotes, sanitizeNotes, type ManualNotes } from '../shared/notes.js'
import { KEY_PURPOSES, seal, unseal } from './crypto.js'
import { AppError } from './http.js'
import { database, secretKey } from './storage.js'

const MAX_WRITE_ATTEMPTS = 3

function encrypt(notes: ManualNotes, rowKey: string): string {
  return seal(secretKey(KEY_PURPOSES.notes), JSON.stringify(notes), rowKey)
}

function decrypt(payload: string, rowKey: string): ManualNotes {
  return sanitizeNotes(JSON.parse(unseal(secretKey(KEY_PURPOSES.notes), payload, rowKey))) ?? {}
}

async function readRow(rowKey: string): Promise<{ notes: ManualNotes; version: number } | null> {
  const rows = (await database()`select payload, version from manual_notes where user_key = ${rowKey}`) as Array<{
    payload: string
    version: number
  }>
  if (!rows[0]) return null
  return { notes: decrypt(rows[0].payload, rowKey), version: rows[0].version }
}

export async function readNotes(rowKey: string): Promise<ManualNotes> {
  return (await readRow(rowKey))?.notes ?? {}
}

/** Merges and saves with optimistic locking (two devices saving at once both keep their changes). */
export async function saveNotes(rowKey: string, incoming: ManualNotes): Promise<ManualNotes> {
  const sql = database()
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const current = await readRow(rowKey)
    const merged = mergeNotes(current?.notes ?? {}, incoming)
    if (current && sameNotes(current.notes, merged)) return merged
    const payload = encrypt(merged, rowKey)
    const written = current
      ? await sql`update manual_notes set payload = ${payload}, version = version + 1, updated_at = now()
                  where user_key = ${rowKey} and version = ${current.version} returning version`
      : await sql`insert into manual_notes (user_key, payload) values (${rowKey}, ${payload})
                  on conflict (user_key) do nothing returning version`
    if (written.length > 0) return merged
  }
  throw new AppError('unknown', 'Não consegui salvar agora. Tente de novo.', 409)
}
