import { verifyMediaGrantSignature } from './grant'
import { privateMediaById } from './registry'

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

export async function servePrivateMedia(request: MediaRequest, env: MediaWorkerEnv): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/course-media/')) return null
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405 })
  if (!env.MEDIA_SIGNING_SECRET || !env.COURSE_MEDIA) {
    return new Response('Private media is not configured', { status: 503 })
  }

  const token = url.pathname.slice('/course-media/'.length)
  const grant = await verifyMediaGrantSignature(token, env.MEDIA_SIGNING_SECRET)
  const asset = grant ? privateMediaById(grant.assetId) : null
  if (!grant || !asset || asset.courseSlug !== grant.courseSlug || asset.nodeId !== grant.nodeId) {
    return new Response(null, { status: 404 })
  }
  if (grant.expiresAt <= Math.floor(Date.now() / 1000)) {
    return new Response(null, {
      status: 307,
      headers: { location: `/api/media/open?token=${encodeURIComponent(token)}`, 'cache-control': 'private, no-store' },
    })
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
      return new Response(null, { status: 416 })
    }
  }

  const object = await env.COURSE_MEDIA.get(asset.key, { range: request.headers })
  if (!object) return new Response(null, { status: 404 })

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
  if (object.range && object.size !== undefined) {
    const offset = object.range.offset ?? (object.range.suffix ? Math.max(0, object.size - object.range.suffix) : 0)
    const length = object.range.length ?? (object.range.suffix ? Math.min(object.range.suffix, object.size) : object.size - offset)
    const end = offset + length - 1
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 1 || end >= object.size) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${object.size}` } })
    }
    headers.set('content-range', `bytes ${offset}-${end}/${object.size}`)
    headers.set('content-length', String(length))
  }

  return new Response(request.method === 'HEAD' ? null : object.body, {
    status: object.range ? 206 : 200,
    headers,
  })
}
