import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { verifyMediaGrantSignature } from '@/lib/media/grant'
import { privateMediaById } from '@/lib/media/registry'

export const runtime = 'nodejs'

async function deliver(request: NextRequest, token: string, head: boolean) {
  const root = process.env.MEDIA_LOCAL_ROOT
  const secret = process.env.MEDIA_SIGNING_SECRET
  if (!root || !secret) return new NextResponse(null, { status: 404 })

  const grant = await verifyMediaGrantSignature(token, secret)
  const asset = grant ? privateMediaById(grant.assetId) : null
  if (!grant || !asset || asset.courseSlug !== grant.courseSlug || asset.nodeId !== grant.nodeId) {
    return new NextResponse(null, { status: 404 })
  }
  if (grant.expiresAt <= Math.floor(Date.now() / 1000)) {
    return new NextResponse(null, {
      status: 307,
      headers: { location: `/api/media/open?token=${encodeURIComponent(token)}`, 'cache-control': 'private, no-store' },
    })
  }

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return deliver(request, (await params).token, false)
}

export async function HEAD(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return deliver(request, (await params).token, true)
}
