import type { ApiError, ErrorCode, LoginEvent, LoginResult, LoginStep, SyncRequest, SyncResult } from '@shared/types'

export class ApiFailure extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const OFFLINE = new ApiFailure('ufsc_unavailable', 'Sem conexão com a internet.')

async function readError(response: Response): Promise<ApiFailure> {
  const body = (await response.json().catch(() => null)) as ApiError | null
  return new ApiFailure(body?.code ?? 'unknown', body?.message ?? 'Não foi possível completar agora.')
}

/** Logs in through the server (idUFSC) and reports each step while it happens. */
export async function login(username: string, password: string, onStep: (step: LoginStep) => void): Promise<LoginResult> {
  let response: Response
  try {
    response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
  } catch {
    throw OFFLINE
  }
  if (!response.ok || !response.body) throw await readError(response)

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim()
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      if (!line) continue
      const event = JSON.parse(line) as LoginEvent
      if (event.type === 'progress') onStep(event.step)
      else if (event.type === 'error') throw new ApiFailure(event.code, event.message)
      else return event.data
    }
  }
  throw new ApiFailure('unknown', 'O login foi interrompido. Tente de novo.')
}

export async function sync(request: SyncRequest): Promise<SyncResult> {
  let response: Response
  try {
    response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
  } catch {
    throw OFFLINE
  }
  if (!response.ok) throw await readError(response)
  return (await response.json()) as SyncResult
}
