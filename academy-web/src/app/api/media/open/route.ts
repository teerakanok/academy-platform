import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { authorizeCourseResource } from '@/lib/account/course-access'
import { issueMediaGrant, verifyMediaGrantSignature } from '@/lib/media/grant'
import { privateMediaById } from '@/lib/media/registry'
import { DELIVERY_GRANT_TTL_SECONDS } from '@/lib/media/resolve'

export const runtime = 'nodejs'

const MAX_PAGE_GRANT_STALENESS_SECONDS = 24 * 60 * 60

export async function GET(request: NextRequest) {
  const secret = process.env.MEDIA_SIGNING_SECRET
  const token = request.nextUrl.searchParams.get('token')
  if (!secret || !token) return new NextResponse(null, { status: 404 })

  const grant = await verifyMediaGrantSignature(token, secret)
  const asset = grant ? privateMediaById(grant.assetId) : null
  const now = Math.floor(Date.now() / 1000)
  if (
    !grant ||
    !asset ||
    asset.courseSlug !== grant.courseSlug ||
    asset.nodeId !== grant.nodeId ||
    grant.expiresAt < now - MAX_PAGE_GRANT_STALENESS_SECONDS
  ) {
    return new NextResponse(null, { status: 404 })
  }

  const user = await currentUser()
  if (!user) return new NextResponse(null, { status: 401 })
  const access = await authorizeCourseResource(user.account.id, grant.courseSlug, grant.nodeId)
  if (!access.allowed) return new NextResponse(null, { status: access.reason === 'unavailable' ? 503 : 403 })

  const deliveryToken = await issueMediaGrant(
    { ...grant, expiresAt: now + DELIVERY_GRANT_TTL_SECONDS },
    secret,
  )
  return new NextResponse(null, {
    status: 307,
    headers: {
      location: `/course-media/${deliveryToken}`,
      'cache-control': 'private, no-store',
      'referrer-policy': 'no-referrer',
    },
  })
}
