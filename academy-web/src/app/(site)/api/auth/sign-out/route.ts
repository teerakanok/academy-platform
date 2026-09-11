import { NextResponse } from 'next/server'
import { clearRouteAuthCookies, routeAuthClient } from '@/lib/auth/route-client'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { legacyDirectOtpFixtureAllowedForRequest } from '@/lib/auth/legacy-direct-otp'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import { revokeLocalAcademySession } from '@/lib/identity/local-runtime'
import {
  expireAcademySessionCookie,
  expireLegacyAcademySessionCookie,
  parseAcademySessionCookie,
} from '@/lib/identity/session-store'
import { createAcademyIdentityProductionSessionStore } from '@/lib/identity/production-runtime'
import { APPROVED_ACADEMY_CONSUMER_REGISTRY_V1 } from '@/lib/identity/consumer-policy'
import { safeErrorMessage } from '@/lib/safe-log'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (identityControlLocalFixtureAllowedForRequest(request)) {
    const mutation = validateMutationRequest(request)
    if (!mutation.ok) {
      return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
    }
    let revocation: 'confirmed' | 'not-confirmed' = 'confirmed'
    try {
      revokeLocalAcademySession(request)
    } catch {
      revocation = 'not-confirmed'
    }
    const response = NextResponse.json({ ok: true, scope: 'local', revocation })
    response.headers.append('set-cookie', expireAcademySessionCookie({ secure: false }))
    return response
  }
  if (!legacyDirectOtpFixtureAllowedForRequest(request)) {
    const mutation = validateMutationRequest(request)
    if (!mutation.ok) {
      return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
    }
    const sessionId = parseAcademySessionCookie(request.headers.get('cookie'))
    const sessionStore = createAcademyIdentityProductionSessionStore()
    let revocation: 'confirmed' | 'not-confirmed' = 'confirmed'
    try {
      if (!sessionId || !sessionStore) revocation = 'not-confirmed'
      else await sessionStore.revoke(sessionId)
    } catch {
      revocation = 'not-confirmed'
    }
    // ปิดช่อง shared machine (cross-product review F-1): sign-out ของ product ต้อง
    // จบ SSO session ของ Identity ด้วย ไม่งั้นคนถัดไปบนเครื่องเดิมเปิด Academy/Crux
    // แล้วถูก sign-in เงียบ ๆ ผ่าน /v1/authorizations/resume cookie ที่ยังอยู่ 12 ชม.
    // Server เป็นคนบอก URL (client ไม่ hardcode) และบอกเฉพาะ production branch นี้ —
    // fixture สาม branch อื่นไม่ได้มี Identity session จริงจึงไม่ต้องส่ง
    const response = NextResponse.json({
      ok: true,
      scope: 'local',
      revocation,
      ssoSignoutUrl: `${APPROVED_ACADEMY_CONSUMER_REGISTRY_V1.accountCenter.origin}/v1/sessions/signout`,
    })
    response.headers.append('set-cookie', expireAcademySessionCookie())
    response.headers.append('set-cookie', expireLegacyAcademySessionCookie())
    return response
  }
  const mutation = validateMutationRequest(request)
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }

  const supabase = await routeAuthClient(request)
  let revocation: 'confirmed' | 'not-confirmed' = 'confirmed'
  try {
    // ปุ่มนี้มี contract แบบ current device; ไม่ทำให้ session บนอุปกรณ์อื่นหายโดยไม่บอก
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) {
      revocation = 'not-confirmed'
      console.error('[auth/sign-out] revoke local refresh token ไม่สำเร็จ:', safeErrorMessage(error))
    }
  } catch (error) {
    revocation = 'not-confirmed'
    console.error('[auth/sign-out] provider ติดต่อไม่ได้:', safeErrorMessage(error))
  }
  // auth-js ล้าง session ก่อนคืน error ในหลายกรณี แต่ทำซ้ำตรงนี้เพื่อให้ contract
  // current-device deterministic แม้ behavior ภายใน provider เปลี่ยน
  await clearRouteAuthCookies()
  return NextResponse.json({ ok: true, scope: 'local', revocation })
}
