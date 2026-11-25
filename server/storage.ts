// Neon Postgres and the keys derived from NOTES_SECRET. Both only exist in the Vercel environment
// (and in .env.local, for `npm run dev` and the local panel).

import { createHmac } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { deriveKey, KEY_PURPOSES, type KeyPurpose } from './crypto.js'
import { AppError } from './http.js'

const NOT_CONFIGURED = 'O armazenamento do app não está configurado.'
const keys = new Map<KeyPurpose, Buffer>()

export function secretKey(purpose: KeyPurpose): Buffer {
  let key = keys.get(purpose)
  if (!key) {
    const secret = process.env.NOTES_SECRET
    if (!secret) throw new AppError('unknown', NOT_CONFIGURED, 500)
    key = deriveKey(secret, purpose)
    keys.set(purpose, key)
  }
  return key
}

export function database() {
  const url = process.env.DATABASE_URL
  if (!url) throw new AppError('unknown', NOT_CONFIGURED, 500)
  return neon(url)
}

/** How every table refers to an account: an HMAC of the Moodle user id, never the id itself. */
export function accountKey(moodleUserId: number): string {
  return createHmac('sha256', secretKey(KEY_PURPOSES.account)).update(`moodle:${moodleUserId}`).digest('hex')
}
