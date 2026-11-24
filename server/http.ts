// Minimal browser-like HTTP client: cookie jar + manual redirect following.
// UFSC systems (CAS, CAGR, Moodle) only work with cookies and multi-hop redirects.

import type { ErrorCode } from '../shared/types.js'

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'

const REQUEST_TIMEOUT_MS = 25_000
const MAX_REDIRECTS = 15

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number

  constructor(code: ErrorCode, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

interface Cookie {
  name: string
  value: string
  domain: string
  hostOnly: boolean
  path: string
}

export class CookieJar {
  private cookies: Cookie[] = []

  store(url: string, response: Response): void {
    const host = new URL(url).hostname
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attributes] = raw.split(';').map((part) => part.trim())
      const separator = pair.indexOf('=')
      if (separator <= 0) continue
      const cookie: Cookie = {
        name: pair.slice(0, separator),
        value: pair.slice(separator + 1),
        domain: host,
        hostOnly: true,
        path: '/',
      }
      let expired = false
      for (const attribute of attributes) {
        const [key, value = ''] = attribute.split('=')
        const name = key.toLowerCase()
        if (name === 'domain' && value) {
          cookie.domain = value.replace(/^\./, '').toLowerCase()
          cookie.hostOnly = false
        } else if (name === 'path' && value) {
          cookie.path = value
        } else if (name === 'max-age' && Number(value) <= 0) {
          expired = true
        } else if (name === 'expires' && Date.parse(value) < Date.now()) {
          expired = true
        }
      }
      this.cookies = this.cookies.filter(
        (existing) => !(existing.name === cookie.name && existing.domain === cookie.domain && existing.path === cookie.path),
      )
      if (!expired) this.cookies.push(cookie)
    }
  }

  header(url: string): string {
    const { hostname, pathname } = new URL(url)
    return this.cookies
      .filter((cookie) =>
        cookie.hostOnly ? hostname === cookie.domain : hostname === cookie.domain || hostname.endsWith(`.${cookie.domain}`),
      )
      .filter((cookie) => cookie.path === '/' || pathname.startsWith(cookie.path))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  find(domain: string, matches: (name: string) => boolean): string | null {
    const cookie = this.cookies.find((candidate) => candidate.domain === domain && matches(candidate.name))
    return cookie ? `${cookie.name}=${cookie.value}` : null
  }

  /** Adds a "name=value" cookie for a host. */
  add(domain: string, cookie: string): void {
    const separator = cookie.indexOf('=')
    if (separator <= 0) return
    this.cookies.push({
      name: cookie.slice(0, separator),
      value: cookie.slice(separator + 1),
      domain,
      hostOnly: true,
      path: '/',
    })
  }
}

export interface Step {
  response: Response
  url: string
  /** Set when a redirect points to a custom URL scheme (moodlemobile://token=...). */
  customLocation?: string
}

interface RequestOptions {
  method?: string
  body?: string
  headers?: Record<string, string>
}

export class HttpClient {
  readonly jar: CookieJar
  private readonly userAgent: string

  constructor(jar = new CookieJar(), userAgent = BROWSER_USER_AGENT) {
    this.jar = jar
    this.userAgent = userAgent
  }

  async request(url: string, { method = 'GET', body, headers = {} }: RequestOptions = {}): Promise<Response> {
    let response: Response
    try {
      response = await fetch(url, {
        method,
        body,
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: {
          'User-Agent': this.userAgent,
          'Accept-Language': 'pt-BR,pt;q=0.9',
          Cookie: this.jar.header(url),
          ...headers,
        },
      })
    } catch {
      throw new AppError('ufsc_unavailable', `Não foi possível falar com ${new URL(url).hostname}. Tente de novo em instantes.`, 502)
    }
    this.jar.store(url, response)
    return response
  }

  /** Requests a URL and follows redirects until a final page or a custom-scheme location. */
  async follow(url: string, options: RequestOptions = {}): Promise<Step> {
    let current = url
    let response = await this.request(current, options)
    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      if (response.status < 300 || response.status >= 400) return { response, url: current }
      const location = response.headers.get('location')
      if (!location) return { response, url: current }
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(location) && !/^https?:/i.test(location)) {
        return { response, url: current, customLocation: location }
      }
      await response.body?.cancel()
      current = new URL(location, current).toString()
      response = await this.request(current)
    }
    throw new AppError('ufsc_unavailable', 'Redirecionamentos demais ao acessar os sistemas da UFSC.', 502)
  }

  async postForm(url: string, fields: Record<string, string>, referer?: string): Promise<Step> {
    return this.follow(url, {
      method: 'POST',
      body: new URLSearchParams(fields).toString(),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        ...(referer ? { Referer: referer } : {}),
      },
    })
  }
}

// Accented letters (&iacute; &ccedil; &atilde; ...) become letter + combining mark, then NFC.
const COMBINING_MARKS: Record<string, string> = {
  acute: '́',
  grave: '̀',
  circ: '̂',
  tilde: '̃',
  uml: '̈',
  cedil: '̧',
  ring: '̊',
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  quot: '"',
  apos: "'",
  lt: '<',
  gt: '>',
  ordm: 'º',
  ordf: 'ª',
  deg: '°',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  ldquo: '“',
  rdquo: '”',
  lsquo: '‘',
  rsquo: '’',
  laquo: '«',
  raquo: '»',
  middot: '·',
  szlig: 'ß',
  aelig: 'æ',
}

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&([a-zA-Z])(acute|grave|circ|tilde|uml|cedil|ring);/g, (_, letter: string, mark: string) =>
      (letter + COMBINING_MARKS[mark]).normalize('NFC'),
    )
    .replace(/&([a-z]+);/g, (entity, name: string) => NAMED_ENTITIES[name] ?? entity)
    .replace(/&amp;/g, '&')
}

export function cleanText(text: string): string {
  return decodeEntities(text).replace(/\s+/g, ' ').trim()
}
