// Manual absences ("Manual" tab), shared by the app and the /api/notes function.

export interface ManualEntry {
  /** Absences in classes (aulas). */
  absences: number
  /** ISO 8601. The newest write wins, per discipline. */
  updatedAt: string
}

/** semester ("20262") -> discipline id ("INE5614") -> entry */
export type ManualNotes = Record<string, Record<string, ManualEntry>>

export interface NotesRequest {
  token: string
  /** Local notes to merge into the saved ones; omitted to only read them. */
  notes?: ManualNotes
}

export interface NotesResponse {
  notes: ManualNotes
}

export const MAX_ABSENCES = 400
const MAX_SEMESTERS = 30
const MAX_DISCIPLINES = 30
const SEMESTER_PATTERN = /^\d{5}$/
const DISCIPLINE_PATTERN = /^[A-Za-z0-9-]{1,32}$/

/** Keeps only well-formed entries; returns null when the value is not an object at all. */
export function sanitizeNotes(value: unknown): ManualNotes | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const notes: ManualNotes = {}
  for (const [semester, disciplines] of Object.entries(value).slice(0, MAX_SEMESTERS)) {
    if (!SEMESTER_PATTERN.test(semester) || disciplines === null || typeof disciplines !== 'object') continue
    for (const [discipline, entry] of Object.entries(disciplines as Record<string, unknown>).slice(0, MAX_DISCIPLINES)) {
      if (!DISCIPLINE_PATTERN.test(discipline) || entry === null || typeof entry !== 'object') continue
      const { absences, updatedAt } = entry as Partial<ManualEntry>
      if (!Number.isInteger(absences) || absences! < 0 || absences! > MAX_ABSENCES) continue
      if (typeof updatedAt !== 'string' || Number.isNaN(Date.parse(updatedAt))) continue
      notes[semester] = { ...notes[semester], [discipline]: { absences: absences!, updatedAt } }
    }
  }
  return notes
}

/**
 * A phone with its clock ahead would win every merge forever: the server never accepts update
 * times later than its own clock.
 */
export function clampToNow(notes: ManualNotes, now: Date): ManualNotes {
  const limit = now.getTime()
  const clamped: ManualNotes = {}
  for (const [semester, disciplines] of Object.entries(notes)) {
    for (const [discipline, entry] of Object.entries(disciplines)) {
      const updatedAt = Date.parse(entry.updatedAt) > limit ? now.toISOString() : entry.updatedAt
      clamped[semester] = { ...clamped[semester], [discipline]: { ...entry, updatedAt } }
    }
  }
  return clamped
}

/** Per discipline, the most recently updated entry wins. */
export function mergeNotes(base: ManualNotes, incoming: ManualNotes): ManualNotes {
  const merged: ManualNotes = structuredClone(base)
  for (const [semester, disciplines] of Object.entries(incoming)) {
    for (const [discipline, entry] of Object.entries(disciplines)) {
      const current = merged[semester]?.[discipline]
      if (!current || Date.parse(entry.updatedAt) > Date.parse(current.updatedAt)) {
        merged[semester] = { ...merged[semester], [discipline]: entry }
      }
    }
  }
  return merged
}

export function sameNotes(a: ManualNotes, b: ManualNotes): boolean {
  const flatten = (notes: ManualNotes) =>
    Object.entries(notes)
      .flatMap(([semester, disciplines]) =>
        Object.entries(disciplines).map(([discipline, entry]) => `${semester}/${discipline}=${entry.absences}@${entry.updatedAt}`),
      )
      .sort()
      .join('|')
  return flatten(a) === flatten(b)
}
