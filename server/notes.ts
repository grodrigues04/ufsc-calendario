// Manual absence notes in Neon Postgres.
// - The row key is an HMAC of the Moodle user id: the table alone does not reveal whose data it is.
// - The notes are encrypted with AES-256-GCM, bound to the row key (AAD).
// - Both keys derive (HKDF) from NOTES_SECRET, which only exists in the Vercel environment.

import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { mergeNotes, sameNotes, sanitizeNotes, type ManualNotes } from '../shared/notes.js'
import { AppError } from './http.js'

const PAYLOAD_VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16
const MAX_WRITE_ATTEMPTS = 3

interface Keys {
  userKey: Buffer
  encryptionKey: Buffer
}

let cachedKeys: Keys | null = null

function keys(): Keys {
  if (cachedKeys) return cachedKeys
  const secret = process.env.NOTES_SECRET
  if (!secret) throw new AppError('unknown', 'O armazenamento das anotações não está configurado.', 500)
  const master = Buffer.from(secret, 'base64')
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', master, Buffer.alloc(0), info, 32))
  cachedKeys = { userKey: derive('chamada:user-key'), encryptionKey: derive('chamada:notes-encryption') }
  return cachedKeys
}

function database() {
  const url = process.env.DATABASE_URL
  if (!url) throw new AppError('unknown', 'O armazenamento das anotações não está configurado.', 500)
  return neon(url)
}

export function rowKeyFor(moodleUserId: number): string {
  return createHmac('sha256', keys().userKey).update(`moodle:${moodleUserId}`).digest('hex')
}

function encrypt(notes: ManualNotes, rowKey: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', keys().encryptionKey, iv)
  cipher.setAAD(Buffer.from(rowKey))
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(notes), 'utf8'), cipher.final()])
  return `${PAYLOAD_VERSION}:${Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64')}`
}

function decrypt(payload: string, rowKey: string): ManualNotes {
  const raw = Buffer.from(payload.slice(PAYLOAD_VERSION.length + 1), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', keys().encryptionKey, raw.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(rowKey))
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
  const plaintext = Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()])
  return sanitizeNotes(JSON.parse(plaintext.toString('utf8'))) ?? {}
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
