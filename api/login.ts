// POST /api/login  { username, password }  ->  NDJSON stream of LoginEvent
// The password is only used for the idUFSC login below: it is never stored or logged.

import type { Discipline, LoginEvent, LoginNotice, Student } from '../shared/types.js'
import { fetchCagrGrade } from '../server/cagr.js'
import { AppError } from '../server/http.js'
import { loginMoodle, syncMoodle } from '../server/moodle.js'
import { forbidden, isCrossSite } from '../server/origin.js'

export async function POST(request: Request): Promise<Response> {
  if (isCrossSite(request)) return forbidden()
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null
  const username = typeof body?.username === 'string' ? body.username.trim() : ''
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!username || !password || username.length > 120 || password.length > 200) {
    return Response.json({ code: 'bad_request', message: 'Informe usuário e senha.' }, { status: 400 })
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: LoginEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        send({ type: 'progress', step: 'auth' })
        const { client, auth, skippedCollecta } = await loginMoodle(username, password, () =>
          send({ type: 'progress', step: 'moodle' }),
        )
        const notices: LoginNotice[] = skippedCollecta ? ['collecta'] : []

        send({ type: 'progress', step: 'cagr' })
        let student: Student | null = null
        let disciplines: Discipline[] = []
        try {
          ;({ student, disciplines } = await fetchCagrGrade(client))
        } catch {
          // Without CAGR (e.g. graduate students) the app still works from Moodle data.
          notices.push('cagr_unavailable')
        }

        send({ type: 'progress', step: 'sync' })
        const sync = await syncMoodle(auth, student?.semester || null)
        send({
          type: 'result',
          data: { auth: { ...auth, session: sync.session ?? auth.session }, student, disciplines, sync, notices },
        })
      } catch (error) {
        if (error instanceof AppError) {
          send({ type: 'error', code: error.code, message: error.message })
        } else {
          console.error('login failed:', error instanceof Error ? error.message : error)
          send({ type: 'error', code: 'unknown', message: 'Algo deu errado ao entrar. Tente de novo.' })
        }
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
