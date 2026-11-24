// The login endpoint is a proxy to idUFSC: other websites must not be able to call it from
// a visitor's browser. Requests without Origin (not from a browser page) are left alone.

export function isCrossSite(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') === 'cross-site') return true
  const origin = request.headers.get('origin')
  if (!origin) return false
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host')
  try {
    return new URL(origin).host !== host
  } catch {
    return true
  }
}

export function forbidden(): Response {
  return Response.json({ code: 'bad_request', message: 'Origem não permitida.' }, { status: 403 })
}
