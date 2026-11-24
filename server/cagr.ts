// CAGR "Grade de Horários": student info, enrolled disciplines and the weekly schedule.

import { parse, type HTMLElement } from 'node-html-parser'
import type { Discipline, ScheduleSlot, Student } from '../shared/types.js'
import { isCasLoginPage, passInterstitials } from './cas.js'
import { AppError, cleanText, type HttpClient } from './http.js'

const CAGR_GRADE_URL = 'https://cagr.sistemas.ufsc.br/modules/aluno/grade/'
const CLASS_MINUTES = 50
// Start-to-start distance of consecutive classes in the same shift (15:10 -> 16:20 is the longest).
const MAX_GAP_BETWEEN_CLASSES = 70

// Column order of the schedule table: Segunda..Sábado -> Date#getDay values.
const WEEKDAYS = [1, 2, 3, 4, 5, 6]

/** Opens the CAGR schedule reusing the CAS session (TGC cookie) already in the client. */
export async function fetchCagrGrade(client: HttpClient): Promise<{ student: Student; disciplines: Discipline[] }> {
  const first = await client.follow(CAGR_GRADE_URL)
  if (isCasLoginPage(first)) {
    throw new AppError('unsupported_login_step', 'O CAGR pediu login de novo.', 502)
  }
  let { step } = await passInterstitials(client, first)
  if (!step.url.startsWith(CAGR_GRADE_URL)) {
    // Collecta sends the user back through CAS; one more hop lands on the grade.
    step = await client.follow(CAGR_GRADE_URL)
  }
  const html = await step.response.text()
  if (!step.url.startsWith(CAGR_GRADE_URL) || step.response.status !== 200) {
    throw new AppError('ufsc_unavailable', 'Não consegui abrir sua grade no CAGR.', 502)
  }
  return parseGradePage(html)
}

export function parseGradePage(html: string): { student: Student; disciplines: Discipline[] } {
  const document = parse(html)
  const student = parseStudent(document)
  const names = parseDisciplineTable(document)
  const slots = parseScheduleTable(document)

  const disciplines: Discipline[] = names.map((info) => ({
    ...info,
    schedule: slots.get(info.code) ?? [],
  }))
  // Disciplines present only in the grid (should not happen, but keep them).
  for (const [code, schedule] of slots) {
    if (!disciplines.some((discipline) => discipline.code === code)) {
      disciplines.push({ code, classGroup: '', name: code, professors: [], schedule })
    }
  }
  if (!student.semester && disciplines.length === 0) {
    throw new AppError('ufsc_unavailable', 'A página da grade veio vazia.', 502)
  }
  return { student, disciplines }
}

function parseStudent(document: HTMLElement): Student {
  const values: Record<string, string> = {}
  for (const label of document.querySelectorAll('td.aluno_info_col1, td.aluno_info_col3')) {
    const key = cleanText(label.text).replace(/:$/, '').toLowerCase()
    const value = label.nextElementSibling
    if (value) values[key] = cleanText(value.text)
  }
  const semester = values['semestre'] ?? document.querySelector('select option[selected]')?.getAttribute('value') ?? ''
  return {
    name: toTitleCase(values['aluno'] ?? ''),
    registration: values['matrícula'] ?? values['matricula'] ?? '',
    // "SISTEMAS DE INFORMAÇÃO (noturno)" -> "Sistemas de Informação (noturno)"
    program: toTitleCase(values['curso'] ?? ''),
    semester,
  }
}

function parseDisciplineTable(document: HTMLElement): Omit<Discipline, 'schedule'>[] {
  const table = document.querySelectorAll('table.borda').find((candidate) => /NOME DA DISCIPLINA/i.test(candidate.text))
  if (!table) return []
  const disciplines: Omit<Discipline, 'schedule'>[] = []
  for (const row of table.querySelectorAll('tr')) {
    const cells = row.querySelectorAll('td.linha_tabela')
    if (cells.length < 3) continue
    const code = cleanText(cells[0].text)
    if (!/^[A-Z]{3}\d{4}$/.test(code)) continue
    const professors = (cells[3]?.innerHTML ?? '')
      .split(/<br\s*\/?>/i)
      .map((part) => cleanText(part.replace(/<[^>]+>/g, '')))
      .filter(Boolean)
    disciplines.push({
      code,
      classGroup: cleanText(cells[1].text),
      name: cleanText(cells[2].text),
      professors,
    })
  }
  return disciplines
}

/** Reads the weekly grid: each cell is one 50-minute class; contiguous cells form one meeting. */
function parseScheduleTable(document: HTMLElement): Map<string, ScheduleSlot[]> {
  const table = document.querySelectorAll('table').find((candidate) => {
    const headers = candidate.querySelectorAll('th').map((th) => cleanText(th.text).toLowerCase())
    return headers.includes('segunda') && headers.includes('sexta')
  })
  const slots = new Map<string, ScheduleSlot[]>()
  if (!table) return slots

  // grid[column] = list of { time, code, room } per row, in table order.
  const columns: Array<Array<{ time: string; code: string; room: string } | null>> = WEEKDAYS.map(() => [])
  for (const row of table.querySelectorAll('tbody tr')) {
    const time = cleanText(row.querySelector('td.horario')?.text ?? '').match(/\d{2}:\d{2}/)?.[0]
    if (!time) {
      // Spacer row between morning, afternoon and night: breaks any meeting.
      columns.forEach((cells) => cells.push(null))
      continue
    }
    const cells = row.querySelectorAll('td').slice(1)
    WEEKDAYS.forEach((_, column) => {
      const text = cleanText(cells[column]?.text ?? '')
      const match = text.match(/^([A-Z]{3}\d{4})-\S+\s*(.*)$/)
      columns[column].push(match ? { time, code: match[1], room: match[2].trim() } : null)
    })
  }

  columns.forEach((cells, column) => {
    let index = 0
    while (index < cells.length) {
      const cell = cells[index]
      if (!cell) {
        index++
        continue
      }
      let length = 1
      while (
        cells[index + length]?.code === cell.code &&
        minutesBetween(cells[index + length - 1]!.time, cells[index + length]!.time) <= MAX_GAP_BETWEEN_CLASSES
      ) {
        length++
      }
      const last = cells[index + length - 1]!
      const slot: ScheduleSlot = {
        weekday: WEEKDAYS[column],
        start: cell.time,
        end: addMinutes(last.time, CLASS_MINUTES),
        classes: length,
        room: cell.room,
      }
      slots.set(cell.code, [...(slots.get(cell.code) ?? []), slot])
      index += length
    }
  })
  return slots
}

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesBetween(from: string, to: string): number {
  return toMinutes(to) - toMinutes(from)
}

function addMinutes(time: string, minutes: number): string {
  const total = toMinutes(time) + minutes
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function toTitleCase(name: string): string {
  const lowercase = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return name
    .toLowerCase()
    .split(' ')
    .map((word, index) => (index > 0 && lowercase.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}
