import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { issueMediaGrant, verifyMediaGrantSignature } from '@/lib/media/grant'
import { privateMediaById } from '@/lib/media/registry'
import { DELIVERY_GRANT_TTL_SECONDS, MEDIA_DELIVERY_COOKIE, mediaDeliveryCookie, mediaDeliveryPath } from '@/lib/media/cookie'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource } from '@/lib/account/course-access'
import { isSecureRequest } from '@/lib/auth/cookie-policy'

export const runtime = 'nodejs'

async function authorizeDelivery(request: NextRequest, assetId: string) {
  const secret = process.env.MEDIA_SIGNING_SECRET
  const asset = privateMediaById(assetId)
  if (!secret || !asset) return new NextResponse(null, { status: 404 })

  const user = await currentUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const access = await authorizeCourseResource(user.account.id, asset.courseSlug, asset.nodeId)
  if (!access.allowed) return new NextResponse(null, { status: access.reason === 'unavailable' ? 503 : 403 })

  const now = Math.floor(Date.now() / 1000)
  const token = await issueMediaGrant(
    { assetId: asset.id, courseSlug: asset.courseSlug, nodeId: asset.nodeId, expiresAt: now + DELIVERY_GRANT_TTL_SECONDS },
    secret,
  )
  const response = new NextResponse(null, {
    status: 307,
    headers: {
      location: mediaDeliveryPath(asset.id),
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
    },
  })
  response.cookies.set({
    name: MEDIA_DELIVERY_COOKIE,
    value: token,
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: 'lax',
    path: mediaDeliveryPath(asset.id),
    maxAge: DELIVERY_GRANT_TTL_SECONDS,
  })
  return response
}

async function deliver(request: NextRequest, assetId: string, head: boolean) {
  const root = process.env.MEDIA_LOCAL_ROOT
  const secret = process.env.MEDIA_SIGNING_SECRET
  if (!secret) return new NextResponse(null, { status: 404 })

  const asset = privateMediaById(assetId)
  const token = mediaDeliveryCookie(request.headers)
  const grant = token ? await verifyMediaGrantSignature(token, secret) : null
  if (!asset || !grant || grant.expiresAt <= Math.floor(Date.now() / 1000) || grant.assetId !== asset.id || asset.courseSlug !== grant.courseSlug || asset.nodeId !== grant.nodeId) {
    return authorizeDelivery(request, assetId)
  }

  // Production requests with a valid cookie are intercepted by the outer Worker.
  // This branch exists only for deterministic local delivery.
  if (!root) return new NextResponse(null, { status: 404 })

  const absoluteRoot = resolve(root)
  const file = resolve(absoluteRoot, asset.key)
  if (!file.startsWith(`${absoluteRoot}${sep}`)) return new NextResponse(null, { status: 404 })
  try {
    const fileBody = await readFile(file)
    const rangeHeader = request.headers.get('range')
    const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/)
    let body = fileBody
    let status = 200
    const headers: Record<string, string> = {
      'accept-ranges': 'bytes',
      'cache-control': 'private, no-store',
      'content-type': asset.contentType,
      'x-content-type-options': 'nosniff',
    }
    if (rangeHeader && (!match || (!match[1] && !match[2]) || (!match[1] && match[2] === '0'))) {
      return new NextResponse(null, { status: 416, headers: { 'content-range': `bytes */${fileBody.byteLength}` } })
    }
    if (match) {
      const suffix = !match[1] ? Number(match[2]) : null
      const start = suffix === null ? Number(match[1]) : Math.max(0, fileBody.byteLength - suffix)
      const requestedEnd = suffix === null && match[2] ? Number(match[2]) : fileBody.byteLength - 1
      const end = Math.min(requestedEnd, fileBody.byteLength - 1)
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= fileBody.byteLength) {
        return new NextResponse(null, { status: 416, headers: { 'content-range': `bytes */${fileBody.byteLength}` } })
      }
      body = fileBody.subarray(start, end + 1)
      status = 206
      headers['content-range'] = `bytes ${start}-${end}/${fileBody.byteLength}`
    }
    headers['content-length'] = String(body.byteLength)
    return new NextResponse(head ? null : body, {
      status,
      headers: {
        ...headers,
      },
    })
  } catch {
    return new NextResponse(null, { status: 404 })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  return deliver(request, (await params).assetId, false)
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ assetId: string }> }) {
  return deliver(request, (await params).assetId, true)
}
