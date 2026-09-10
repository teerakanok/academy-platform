import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { currentUser } from '@/lib/auth/session'
import { deniedAccessStatus, authorizeCourseResource } from '@/lib/account/course-access'
import { getCourseStructure } from '@/lib/content/course-source'
import { certificateEligibility, certificateEvidenceSnapshot } from '@/lib/course/certificate-eligibility'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'
import { academyDb } from '@/lib/db/server'

export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'private, no-store' }

export interface IssuedCertificateRecord {
  certificateNumber: string
  courseSlug: string
  courseVersion: string
  issuedAt: string
  revokedAt: string | null
}

function numberForCertificate(): string {
  return randomBytes(16).toString('hex')
}

async function loadIssued(userId: string, courseSlug: string): Promise<IssuedCertificateRecord | null> {
  const db = academyDb()
  const { data, error } = await db
    .from('course_certificates')
    .select('certificate_number, course_slug, course_version, issued_at, revoked_at')
    .eq('user_id', userId)
    .eq('course_slug', courseSlug)
    .maybeSingle()
  if (error) throw new Error(`อ่านใบรับรองไม่สำเร็จ: ${error.message}`)
  if (!data) return null
  return {
    certificateNumber: data.certificate_number as string,
    courseSlug: data.course_slug as string,
    courseVersion: data.course_version as string,
    issuedAt: new Date(data.issued_at as string).toISOString(),
    revokedAt: data.revoked_at ? new Date(data.revoked_at as string).toISOString() : null,
  }
}

/** Current certificate state for the learner: issued record or eligibility summary. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401, headers: NO_STORE })
  const { slug } = await params
  const structure = getCourseStructure(slug)
  if (!structure) return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404, headers: NO_STORE })
  try {
    const issued = await loadIssued(user.account.id, slug)
    if (issued) return NextResponse.json({ ok: true, issued }, { headers: NO_STORE })
    const eligibility = await certificateEligibility(user.account.id, slug)
    if ('unavailable' in eligibility) {
      return NextResponse.json({ ok: false, error: 'ตรวจเงื่อนไขไม่สำเร็จ' }, { status: 503, headers: NO_STORE })
    }
    return NextResponse.json({
      ok: true,
      issued: null,
      eligible: eligibility.eligible,
      summary: {
        assessedPassed: eligibility.summary.assessedPassed,
        assessedTotal: eligibility.summary.assessedTotal,
        lessonsFinished: eligibility.summary.lessonsFinished,
        total: eligibility.summary.total,
        blocking: eligibility.summary.blocking,
        courseIssue: eligibility.summary.courseIssue,
      },
    }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ok: false, error: 'ตรวจเงื่อนไขไม่สำเร็จ' }, { status: 503, headers: NO_STORE })
  }
}

/**
 * Idempotent issue-on-demand: first eligible call mints the record with a
 * fresh unpredictable number; every later call returns the same record.
 * Revoked certificates are never re-issued.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }
  const body = await readBoundedJson(request, 2 * 1024)
  if (!body.ok) {
    return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  }
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 })
  const { slug } = await params
  const structure = getCourseStructure(slug)
  if (!structure) return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404 })

  const access = await authorizeCourseResource(user.account.id, slug)
  if (!access.allowed) {
    return NextResponse.json(
      { ok: false, error: access.reason === 'unavailable' ? 'ตรวจสิทธิ์ไม่สำเร็จ' : 'ยังไม่มีสิทธิ์เข้าถึงคอร์สนี้' },
      { status: deniedAccessStatus(access) },
    )
  }

  try {
    const existing = await loadIssued(user.account.id, slug)
    if (existing) {
      return NextResponse.json({ ok: true, issued: existing, alreadyIssued: true }, { headers: NO_STORE })
    }
    const eligibility = await certificateEligibility(user.account.id, slug)
    if ('unavailable' in eligibility) {
      return NextResponse.json({ ok: false, error: 'ตรวจเงื่อนไขไม่สำเร็จ' }, { status: 503 })
    }
    if (!eligibility.eligible) {
      return NextResponse.json({ ok: false, error: 'ยังทำคอร์สไม่ครบเงื่อนไข' }, { status: 409 })
    }
    const db = academyDb()
    const certificateNumber = numberForCertificate()
    const { error: insertError } = await db
      .from('course_certificates')
      .insert({
        user_id: user.account.id,
        course_slug: slug,
        course_version: eligibility.courseVersion,
        certificate_number: certificateNumber,
        evidence: certificateEvidenceSnapshot(eligibility),
      })
    if (insertError) {
      // Unique conflict = a concurrent issue won the race; return that record.
      if (insertError.code === '23505') {
        const raced = await loadIssued(user.account.id, slug)
        if (raced) return NextResponse.json({ ok: true, issued: raced, alreadyIssued: true }, { headers: NO_STORE })
      }
      throw new Error(`ออกใบรับรองไม่สำเร็จ: ${insertError.message}`)
    }
    const issued = await loadIssued(user.account.id, slug)
    return NextResponse.json({ ok: true, issued }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ok: false, error: 'ออกใบรับรองไม่สำเร็จ' }, { status: 500 })
  }
}
