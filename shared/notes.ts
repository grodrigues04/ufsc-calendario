// Manual absences ("Manual" tab), shared by the app and the /api/notes function.
// Each absence is one missed class day, with an optional date and an optional note.

export interface AbsenceRecord {
  /** Class day missed (YYYY-MM-DD); null for counts saved by the first version of the tab. */
  date: string | null
  /** Optional reminder of why ("consulta médica"). */
  note: string
  /** ISO 8601. The newest version of each record wins when devices sync. */
  updatedAt: string
  /** Deletions are kept so other devices learn about them. */
  deleted?: true
}

/** semester ("20262") -> discipline id ("INE5614") -> record id -> record */
export type ManualNotes = Record<string, Record<string, Record<string, AbsenceRecord>>>

export interface NotesRequest {
  token: string
  /** Local notes to merge into the saved ones; omitted to only read them. */
  notes?: ManualNotes
}

export interface NotesResponse {
  notes: ManualNotes
}

export const MAX_NOTE_LENGTH = 280
const MAX_SEMESTERS = 30
const MAX_DISCIPLINES = 30
const MAX_RECORDS = 300
const SEMESTER_PATTERN = /^\d{5}$/
const DISCIPLINE_PATTERN = /^[A-Za-z0-9-]{1,32}$/
const RECORD_PATTERN = /^[A-Za-z0-9-]{1,64}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

/** The first version stored only a count ({ absences, updatedAt }): it becomes undated records. */
function upgradeLegacyCount(discipline: string, entry: { absences?: unknown; updatedAt?: unknown }): Record<string, AbsenceRecord> {
  const count = Number(entry.absences)
  if (!Number.isInteger(count) || count <= 0 || !isTimestamp(entry.updatedAt)) return {}
  const records: Record<string, AbsenceRecord> = {}
  for (let index = 0; index < Math.min(count, MAX_RECORDS); index++) {
    // Same ids on every device, so the upgrade never duplicates records.
    records[`antiga-${discipline}-${index + 1}`] = { date: null, note: '', updatedAt: entry.updatedAt }
  }
  return records
}

function sanitizeRecord(value: unknown): AbsenceRecord | null {
  if (value === null || typeof value !== 'object') return null
  const { date, note, updatedAt, deleted } = value as Partial<AbsenceRecord>
  if (!isTimestamp(updatedAt)) return null
  if (date !== null && (typeof date !== 'string' || !DATE_PATTERN.test(date))) return null
  return {
    date: date ?? null,
    note: typeof note === 'string' ? note.slice(0, MAX_NOTE_LENGTH) : '',
    updatedAt,
    ...(deleted === true ? { deleted: true as const } : {}),
  }
}

/** Keeps only well-formed data; returns null when the value is not an object at all. */
export function sanitizeNotes(value: unknown): ManualNotes | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const notes: ManualNotes = {}
  for (const [semester, disciplines] of Object.entries(value).slice(0, MAX_SEMESTERS)) {
    if (!SEMESTER_PATTERN.test(semester) || disciplines === null || typeof disciplines !== 'object') continue
    for (const [discipline, entry] of Object.entries(disciplines as Record<string, unknown>).slice(0, MAX_DISCIPLINES)) {
      if (!DISCIPLINE_PATTERN.test(discipline) || entry === null || typeof entry !== 'object') continue
      let records: Record<string, AbsenceRecord> = {}
      if ('absences' in entry) {
        records = upgradeLegacyCount(discipline, entry as { absences?: unknown; updatedAt?: unknown })
      } else {
        for (const [id, raw] of Object.entries(entry).slice(0, MAX_RECORDS)) {
          const record = RECORD_PATTERN.test(id) ? sanitizeRecord(raw) : null
          if (record) records[id] = record
        }
      }
      if (Object.keys(records).length) notes[semester] = { ...notes[semester], [discipline]: records }
    }
  }
  return notes
}

function eachRecord(notes: ManualNotes, visit: (semester: string, discipline: string, id: string, record: AbsenceRecord) => void) {
  for (const [semester, disciplines] of Object.entries(notes)) {
    for (const [discipline, records] of Object.entries(disciplines)) {
      for (const [id, record] of Object.entries(records)) visit(semester, discipline, id, record)
    }
  }
}

export function setRecord(notes: ManualNotes, semester: string, discipline: string, id: string, record: AbsenceRecord): ManualNotes {
  return {
    ...notes,
    [semester]: { ...notes[semester], [discipline]: { ...notes[semester]?.[discipline], [id]: record } },
  }
}

/** Per record, the most recently updated version wins (deletions included). */
export function mergeNotes(base: ManualNotes, incoming: ManualNotes): ManualNotes {
  let merged = base
  eachRecord(incoming, (semester, discipline, id, record) => {
    const current = base[semester]?.[discipline]?.[id]
    if (!current || Date.parse(record.updatedAt) > Date.parse(current.updatedAt)) {
      merged = setRecord(merged, semester, discipline, id, record)
    }
  })
  return merged
}

function recordKey(record: AbsenceRecord): string {
  return `${record.updatedAt}|${record.date}|${record.deleted ? 1 : 0}|${record.note}`
}

export function sameNotes(a: ManualNotes, b: ManualNotes): boolean {
  const flatten = (notes: ManualNotes) => {
    const keys: string[] = []
    eachRecord(notes, (semester, discipline, id, record) => keys.push(`${semester}/${discipline}/${id}=${recordKey(record)}`))
    return keys.sort().join('\n')
  }
  return flatten(a) === flatten(b)
}

/** Records of `current` that differ from the `sent` snapshot. */
export function changedSince(current: ManualNotes, sent: ManualNotes): ManualNotes {
  let changed: ManualNotes = {}
  eachRecord(current, (semester, discipline, id, record) => {
    const before = sent[semester]?.[discipline]?.[id]
    if (!before || recordKey(before) !== recordKey(record)) changed = setRecord(changed, semester, discipline, id, record)
  })
  return changed
}

/**
 * A phone with its clock ahead would win every merge forever: the server never accepts update
 * times later than its own clock.
 */
export function clampToNow(notes: ManualNotes, now: Date): ManualNotes {
  let clamped: ManualNotes = {}
  eachRecord(notes, (semester, discipline, id, record) => {
    const updatedAt = Date.parse(record.updatedAt) > now.getTime() ? now.toISOString() : record.updatedAt
    clamped = setRecord(clamped, semester, discipline, id, { ...record, updatedAt })
  })
  return clamped
}

/**
 * Manual absences only count in their own semester: once the next one starts they are deleted.
 * Keeps `semester` and the ones after it.
 */
export function dropSemestersBefore(notes: ManualNotes, semester: string): ManualNotes {
  return Object.fromEntries(Object.entries(notes).filter(([key]) => key >= semester))
}

/** The latest semester with notes, or null when there are none. */
export function newestSemester(notes: ManualNotes): string | null {
  return Object.keys(notes).sort().at(-1) ?? null
}

/** Absences still in effect for a discipline, newest class day first (undated ones last). */
export function activeRecords(notes: ManualNotes, semester: string, discipline: string): Array<AbsenceRecord & { id: string }> {
  return Object.entries(notes[semester]?.[discipline] ?? {})
    .filter(([, record]) => !record.deleted)
    .map(([id, record]) => ({ id, ...record }))
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || b.updatedAt.localeCompare(a.updatedAt))
}
