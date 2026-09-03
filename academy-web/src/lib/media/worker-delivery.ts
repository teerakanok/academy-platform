import { verifyMediaGrantSignature } from './grant'
import { mediaDeliveryCookie } from './cookie'
import { privateMediaById, privateMediaByLegacyPath } from './registry'

interface MediaObject {
  body: ReadableStream
  httpEtag?: string
  range?: { offset?: number; length?: number; suffix?: number }
  size?: number
  writeHttpMetadata(headers: Headers): void
}

interface MediaBucket {
  get(key: string, options?: { range?: Headers }): Promise<MediaObject | null>
}

export interface MediaWorkerEnv {
  MEDIA_SIGNING_SECRET?: string
  COURSE_MEDIA?: MediaBucket
}

interface MediaRequest {
  url: string
  method: string
  headers: Headers
}

/**
 * One sanitized line per private-media decision: public asset id, outcome category,
 * the requested byte range as written, object size, and status. Never the grant
 * token, cookies, or any account identifier.
 */
function noteMedia(assetId: string, outcome: string, extra = ''): void {
  console.warn(`[media] asset=${assetId} outcome=${outcome}${extra ? ` ${extra}` : ''}`)
}

export async function servePrivateMedia(request: MediaRequest, env: MediaWorkerEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (privateMediaByLegacyPath(url.pathname)) return new Response(null, { status: 404 })
  if (!url.pathname.startsWith('/course-media/')) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  if (!env.MEDIA_SIGNING_SECRET || !env.COURSE_MEDIA) {
    return new Response('Private media is not configured', { status: 503 })
  }

  const assetId = url.pathname.slice('/course-media/'.length)
  const asset = privateMediaById(assetId)
  if (!asset) {
    noteMedia(assetId.slice(0, 64), 'unknown_asset')
    return null
  }
  const token = mediaDeliveryCookie(request.headers)
  if (!token) {
    noteMedia(asset.id, 'grant_missing')
    return null
  }
  const grant = await verifyMediaGrantSignature(token, env.MEDIA_SIGNING_SECRET)
  if (!grant || grant.assetId !== asset.id || asset.courseSlug !== grant.courseSlug || asset.nodeId !== grant.nodeId) {
    noteMedia(asset.id, grant ? 'grant_mismatch' : 'grant_invalid')
    return null
  }
  if (grant.expiresAt <= Math.floor(Date.now() / 1000)) {
    noteMedia(asset.id, 'grant_expired')
    return null
  }

  const requestedRange = request.headers.get('range')
  if (requestedRange) {
    const match = requestedRange.match(/^bytes=(\d*)-(\d*)$/)
    const start = match?.[1] ? Number(match[1]) : null
    const end = match?.[2] ? Number(match[2]) : null
    if (
      !match ||
      (start === null && end === null) ||
      (start !== null && (!Number.isSafeInteger(start) || start < 0)) ||
      (end !== null && (!Number.isSafeInteger(end) || end < 0)) ||
      (start !== null && end !== null && start > end) ||
      (start === null && end === 0)
    ) {
      noteMedia(asset.id, 'range_unparseable', `range=${JSON.stringify(requestedRange).slice(0, 40)}`)
      return new Response(null, { status: 416 })
    }
  }

  let object: MediaObject | null
  try {
    object = await env.COURSE_MEDIA.get(asset.key, { range: request.headers })
  } catch (error) {
    noteMedia(asset.id, 'r2_error', `error=${error instanceof Error ? error.name : 'unknown'}`)
    throw error
  }
  if (!object) {
    noteMedia(asset.id, 'r2_miss')
    return new Response(null, { status: 404 })
  }

  const headers = new Headers({
    'accept-ranges': 'bytes',
    'cache-control': 'private, no-store',
    'content-type': asset.contentType,
    'x-content-type-options': 'nosniff',
  })
  object.writeHttpMetadata(headers)
  headers.set('content-type', asset.contentType)
  headers.set('cache-control', 'private, no-store')
  if (object.httpEtag) headers.set('etag', object.httpEtag)
  if (requestedRange && (!object.range || object.size === undefined)) {
    noteMedia(asset.id, 'r2_range_unsatisfied', `range=${JSON.stringify(requestedRange).slice(0, 40)} size=${object.size}`)
    return new Response(null, { status: 416 })
  }
  if (requestedRange && object.range && object.size !== undefined) {
    const offset = object.range.offset ?? (object.range.suffix ? Math.max(0, object.size - object.range.suffix) : 0)
    const length = object.range.length ?? (object.range.suffix ? Math.min(object.range.suffix, object.size) : object.size - offset)
    const end = offset + length - 1
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || end >= object.size) {
      noteMedia(asset.id, 'range_out_of_bounds', `offset=${offset} length=${length} size=${object.size}`)
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${object.size}` } })
    }
    headers.set('content-range', `bytes ${offset}-${end}/${object.size}`)
    headers.set('content-length', String(length))
  }

  const status = requestedRange && object.range ? 206 : 200
  noteMedia(asset.id, 'served', `status=${status} method=${request.method} size=${object.size ?? 'unknown'}`
    + (requestedRange ? ` range=${JSON.stringify(requestedRange).slice(0, 40)} content_range=${headers.get('content-range') ?? 'none'}` : ''))
  return new Response(request.method === 'HEAD' ? null : object.body, {
    status,
    headers,
  })
}
