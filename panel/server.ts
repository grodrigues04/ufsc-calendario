// Local panel: how many people use the app, and the bug reports they sent.
// Only for this computer: `npm run painel` (reads DATABASE_URL and NOTES_SECRET from .env.local).
// It listens on 127.0.0.1 only, answers only to its own address (no DNS rebinding) and accepts
// actions only from its own page (other websites cannot post to it).

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { neon } from '@neondatabase/serverless'
import { readBugReport } from '../shared/report.ts'
import { deriveKey, KEY_PURPOSES, unseal } from '../server/crypto.ts'
import { type Account, type PanelData, type Report, renderError, renderPage } from './page.ts'

const PORT = Number(process.env.PANEL_PORT ?? 4545)
const HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`])
const ORIGINS = new Set([...HOSTS].map((host) => `http://${host}`))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
}

const { DATABASE_URL, NOTES_SECRET } = process.env
if (!DATABASE_URL || !NOTES_SECRET) {
  console.error('Faltam DATABASE_URL e NOTES_SECRET. Rode com: npm run painel (eles vêm do .env.local).')
  process.exit(1)
}
const sql = neon(DATABASE_URL)
const reportKey = deriveKey(NOTES_SECRET, KEY_PURPOSES.bugReports)

const toDate = (value: unknown): Date | null => (value === null || value === undefined ? null : new Date(value as string))

async function loadData(): Promise<PanelData> {
  const [accounts, daily, reports, size] = await Promise.all([
    sql`select coalesce(u.user_key, n.user_key) as key, u.first_seen_at, u.last_seen_at, u.active_days, n.updated_at as notes_updated_at
        from app_usage u full join manual_notes n on n.user_key = u.user_key`,
    sql`select to_char(day, 'YYYY-MM-DD') as day, users from daily_usage
        where day > (now() at time zone 'America/Sao_Paulo')::date - 40`,
    sql`select id, created_at, resolved_at, payload from bug_reports order by created_at desc limit 300`,
    sql`select pg_database_size(current_database())::text as bytes`,
  ])
  return {
    accounts: accounts.map(
      (row): Account => ({
        key: String(row.key),
        firstSeen: toDate(row.first_seen_at),
        lastSeen: toDate(row.last_seen_at),
        activeDays: row.active_days === null ? null : Number(row.active_days),
        notesUpdated: toDate(row.notes_updated_at),
      }),
    ),
    daily: new Map(daily.map((row) => [String(row.day), Number(row.users)])),
    reports: reports.map((row): Report => {
      const id = String(row.id)
      let report = null
      try {
        report = readBugReport(JSON.parse(unseal(reportKey, String(row.payload), id)))
      } catch {
        // Shown as unreadable: written with another NOTES_SECRET.
      }
      return { id, createdAt: toDate(row.created_at)!, resolvedAt: toDate(row.resolved_at), report }
    }),
    databaseBytes: Number(size[0]?.bytes ?? 0),
    now: new Date(),
  }
}

function send(response: ServerResponse, status: number, body: string, headers: Record<string, string> = {}): void {
  response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...HEADERS, ...headers })
  response.end(body)
}

async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
  // A page on another site could reach 127.0.0.1 through a domain that points here: refuse other hosts.
  if (!HOSTS.has(request.headers.host ?? '')) return send(response, 421, 'Endereço não permitido.')
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)

  if (request.method === 'GET' && url.pathname === '/') {
    try {
      return send(response, 200, renderPage(await loadData()))
    } catch (error) {
      return send(response, 500, renderError(error instanceof Error ? error.message : String(error)))
    }
  }

  const action = url.pathname.match(/^\/relatos\/([^/]+)\/(resolver|reabrir)$/)
  if (request.method === 'POST' && action) {
    // Forms of other websites can post to localhost too: only this page's own forms count.
    if (!ORIGINS.has(request.headers.origin ?? '')) return send(response, 403, 'Origem não permitida.')
    const [, id, verb] = action
    if (!UUID.test(id)) return send(response, 404, 'Relato não encontrado.')
    if (verb === 'resolver') await sql`update bug_reports set resolved_at = now() where id = ${id} and resolved_at is null`
    else await sql`update bug_reports set resolved_at = null where id = ${id}`
    response.writeHead(303, { ...HEADERS, Location: '/#relatos' })
    return void response.end()
  }

  send(response, 404, 'Página não encontrada.')
}

const server = createServer((request, response) => {
  handle(request, response).catch((error: unknown) => {
    send(response, 500, renderError(error instanceof Error ? error.message : String(error)))
  })
})
server.on('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE' ? `A porta ${PORT} já está em uso. Use outra: PANEL_PORT=4546 npm run painel` : error.message)
  process.exit(1)
})
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Painel do Chamada em http://127.0.0.1:${PORT} (só neste computador). Ctrl+C para parar.`)
})
