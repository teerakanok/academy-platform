import { NextResponse } from 'next/server'
import { clearRouteAuthCookies, routeAuthClient } from '@/lib/auth/route-client'
import { validateMutationRequest } from '@/lib/http/mutation-security'

export const runtime = 'nodejs'

export async function POST(request: Request) {
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
