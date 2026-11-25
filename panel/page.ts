// HTML of the local panel. No scripts: hover details are CSS, actions are plain forms.
// Every value that came from the database or from a student goes through escape().

import type { BugReport } from '../shared/report.ts'

export interface Account {
  /** Account key (HMAC of the Moodle id); only its first characters are shown. */
  key: string
  firstSeen: Date | null
  lastSeen: Date | null
  activeDays: number | null
  notesUpdated: Date | null
}

export interface Report {
  id: string
  createdAt: Date
  resolvedAt: Date | null
  /** Null when it could not be decrypted with this computer's NOTES_SECRET. */
  report: BugReport | null
}

export interface PanelData {
  accounts: Account[]
  /** Accounts that opened the app per day (YYYY-MM-DD, São Paulo). */
  daily: Map<string, number>
  reports: Report[]
  databaseBytes: number
  now: Date
}

// Neon Free plan: 1 GB of Postgres storage per project (more than that blocks writes).
const STORAGE_LIMIT_BYTES = 1024 ** 3
const CHART_DAYS = 30
const DAY_MS = 86_400_000
const TIME_ZONE = 'America/Sao_Paulo'

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE })
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' })
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })
const fullFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, dateStyle: 'full', timeStyle: 'short' })
const numberFormat = new Intl.NumberFormat('pt-BR')

export function escape(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** "2026-11-25" in São Paulo. */
function dayKey(date: Date): string {
  return dayKeyFormat.format(date)
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)
}

function relative(date: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const days = daysBetween(dayKey(date), dayKey(now))
  if (days === 0) return `hoje, ${timeFormat.format(date)}`
  if (days === 1) return `ontem, ${timeFormat.format(date)}`
  if (days < 30) return `há ${days} dias`
  return dateFormat.format(date)
}

function moment(date: Date | null, now: Date, empty: string): string {
  if (!date) return `<span class="muted">${escape(empty)}</span>`
  return `<time datetime="${date.toISOString()}" title="${escape(fullFormat.format(date))}">${escape(relative(date, now))}</time>`
}

function plural(count: number, one: string, many: string): string {
  return `${numberFormat.format(count)} ${count === 1 ? one : many}`
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} GB`
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
  return `${Math.round(bytes / 1024).toLocaleString('pt-BR')} KB`
}

/** Clean axis maximum whose half is a whole number of people: 2, 4, 6, 8, 10, 20, 30, 40... */
function niceMax(value: number): number {
  if (value <= 1) return 1
  if (value <= 10) return Math.ceil(value / 2) * 2
  const step = 10 ** Math.floor(Math.log10(value))
  return [1, 2, 3, 4, 5, 6, 8, 10].map((factor) => factor * step).find((candidate) => candidate >= value) ?? 10 * step
}

function summary(data: PanelData) {
  const today = dayKey(data.now)
  const within = (date: Date | null, days: number) => date !== null && data.now.getTime() - date.getTime() < days * DAY_MS
  return {
    total: data.accounts.length,
    today: data.accounts.filter((account) => account.lastSeen && dayKey(account.lastSeen) === today).length,
    week: data.accounts.filter((account) => within(account.lastSeen, 7)).length,
    month: data.accounts.filter((account) => within(account.lastSeen, 30)).length,
    newThisWeek: data.accounts.filter((account) => within(account.firstSeen, 7)).length,
    withNotes: data.accounts.filter((account) => account.notesUpdated).length,
  }
}

function tile(label: string, value: number, note: string): string {
  return `<div class="tile"><p class="tile-label">${escape(label)}</p><p class="tile-value">${numberFormat.format(value)}</p><p class="tile-note">${escape(note)}</p></div>`
}

function dailyChart(data: PanelData): string {
  const today = dayKey(data.now)
  const days = Array.from({ length: CHART_DAYS }, (_, index) => {
    const date = new Date(Date.parse(today) - (CHART_DAYS - 1 - index) * DAY_MS)
    const key = date.toISOString().slice(0, 10)
    return { key, date, users: data.daily.get(key) ?? 0 }
  })
  const max = niceMax(Math.max(...days.map((day) => day.users)))
  const ticks = max === 1 ? [0, 1] : [0, max / 2, max]
  const label = (date: Date) => `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  const weekday = (date: Date) => new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' }).format(date)
  const empty = days.every((day) => day.users === 0)

  const bars = days
    .map((day, index) => {
      const height = (day.users / max) * 100
      const text = `${weekday(day.date)}, ${label(day.date)}: ${plural(day.users, 'pessoa', 'pessoas')}`
      // Today and every 7 days before it: labels never crowd each other.
      const showLabel = (CHART_DAYS - 1 - index) % 7 === 0
      return `<div class="bar-slot" tabindex="0" aria-label="${escape(text)}">
        <div class="bar" style="height:${height.toFixed(2)}%"></div>
        <span class="tip"><strong>${plural(day.users, 'pessoa', 'pessoas')}</strong><span>${escape(`${weekday(day.date)}, ${label(day.date)}`)}</span></span>
        ${showLabel ? `<span class="x-label">${label(day.date)}</span>` : ''}
      </div>`
    })
    .join('')
  const grid = ticks
    .map((tick) => `<div class="gridline" style="bottom:${((tick / max) * 100).toFixed(2)}%"><span>${numberFormat.format(tick)}</span></div>`)
    .join('')
  const rows = days
    .slice()
    .reverse()
    .map((day) => `<tr><td>${escape(`${weekday(day.date)}, ${label(day.date)}`)}</td><td class="num">${numberFormat.format(day.users)}</td></tr>`)
    .join('')

  return `<figure class="card chart">
    <figcaption>
      <h2>Pessoas que abriram o app, por dia</h2>
      <p class="muted">Últimos ${CHART_DAYS} dias. Cada conta conta uma vez por dia.</p>
    </figcaption>
    <div class="plot">
      ${grid}
      <div class="bars">${bars}</div>
      ${empty ? '<p class="plot-empty">Ainda sem acessos registrados. Eles aparecem aqui conforme as pessoas abrirem o app.</p>' : ''}
    </div>
    <details class="table-view">
      <summary>Ver como tabela</summary>
      <table><thead><tr><th>Dia</th><th class="num">Pessoas</th></tr></thead><tbody>${rows}</tbody></table>
    </details>
  </figure>`
}

function accountsTable(data: PanelData): string {
  const sorted = data.accounts
    .slice()
    .sort((a, b) => (b.lastSeen ?? b.notesUpdated ?? new Date(0)).getTime() - (a.lastSeen ?? a.notesUpdated ?? new Date(0)).getTime())
  const shown = sorted.slice(0, 300)
  const rows = shown
    .map(
      (account) => `<tr>
        <td><code>${escape(account.key.slice(0, 8))}</code></td>
        <td>${moment(account.lastSeen, data.now, 'antes da contagem')}</td>
        <td>${moment(account.firstSeen, data.now, '—')}</td>
        <td class="num">${account.activeDays === null ? '<span class="muted">—</span>' : numberFormat.format(account.activeDays)}</td>
        <td>${account.notesUpdated ? `sim <span class="muted">· alteradas ${moment(account.notesUpdated, data.now, '')}</span>` : '<span class="muted">não</span>'}</td>
      </tr>`,
    )
    .join('')
  return `<section class="card">
    <h2>Contas</h2>
    <p class="muted">Cada linha é uma conta do Moodle, identificada só pelo começo de um código (HMAC do id). Nenhum nome ou matrícula é guardado.</p>
    ${
      shown.length
        ? `<div class="table-scroll"><table>
            <thead><tr><th>Conta</th><th>Último acesso</th><th>Primeiro acesso</th><th class="num">Dias de uso</th><th>Faltas anotadas</th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>
          ${sorted.length > shown.length ? `<p class="muted">E mais ${plural(sorted.length - shown.length, 'conta', 'contas')}.</p>` : ''}`
        : '<p class="empty">Nenhuma conta ainda.</p>'
    }
  </section>`
}

const DEVICES: Record<string, string> = { ios: 'iPhone', android: 'Android', outro: 'Outro aparelho' }

function reportCard(item: Report, now: Date): string {
  const action = item.resolvedAt ? 'reabrir' : 'resolver'
  const button = item.resolvedAt ? 'Reabrir' : 'Marcar como resolvido'
  const context = item.report?.context
  const chips = context
    ? [
        DEVICES[context.device] ?? context.device,
        context.installed ? 'app instalado' : 'no navegador',
        `versão ${context.version}`,
        `tela ${context.screen}`,
      ]
        .map((chip) => `<span class="chip">${escape(chip)}</span>`)
        .join('')
    : ''
  return `<article class="report${item.resolvedAt ? ' resolved' : ''}">
    <header>
      <span>${moment(item.createdAt, now, '')}</span>
      <form method="post" action="/relatos/${item.id}/${action}"><button type="submit">${button}</button></form>
    </header>
    ${
      item.report
        ? `<p class="report-text">${escape(item.report.description)}</p><div class="chips">${chips}</div>`
        : '<p class="report-text muted">Não consegui abrir este relato: a NOTES_SECRET deste computador não é a que o gravou.</p>'
    }
  </article>`
}

function reportsSection(data: PanelData): string {
  const open = data.reports.filter((item) => !item.resolvedAt)
  const resolved = data.reports.filter((item) => item.resolvedAt)
  return `<section class="card" id="relatos">
    <h2>Relatos de bug <span class="count">${numberFormat.format(open.length)} ${open.length === 1 ? 'aberto' : 'abertos'}</span></h2>
    <p class="muted">Anônimos: chegam só com o texto, o tipo de aparelho, a versão e a tela em que a pessoa estava.</p>
    ${open.length ? open.map((item) => reportCard(item, data.now)).join('') : '<p class="empty">Nenhum relato aberto.</p>'}
    ${
      resolved.length
        ? `<details class="resolved-list"><summary>Resolvidos (${numberFormat.format(resolved.length)})</summary>${resolved
            .map((item) => reportCard(item, data.now))
            .join('')}</details>`
        : ''
    }
  </section>`
}

function storageMeter(bytes: number): string {
  const share = Math.min(1, bytes / STORAGE_LIMIT_BYTES)
  return `<div class="storage" title="O plano grátis do Neon bloqueia gravações acima de 1 GB">
    <span>Banco de dados: <strong>${formatBytes(bytes)}</strong> de 1 GB</span>
    <span class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${(share * 100).toFixed(1)}" aria-label="Espaço usado no banco"><span style="width:${Math.max(share * 100, 0.6).toFixed(2)}%"></span></span>
  </div>`
}

export function renderPage(data: PanelData): string {
  const stats = summary(data)
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Painel do Chamada</title>
<style>${STYLE}</style>
</head>
<body>
<main>
  <header class="top">
    <div>
      <h1>Painel do Chamada</h1>
      <p class="muted">Só neste computador · atualizado ${escape(timeFormat.format(data.now))} · <a href="/">atualizar</a></p>
    </div>
    ${storageMeter(data.databaseBytes)}
  </header>

  <section class="overview">
    <div class="hero card">
      <p class="tile-label">Pessoas que usam o app</p>
      <p class="hero-value">${numberFormat.format(stats.total)}</p>
      <p class="tile-note">${plural(stats.week, 'abriu', 'abriram')} o app nos últimos 7 dias</p>
    </div>
    <div class="tiles">
      ${tile('Hoje', stats.today, 'abriram o app hoje')}
      ${tile('Últimos 30 dias', stats.month, 'abriram ao menos uma vez')}
      ${tile('Novas na semana', stats.newThisWeek, 'primeiro acesso em 7 dias')}
      ${tile('Com faltas anotadas', stats.withNotes, 'usam a aba Manual')}
    </div>
  </section>

  ${dailyChart(data)}
  ${reportsSection(data)}
  ${accountsTable(data)}

  <p class="foot muted">A contagem de acessos começou com esta versão do app: quem ainda não abriu o app depois dela aparece como “antes da contagem”.</p>
</main>
</body>
</html>`
}

export function renderError(message: string): string {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Painel do Chamada</title><style>${STYLE}</style></head>
<body><main><section class="card"><h1>Não consegui carregar o painel</h1><p class="muted">${escape(message)}</p><p><a href="/">Tentar de novo</a></p></section></main></body></html>`
}

const STYLE = `
:root {
  color-scheme: light;
  --page: #f4f4f6;
  --surface-1: #ffffff;
  --surface-2: #f4f4f6;
  --border: #e6e6ea;
  --grid: #ececef;
  --text-primary: #191919;
  --text-secondary: #666666;
  --series-1: #257de0;
  --series-1-track: #dbe9fa;
  --accent-text: #1c64b8;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --page: #0f0f10;
    --surface-1: #191919;
    --surface-2: #222224;
    --border: #2c2c2f;
    --grid: #29292c;
    --text-primary: #efefef;
    --text-secondary: #9c9c9c;
    --series-1: #338ced;
    --series-1-track: #1d3554;
    --accent-text: #79b3f5;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--text-primary); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1040px; margin: 0 auto; padding: 32px 20px 48px; }
h1 { font-size: 24px; margin: 0; letter-spacing: -0.01em; }
h2 { font-size: 16px; margin: 0; display: flex; align-items: baseline; gap: 10px; }
p { margin: 0; }
a { color: var(--accent-text); }
.muted { color: var(--text-secondary); }
.top { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px 32px; margin-bottom: 20px; }
.top .muted { margin-top: 4px; font-size: 13px; }
.storage { display: grid; gap: 6px; font-size: 13px; color: var(--text-secondary); min-width: 240px; }
.storage strong { color: var(--text-primary); font-weight: 600; }
.meter { display: block; height: 8px; border-radius: 999px; background: var(--series-1-track); overflow: hidden; }
.meter span { display: block; height: 100%; border-radius: 999px; background: var(--series-1); }
.card { background: var(--surface-1); border: 1px solid var(--border); border-radius: 18px; padding: 20px; margin-top: 16px; }
.card > .muted { margin-top: 4px; font-size: 13px; }
.overview { display: grid; grid-template-columns: minmax(220px, 1fr) 2fr; gap: 16px; }
.overview .hero { margin-top: 0; display: flex; flex-direction: column; justify-content: center; }
.hero-value { font-size: 56px; font-weight: 600; line-height: 1.1; margin: 4px 0; letter-spacing: -0.02em; }
.tiles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.tile { background: var(--surface-1); border: 1px solid var(--border); border-radius: 18px; padding: 16px 18px; }
.tile-label { font-size: 13px; color: var(--text-secondary); font-weight: 500; }
.tile-value { font-size: 28px; font-weight: 600; line-height: 1.2; margin-top: 2px; }
.tile-note { font-size: 12px; color: var(--text-secondary); }
@media (max-width: 720px) { .overview { grid-template-columns: 1fr; } }
.chart figcaption { margin-bottom: 18px; }
.chart figcaption .muted { margin-top: 4px; font-size: 13px; }
.chart { margin-left: 0; margin-right: 0; }
.plot { position: relative; height: 180px; margin: 0 0 28px 28px; }
.gridline { position: absolute; left: 0; right: 0; border-top: 1px solid var(--grid); }
.gridline span { position: absolute; right: calc(100% + 8px); top: -9px; font-size: 11px; color: var(--text-secondary); font-variant-numeric: tabular-nums; }
.bars { position: absolute; inset: 0; display: flex; align-items: flex-end; gap: 2px; }
.bar-slot { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; justify-content: center; outline: none; }
.bar { width: 100%; max-width: 24px; background: var(--series-1); border-radius: 4px 4px 0 0; min-height: 0; }
.bar-slot:hover .bar, .bar-slot:focus-visible .bar { filter: brightness(1.15); }
.bar-slot:focus-visible { box-shadow: 0 0 0 2px var(--series-1); border-radius: 4px; }
.x-label { position: absolute; top: calc(100% + 6px); font-size: 11px; color: var(--text-secondary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.tip { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); z-index: 2; background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 6px 10px; white-space: nowrap; font-size: 12px; box-shadow: 0 6px 20px rgb(0 0 0 / 0.12); flex-direction: column; }
.tip strong { font-size: 13px; }
.tip span { color: var(--text-secondary); }
.bar-slot:hover .tip, .bar-slot:focus-visible .tip { display: flex; }
.plot-empty { position: absolute; inset: 0; display: grid; place-items: center; text-align: center; padding: 0 24px; font-size: 13px; color: var(--text-secondary); }
details summary { cursor: pointer; color: var(--text-secondary); font-size: 13px; }
.table-view table { margin-top: 10px; }
.table-scroll { overflow-x: auto; margin-top: 12px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th { text-align: left; font-size: 12px; font-weight: 600; color: var(--text-secondary); padding: 8px 12px; border-bottom: 1px solid var(--border); white-space: nowrap; }
td { padding: 9px 12px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
tr:last-child td { border-bottom: 0; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--surface-2); padding: 2px 6px; border-radius: 6px; }
.empty { margin-top: 14px; color: var(--text-secondary); font-size: 14px; }
.count { font-size: 13px; font-weight: 500; color: var(--text-secondary); }
.report { border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; margin-top: 12px; }
.report.resolved { background: var(--surface-2); }
.report header { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--text-secondary); }
.report-text { margin-top: 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.chip { font-size: 12px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; color: var(--text-secondary); }
.report.resolved .chip { background: var(--surface-1); }
.report button { font: inherit; font-size: 13px; font-weight: 600; color: var(--text-primary); background: var(--surface-2); border: 1px solid var(--border); border-radius: 999px; padding: 5px 14px; cursor: pointer; }
.report button:hover { border-color: var(--text-secondary); }
.resolved-list { margin-top: 16px; }
.foot { margin-top: 20px; font-size: 12px; text-align: center; }
`
