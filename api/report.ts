// POST /api/report  { token, report }  ->  { ok: true }
// Saves an anonymous bug report. The Moodle token only proves that a student signed in to the app
// sent it (scripts cannot fill the table); it is never stored, and nothing links the report to
// the student.

import { readBugReport, type ReportRequest } from '../shared/report.js'
import { AppError } from '../server/http.js'
import { getMoodleUserId } from '../server/moodle.js'
import { forbidden, isCrossSite } from '../server/origin.js'
import { limitRequest } from '../server/rate-limit.js'
import { saveBugReport } from '../server/reports.js'

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return forbidden()
  const limited = await limitRequest(request, 'report')
  if (limited) return limited
  const body = (await request.json().catch(() => null)) as Partial<Record<keyof ReportRequest, unknown>> | null
  const token = typeof body?.token === 'string' && /^[a-f0-9]{32}$/.test(body.token) ? body.token : null
  const report = readBugReport(body?.report)
  if (!token || !report) {
    return Response.json({ code: 'bad_request', message: 'Conte o que aconteceu em pelo menos uma frase.' }, { status: 400 })
  }

  try {
    await checkSignedIn(token)
    if (!(await saveBugReport(report))) {
      return Response.json({ code: 'unknown', message: 'Chegaram muitos relatos hoje. Tente de novo amanhã.' }, { status: 429 })
    }
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ code: error.code, message: error.message }, { status: error.status })
    }
    console.error('report failed:', error instanceof Error ? error.message : error)
    return Response.json({ code: 'unknown', message: 'Não consegui enviar agora. Tente de novo.' }, { status: 500 })
  }
}

/** Only a token Moodle rejects stops the report: bugs often come when Moodle itself is down. */
async function checkSignedIn(token: string): Promise<void> {
  try {
    await getMoodleUserId(token)
  } catch (error) {
    if (error instanceof AppError && error.code === 'invalid_token') throw error
  }
}
