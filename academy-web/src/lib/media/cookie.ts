export const MEDIA_DELIVERY_COOKIE = 'academy_media_grant'
export const DELIVERY_GRANT_TTL_SECONDS = 5 * 60

export function mediaDeliveryPath(assetId: string): string {
  return `/course-media/${encodeURIComponent(assetId)}`
}

export function mediaDeliveryCookie(headers: Pick<Headers, 'get'>): string | null {
  const raw = headers.get('cookie')
  if (!raw) return null

  for (const part of raw.split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === MEDIA_DELIVERY_COOKIE) return value.join('=') || null
  }
  return null
}

const ACADEMY_SESSION_COOKIE = 'academy_session'
const ACADEMY_SESSION_ID = /^[A-Za-z0-9_-]{32,160}$/

/** Edge-safe counterpart to the accepted raw Academy session parser. */
export function parseAcademySessionCookie(headers: Pick<Headers, 'get'>): string | null {
  const raw = headers.get('cookie')
  if (!raw) return null

  let occurrences = 0
  let candidate: string | null = null
  let malformed = false

  for (const rawPair of raw.split(';')) {
    const pair = rawPair.trim()
    const separator = pair.indexOf('=')
    const name = (separator === -1 ? pair : pair.slice(0, separator)).trim()
    if (name !== ACADEMY_SESSION_COOKIE) continue

    occurrences += 1
    if (separator === -1) {
      malformed = true
      continue
    }

    const value = pair.slice(separator + 1).trim()
    if (!ACADEMY_SESSION_ID.test(value)) {
      malformed = true
      continue
    }
    candidate = value
  }

  return occurrences === 1 && !malformed ? candidate : null
}
