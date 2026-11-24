// idUFSC (Apereo CAS at sistemas.ufsc.br) login and the interstitial pages that follow it.

import { parse, type HTMLElement } from 'node-html-parser'
import { AppError, cleanText, type HttpClient, type Step } from './http.js'

const CAS_LOGIN_URL = 'https://sistemas.ufsc.br/login'
const CAS_HOST = 'sistemas.ufsc.br'
const COLLECTA_HOST = 'collecta.sistemas.ufsc.br'
const MAX_INTERSTITIALS = 3

export function isCasLoginPage(step: Step): boolean {
  return new URL(step.url).hostname === CAS_HOST && new URL(step.url).pathname.startsWith('/login')
}

/** Submits username/password on a CAS login page and returns the step after it (redirects followed). */
export async function submitCasCredentials(
  client: HttpClient,
  loginPage: Step,
  html: string,
  username: string,
  password: string,
): Promise<Step> {
  const document = parse(html)
  const form = document.querySelector('form#fm1')
  const execution = form?.querySelector('input[name="execution"]')?.getAttribute('value')
  if (!form || !execution) {
    throw new AppError('unsupported_login_step', 'A página de login da UFSC mudou e não consegui entrar.', 502)
  }
  const userType = form.querySelector('input[name="customFields[userType]"]')?.getAttribute('value') ?? 'padrao'

  const step = await client.postForm(
    CAS_LOGIN_URL,
    {
      'customFields[userType]': userType,
      username,
      password,
      execution,
      _eventId: 'submit',
      geolocation: '',
    },
    loginPage.url,
  )

  if (new URL(step.url).hostname === CAS_HOST && !step.customLocation) {
    const page = await step.response.text()
    const error = parse(page).querySelector('.ufsc-erro')
    if (step.response.status === 401 || error) {
      throw new AppError('invalid_credentials', error ? cleanText(error.text) : 'Usuário ou senha inválidos.', 401)
    }
    const title = cleanText(parse(page).querySelector('title')?.text ?? '')
    throw new AppError(
      'unsupported_login_step',
      `O login da UFSC pediu uma etapa extra que o app ainda não suporta${title ? ` ("${title}")` : ''}. Entre uma vez pelo navegador e tente de novo.`,
      409,
    )
  }
  return step
}

/**
 * Collecta is UFSC's survey interstitial shown right after login. The app presses
 * "Responder mais tarde" (never "Não tenho interesse", which is irreversible) to continue
 * to the requested service. Returns the step after all interstitials and whether one was skipped.
 */
export async function passInterstitials(client: HttpClient, step: Step): Promise<{ step: Step; skippedCollecta: boolean }> {
  let current = step
  let skippedCollecta = false
  for (let attempt = 0; attempt < MAX_INTERSTITIALS; attempt++) {
    if (current.customLocation || new URL(current.url).hostname !== COLLECTA_HOST) break
    const html = await current.response.text()
    current = await skipCollecta(client, current, html)
    skippedCollecta = true
  }
  return { step: current, skippedCollecta }
}

async function skipCollecta(client: HttpClient, step: Step, html: string): Promise<Step> {
  const document = parse(html)
  const forms = document.querySelectorAll('form')
  const later = findSubmit(forms, (label) => /responder mais tarde/i.test(label))
  const back = findSubmit(forms, (label) => /voltar para/i.test(label))
  const choice = later ?? back
  if (!choice) {
    throw new AppError('unsupported_login_step', 'A UFSC mostrou um questionário obrigatório. Responda pelo navegador e tente de novo.', 409)
  }
  const fields: Record<string, string> = {}
  for (const input of choice.form.querySelectorAll('input[type="hidden"]')) {
    const name = input.getAttribute('name')
    if (name) fields[name] = input.getAttribute('value') ?? ''
  }
  fields[choice.name] = choice.value
  const action = new URL(choice.form.getAttribute('action') ?? step.url, step.url).toString()
  return client.postForm(action, fields, step.url)
}

function findSubmit(
  forms: HTMLElement[],
  matches: (label: string) => boolean,
): { form: HTMLElement; name: string; value: string } | null {
  for (const form of forms) {
    for (const input of form.querySelectorAll('input[type="submit"]')) {
      const value = cleanText(input.getAttribute('value') ?? '')
      const name = input.getAttribute('name')
      if (name && matches(value)) return { form, name, value }
    }
  }
  return null
}
