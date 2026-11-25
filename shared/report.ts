// Bug reports ("Relatar um bug" in the profile), sent by the app and read in the local panel.
// They are anonymous: the text plus what helps to reproduce the bug, nothing about the student.

export const MIN_REPORT_LENGTH = 10
export const MAX_REPORT_LENGTH = 2000

export type ReportDevice = 'ios' | 'android' | 'outro'

export interface ReportContext {
  device: ReportDevice
  /** Opened from the home screen (installed app) instead of the browser. */
  installed: boolean
  /** Build of the app (commit). */
  version: string
  /** Screen under the profile when the report was written ("/presenca/manual"). */
  screen: string
}

export interface BugReport {
  description: string
  context: ReportContext
}

export interface ReportRequest {
  /** Only proves the report comes from a student signed in to the app; it is never stored. */
  token: string
  report: BugReport
}

const DEVICES: ReportDevice[] = ['ios', 'android', 'outro']

/** Keeps only a well-formed report: the server never trusts what it receives. */
export function readBugReport(value: unknown): BugReport | null {
  if (value === null || typeof value !== 'object') return null
  const { description, context } = value as { description?: unknown; context?: unknown }
  if (typeof description !== 'string' || context === null || typeof context !== 'object') return null
  const text = description.trim()
  if (text.length < MIN_REPORT_LENGTH || text.length > MAX_REPORT_LENGTH) return null
  const { device, installed, version, screen } = context as Partial<Record<keyof ReportContext, unknown>>
  if (!DEVICES.includes(device as ReportDevice) || typeof installed !== 'boolean') return null
  if (typeof version !== 'string' || !/^[\w.-]{1,40}$/.test(version)) return null
  if (typeof screen !== 'string' || !/^\/[\w/-]{0,80}$/.test(screen)) return null
  return { description: text, context: { device: device as ReportDevice, installed, version, screen } }
}
