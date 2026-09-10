import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { getCourse, getCourseStructure } from '@/lib/content/course-source'
import { academyDb } from '@/lib/db/server'
import { certificatePdf } from '@/lib/certificate/pdf'

export const runtime = 'nodejs'

/** Download the issued certificate as a PDF attachment (no-store, learner-only). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
  const { slug } = await params
  const structure = getCourseStructure(slug)
  if (!structure) return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404 })
  try {
    const db = academyDb()
    const { data, error } = await db
      .from('course_certificates')
      .select('certificate_number, course_version, issued_at, revoked_at')
      .eq('user_id', user.account.id)
      .eq('course_slug', slug)
      .maybeSingle()
    if (error || !data) {
      return NextResponse.json({ ok: false, error: 'ยังไม่มีใบรับรองของคอร์สนี้' }, { status: 404 })
    }
    if (data.revoked_at) {
      return NextResponse.json({ ok: false, error: 'ใบรับรองนี้ถูกเพิกถอนแล้ว' }, { status: 410 })
    }
    const course = getCourse(slug, structure.defaultLocale)
    const pdf = certificatePdf({
      courseTitle: course?.copy.title ?? structure.slug,
      learnerLabel: user.email,
      issuedAtIso: new Date(data.issued_at as string).toISOString(),
      certificateNumber: data.certificate_number as string,
      courseVersion: data.course_version as string,
    })
    const filename = `${slug}-certificate-${data.certificate_number as string}.pdf`
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'private, no-store',
      },
    })
  } catch {
    return NextResponse.json({ ok: false, error: 'สร้างไฟล์ไม่สำเร็จ' }, { status: 500 })
  }
}
