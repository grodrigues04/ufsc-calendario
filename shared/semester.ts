// UFSC semesters ("20262"), shared by the app, the functions and the local panel.
// UFSC's calendar starts the first semester in March and the second in August (2027.1 starts on
// March 1st, 2027.2 on August 2nd). From the end of classes in December until March, it is still
// the second semester of the year before.
// No relative imports here: the panel runs this file directly with Node.

const SAO_PAULO_MONTH = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric' })

/** Semester of a date, in São Paulo time: March to July is the first, August to February the second. */
export function semesterOf(date: Date): string {
  const parts = SAO_PAULO_MONTH.formatToParts(date)
  const year = Number(parts.find((part) => part.type === 'year')?.value)
  const month = Number(parts.find((part) => part.type === 'month')?.value)
  if (month >= 8) return `${year}2`
  if (month >= 3) return `${year}1`
  return `${year - 1}2`
}

/** The semester after this one: "20262" -> "20271". */
export function nextSemester(semester: string): string {
  const year = Number(semester.slice(0, 4))
  return semester.endsWith('2') ? `${year + 1}1` : `${year}2`
}

/** "20262" -> "2026.2" */
export function semesterLabel(semester: string): string {
  return `${semester.slice(0, 4)}.${semester.slice(4)}`
}

/** First day of a semester by the rule above: "20271" -> "1º de março de 2027". */
export function semesterStartText(semester: string): string {
  return `1º de ${semester.endsWith('1') ? 'março' : 'agosto'} de ${semester.slice(0, 4)}`
}
