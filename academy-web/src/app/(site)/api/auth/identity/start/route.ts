import { NextResponse } from 'next/server'
import { safeNextPath } from '@/lib/auth/route-client'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import {
  createIdentityLocalRuntime,
  localAccountCenterUrl,
  localIdentityBrowserBindingCookie,
} from '@/lib/identity/local-runtime'
import { beginIdentityAuthorization } from '@/lib/identity/transaction'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!identityControlLocalFixtureAllowedForRequest(request)) {
    return new NextResponse(null, { status: 404 })
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
