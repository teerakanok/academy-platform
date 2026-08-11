import { NextResponse } from 'next/server'
import { clearRouteAuthCookies, routeAuthClient } from '@/lib/auth/route-client'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { legacyDirectOtpFixtureAllowedForRequest } from '@/lib/auth/legacy-direct-otp'
import { identityControlLocalFixtureAllowedForRequest } from '@/lib/identity/local-fixture'
import { revokeLocalAcademySession } from '@/lib/identity/local-runtime'
import { expireAcademySessionCookie } from '@/lib/identity/session-store'

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
    return NextResponse.json({ ok: false, error: 'ไม่มี Academy session สำหรับสภาพแวดล้อมนี้' }, { status: 503 })
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
      console.error('[auth/sign-out] revoke local refresh token ไม่สำเร็จ:', error.message)
    }
  } catch (error) {
    revocation = 'not-confirmed'
    console.error('[auth/sign-out] provider ติดต่อไม่ได้:', error)
  }
  // auth-js ล้าง session ก่อนคืน error ในหลายกรณี แต่ทำซ้ำตรงนี้เพื่อให้ contract
  // current-device deterministic แม้ behavior ภายใน provider เปลี่ยน
  await clearRouteAuthCookies()
  return NextResponse.json({ ok: true, scope: 'local', revocation })
}
