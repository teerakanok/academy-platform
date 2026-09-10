import { NextResponse } from 'next/server'
import { academyDb } from '@/lib/db/server'

export const runtime = 'nodejs'

/**
 * Public verification per the certificate claim: status only, never learner
 * identity or evidence. Noindex + no-store; the number is the only input.
 */
export async function GET(request: Request) {
  const number = new URL(request.url).searchParams.get('number')?.trim() ?? ''
  if (!/^[0-9a-f]{32}$/.test(number)) {
    return NextResponse.json(
      { ok: false, error: 'รูปแบบหมายเลขใบรับรองไม่ถูกต้อง' },
      { status: 400, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
    )
  }
  try {
    const db = academyDb()
    const { data, error } = await db
      .from('course_certificates')
      .select('certificate_number, course_slug, course_version, issued_at, revoked_at')
      .eq('certificate_number', number)
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json(
        { ok: true, status: 'not-found' },
        { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
      )
    }
    const revoked = data.revoked_at != null
    return NextResponse.json(
      {
        ok: true,
        status: revoked ? 'revoked' : 'valid',
        courseSlug: data.course_slug as string,
        courseVersion: data.course_version as string,
        issuedAt: new Date(data.issued_at as string).toISOString(),
      },
      { headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
    )
  } catch {
    return NextResponse.json(
      { ok: false, error: 'ตรวจสอบไม่สำเร็จ' },
      { status: 503, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
    )
  }
}
