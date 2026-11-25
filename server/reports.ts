// Bug reports from the app, encrypted like the manual absences and bound to their own id.
// Anonymous: no account key, no Moodle id, no IP. Only the text, the context the app shows before
// sending, and when it arrived.

import { randomUUID } from 'node:crypto'
import type { BugReport } from '../shared/report.js'
import { KEY_PURPOSES, seal } from './crypto.js'
import { database, secretKey } from './storage.js'

// Bounds what anyone could store: once a day is full, new reports wait for the next one.
const MAX_REPORTS_PER_DAY = 100

/** False when the daily limit was reached. */
export async function saveBugReport(report: BugReport): Promise<boolean> {
  const sql = database()
  const [{ today }] = (await sql`select count(*)::int as today from bug_reports where created_at > now() - interval '1 day'`) as Array<{
    today: number
  }>
  if (today >= MAX_REPORTS_PER_DAY) return false
  const id = randomUUID()
  const payload = seal(secretKey(KEY_PURPOSES.bugReports), JSON.stringify(report), id)
  await sql`insert into bug_reports (id, payload) values (${id}, ${payload})`
  return true
}
