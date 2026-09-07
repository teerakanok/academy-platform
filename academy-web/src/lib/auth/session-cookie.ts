export const HOST_ACADEMY_SESSION_COOKIE = '__Host-academy_session'
export const LEGACY_ACADEMY_SESSION_COOKIE = 'academy_session'
export const HOST_IDENTITY_BINDING_COOKIE_PREFIX = '__Host-academy_identity_binding_'
export const LEGACY_IDENTITY_BINDING_COOKIE_PREFIX = 'academy_identity_binding_'
export const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32,160}$/

function sessionCookieAttributes({ secure, maxAge }: { secure: boolean; maxAge?: number }): string[] {
  const parts = ['Path=/', 'HttpOnly', 'SameSite=Lax']
  if (secure) parts.push('Secure')
  if (maxAge !== undefined) {
    if (!Number.isSafeInteger(maxAge) || maxAge < 0) throw new Error('identity session cookie maxAge ไม่ถูกต้อง')
    parts.push(`Max-Age=${maxAge}`)
  }
  return parts
}

export function academySessionCookieName(secure: boolean): string {
  return secure ? HOST_ACADEMY_SESSION_COOKIE : LEGACY_ACADEMY_SESSION_COOKIE
}

export function buildAcademySessionCookie(
  sessionId: string,
  { secure = true, maxAge }: { secure?: boolean; maxAge?: number } = {},
): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error('identity session cookie ต้องใช้ opaque session id')
  return [
    `${academySessionCookieName(secure)}=${sessionId}`,
    ...sessionCookieAttributes({ secure, maxAge }),
  ].join('; ')
}

export function expireAcademySessionCookieValue({ secure = true }: { secure?: boolean } = {}): string {
  return [
    `${academySessionCookieName(secure)}=`,
    ...sessionCookieAttributes({ secure, maxAge: 0 }),
  ].join('; ')
}

export function expireLegacyAcademySessionCookieValue({ secure = true }: { secure?: boolean } = {}): string {
  return [
    `${LEGACY_ACADEMY_SESSION_COOKIE}=`,
    ...sessionCookieAttributes({ secure, maxAge: 0 }),
  ].join('; ')
}

export function parseSessionCookieForNames(
  cookieHeader: string | null | undefined,
  names: readonly string[],
): string | null {
  if (!cookieHeader || names.length === 0) return null

  let occurrences = 0
  let candidate: string | null = null
  let malformed = false

  for (const rawPair of cookieHeader.split(';')) {
    const pair = rawPair.trim()
    const separator = pair.indexOf('=')
    const name = (separator === -1 ? pair : pair.slice(0, separator)).trim()
    if (!names.includes(name)) continue

    occurrences += 1
    if (separator === -1) {
      malformed = true
      continue
    }

    const value = pair.slice(separator + 1).trim()
    if (!SESSION_ID_PATTERN.test(value)) {
      malformed = true
      continue
    }
    candidate = value
  }

  return occurrences === 1 && !malformed ? candidate : null
}
