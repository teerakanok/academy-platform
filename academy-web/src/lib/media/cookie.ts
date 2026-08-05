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
