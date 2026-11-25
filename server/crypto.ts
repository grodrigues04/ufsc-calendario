// Encryption shared by the functions (manual absences, bug reports) and the local panel (panel/).
// Every key derives (HKDF) from NOTES_SECRET, one per purpose. Payloads are AES-256-GCM, bound to a
// context (AAD): a payload only opens where it was written (its row).
// No relative imports here: the panel runs this file directly with Node.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'

export const KEY_PURPOSES = {
  /** HMAC of the Moodle user id: how every table refers to an account. */
  account: 'chamada:user-key',
  notes: 'chamada:notes-encryption',
  bugReports: 'chamada:bug-reports',
} as const

export type KeyPurpose = (typeof KEY_PURPOSES)[keyof typeof KEY_PURPOSES]

const PAYLOAD_VERSION = 'v1'
const IV_BYTES = 12
const TAG_BYTES = 16

/** `secret` is NOTES_SECRET (32 bytes in base64). */
export function deriveKey(secret: string, purpose: KeyPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', Buffer.from(secret, 'base64'), Buffer.alloc(0), purpose, 32))
}

export function seal(key: Buffer, text: string, context: string): string {
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(Buffer.from(context))
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()])
  return `${PAYLOAD_VERSION}:${Buffer.concat([iv, ciphertext, cipher.getAuthTag()]).toString('base64')}`
}

/** Throws when the payload was changed, belongs to another context or was sealed with another key. */
export function unseal(key: Buffer, payload: string, context: string): string {
  const raw = Buffer.from(payload.slice(PAYLOAD_VERSION.length + 1), 'base64')
  const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, IV_BYTES))
  decipher.setAAD(Buffer.from(context))
  decipher.setAuthTag(raw.subarray(raw.length - TAG_BYTES))
  return Buffer.concat([decipher.update(raw.subarray(IV_BYTES, raw.length - TAG_BYTES)), decipher.final()]).toString('utf8')
}
