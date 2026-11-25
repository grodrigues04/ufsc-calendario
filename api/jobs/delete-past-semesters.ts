// Scheduled job (vercel.json "schedules"): deletes the manual absences of semesters that already
// ended, for the accounts that did not open the app since (the others lose them on their next
// visit, see server/notes.ts). Runs at 4:00 from the 1st to the 7th of March and August, the
// first days of each UFSC semester; the later days only retry a failed run.
// Private: the schedule/v1beta trigger leaves it without a public URL. Running it again is
// harmless: it only deletes what the calendar already says is over.

import { handleSchedule } from '@vercel/schedules'
import { deletePastSemesters } from '../../server/notes.js'

export const POST = handleSchedule(async (metadata) => {
  const deleted = await deletePastSemesters(new Date())
  console.log(`${metadata.name}: deleted the notes of ${deleted} account(s) from ended semesters`)
})
