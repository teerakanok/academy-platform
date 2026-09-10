import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth/session'
import { hasStaffRole } from '@/lib/staff/authorization'
import { getAllCourses } from '@/lib/content/course-source'
import { academyDb } from '@/lib/db/server'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'

export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'private, no-store' }

async function requireOwner() {
  const user = await currentUser()
  if (!user) return { error: NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 }) }
  const isOwner = await hasStaffRole(user.account.id, 'owner')
  if (!isOwner) return { error: NextResponse.json({ ok: false, error: 'ต้องมีสิทธิ์ owner' }, { status: 403 }) }
  return { user }
}

/** List all courses with their runtime settings for the management UI. */
export async function GET() {
  const { error } = await requireOwner()
  if (error) return error
  try {
    const db = academyDb()
    const { data: settingsRows, error: settingsError } = await db
      .from('course_settings')
      .select('course_slug, title_override, subtitle_override, visibility, edited_at')
    if (settingsError) throw new Error(`อ่านการตั้งค่าไม่สำเร็จ: ${settingsError.message}`)
    const overrides = new Map(
      (settingsRows ?? []).map((row) => [
        row.course_slug as string,
        {
          titleOverride: row.title_override,
          subtitleOverride: row.subtitle_override,
          visibility: row.visibility,
          editedAt: new Date(row.edited_at as string).toISOString(),
        },
      ]),
    )
    const courses = getAllCourses().map((course) => {
      const s = overrides.get(course.structure.slug)
      const effective = (s?.visibility as string | null) ??
        (course.structure.publicAvailability === 'syllabus-preview' ? 'published' : 'unpublished')
      return {
        slug: course.structure.slug,
        staticAvailability: course.structure.publicAvailability,
        effectiveVisibility: effective,
        overridden: s?.visibility != null,
        title: s?.titleOverride ?? course.copy.title,
        titleOverride: s?.titleOverride ?? null,
        subtitle: s?.subtitleOverride ?? course.copy.subtitle,
        subtitleOverride: s?.subtitleOverride ?? null,
        lessonCount: course.structure.nodes.length,
        editedAt: s?.editedAt ?? null,
      }
    })
    return NextResponse.json({ ok: true, courses }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ok: false, error: 'อ่านรายการคอร์สไม่สำเร็จ' }, { status: 503, headers: NO_STORE })
  }
}
