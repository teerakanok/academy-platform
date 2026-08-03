type HeaderReader = Pick<Headers, 'get'>

/** Policy เดียวของ session cookie ทุกจุดที่ Supabase SSR เขียนหรือ refresh */
export function authCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax' as const,
    path: '/',
  }
}

function forwardedProtocol(headers: HeaderReader): string | null {
  return headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase() ?? null
}

function isLocalHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
}

/** HTTPS signal ใด signal หนึ่ง upgrade ได้ แต่ header ไม่มีสิทธิ์ downgrade HTTPS จริง */
export function isSecureRequest(request: Pick<Request, 'headers' | 'url'>): boolean {
  const url = new URL(request.url)
  if (url.protocol === 'https:') return true
  const forwarded = forwardedProtocol(request.headers)
  if (forwarded === 'https') return true
  return process.env.NODE_ENV === 'production' && !isLocalHost(url.hostname)
}

/** production auth mutation ต้องมาจาก HTTPS edge; local HTTP ใช้ได้เฉพาะการพัฒนา */
export function acceptsAuthTransport(request: Pick<Request, 'headers' | 'url'>): boolean {
  const url = new URL(request.url)
  if (process.env.NODE_ENV !== 'production' || isLocalHost(url.hostname)) return true
  return url.protocol === 'https:' || forwardedProtocol(request.headers) === 'https'
}

/**
 * Server Components ไม่มี Request URL ให้ใช้ จึงเชื่อ protocol จาก proxy ก่อน
 * แล้ว fail-secure บน production host; localhost ยังคงใช้ HTTP ได้ใน next start.
 */
export function isSecureServerContext(headers: HeaderReader): boolean {
  const forwarded = forwardedProtocol(headers)
  if (forwarded === 'https') return true

  const host = headers.get('host')?.split(':')[0]?.toLowerCase()
  if (host && isLocalHost(host)) return false
  return process.env.NODE_ENV === 'production'
}
