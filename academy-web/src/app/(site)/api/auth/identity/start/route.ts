import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/route-client'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import { IdentityAdapterUnavailableError, getIdentityRuntimeBrowserFlow } from '@/lib/identity/registry'
import {
  createIdentityLocalRuntime,
  localAccountCenterUrl,
  localIdentityBrowserBindingCookie,
} from '@/lib/identity/local-runtime'
import { beginIdentityAuthorization } from '@/lib/identity/transaction'

export const runtime = 'nodejs'

const NO_STORE_HEADERS = { 'cache-control': 'no-store' }

export async function GET(request: Request) {
  if (identityControlLocalFixtureAllowedForRequest(request)) {
    return new NextResponse(null, { status: 405, headers: NO_STORE_HEADERS })
  }
  try {
    const browserFlow = getIdentityRuntimeBrowserFlow()
    if (!browserFlow) return new NextResponse(null, { status: 404, headers: NO_STORE_HEADERS })
    const result = await browserFlow.startNavigation(request)
    if (result.kind === 'error') {
      // The browser is navigating, so the failure must render on the sign-in page, not as JSON.
      return signInNoticeRedirect(request, 'identity-start-failed')
    }
    const response = NextResponse.redirect(new URL(result.location, request.url), result.status)
    for (const cookie of result.cookies) response.headers.append('set-cookie', cookie)
    response.headers.set('cache-control', 'no-store')
    return response
  } catch (error) {
    if (error instanceof IdentityAdapterUnavailableError) {
      return signInNoticeRedirect(request, 'identity-unavailable')
    }
    throw error
  }
}

function signInNoticeRedirect(request: Request, notice: 'identity-start-failed' | 'identity-unavailable') {
  const target = new URL('/sign-in', request.url)
  target.searchParams.set('notice', notice)
  const next = safeNextPath(new URL(request.url).searchParams.get('next') ?? '')
  if (next !== '/') target.searchParams.set('next', next)
  return NextResponse.redirect(target, { status: 303, headers: NO_STORE_HEADERS })
}

export async function POST(request: Request) {
  if (!identityControlLocalFixtureAllowedForRequest(request)) {
    try {
      const browserFlow = getIdentityRuntimeBrowserFlow()
      if (!browserFlow) return new NextResponse(null, { status: 404 })
      const result = await browserFlow.start(request)
      if (result.kind === 'error') {
        return NextResponse.json({ ok: false, error: result.error }, { status: result.status })
      }
      const response = NextResponse.redirect(new URL(result.location, request.url), result.status)
      for (const cookie of result.cookies) response.headers.append('set-cookie', cookie)
      return response
    } catch (error) {
      if (error instanceof IdentityAdapterUnavailableError) {
        return NextResponse.json(
          { ok: false, error: 'ยังไม่ได้เชื่อมต่อ Identity Control สำหรับสภาพแวดล้อมนี้' },
          { status: 503 },
        )
      }
      throw error
    }
  }
  const mutation = validateMutationRequest(request)
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  try {
    const form = await request.formData()
    if ([...form.keys()].length !== 1 || form.getAll('next').length !== 1) {
      return NextResponse.json({ ok: false, error: 'คำขอเข้าสู่ระบบไม่ถูกต้อง' }, { status: 400 })
    }
    const rawNext = form.get('next')
    if (typeof rawNext !== 'string') {
      return NextResponse.json({ ok: false, error: 'คำขอเข้าสู่ระบบไม่ถูกต้อง' }, { status: 400 })
    }
    const local = createIdentityLocalRuntime(request)
    const started = await beginIdentityAuthorization(local.transactionStore, local.registration, safeNextPath(rawNext))
    const response = NextResponse.redirect(localAccountCenterUrl(local.accountCenterOrigin, started.request), 303)
    response.headers.append('set-cookie', localIdentityBrowserBindingCookie(started.state, started.browserBinding))
    return response
  } catch {
    return NextResponse.json({ ok: false, error: 'เริ่มเข้าสู่ระบบไม่ได้ในขณะนี้' }, { status: 503 })
  }
}
