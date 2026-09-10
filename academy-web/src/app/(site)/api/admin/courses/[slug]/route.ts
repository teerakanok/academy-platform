import { NextResponse } from 'next/server'
import { z } from 'zod'
import { currentUser } from '@/lib/auth/session'
import { hasStaffRole } from '@/lib/staff/authorization'
import { getCourseStructure } from '@/lib/content/course-source'
import { academyDb } from '@/lib/db/server'
import { readBoundedJson } from '@/lib/http/bounded-body'
import { validateMutationRequest } from '@/lib/http/mutation-security'

export const runtime = 'nodejs'

const NO_STORE = { 'cache-control': 'private, no-store' }
const MAX_BODY = 16 * 1024

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).nullable().optional(),
  subtitle: z.string().trim().max(600).nullable().optional(),
  visibility: z.enum(['published', 'unpublished', 'retired', 'inherit']).optional(),
}).strict()

async function requireOwner() {
  const user = await currentUser()
  if (!user) return { error: NextResponse.json({ ok: false, error: 'ต้องเข้าสู่ระบบก่อน' }, { status: 401 }) }
  const isOwner = await hasStaffRole(user.account.id, 'owner')
  if (!isOwner) return { error: NextResponse.json({ ok: false, error: 'ต้องมีสิทธิ์ owner' }, { status: 403 }) }
  return { user }
}

/** Update course settings (title/subtitle overrides, visibility). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }
  const { user, error } = await requireOwner()
  if (error) return error
  const body = await readBoundedJson(request, MAX_BODY)
  if (!body.ok) return NextResponse.json({ ok: false, error: 'รูปแบบคำขอไม่ถูกต้อง' }, { status: 400 })
  const parsed = patchSchema.safeParse(body.value)
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })
  const { slug } = await params
  const structure = getCourseStructure(slug)
  if (!structure) return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404 })

  const visibility = parsed.data.visibility === 'inherit' ? null : parsed.data.visibility ?? undefined
  const updates: Record<string, unknown> = { edited_by: user.account.id, edited_at: new Date().toISOString() }
  if (parsed.data.title !== undefined) updates.title_override = parsed.data.title
  if (parsed.data.subtitle !== undefined) updates.subtitle_override = parsed.data.subtitle
  if (visibility !== undefined) updates.visibility = visibility

  try {
    const db = academyDb()
    const { error: upsertError } = await db
      .from('course_settings')
      .upsert({ course_slug: slug, ...updates }, { onConflict: 'course_slug' })
    if (upsertError) throw new Error(upsertError.message)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ok: false, error: 'บันทึกการตั้งค่าไม่สำเร็จ' }, { status: 500 })
  }
}

/** Soft-delete (retire) a course — removes it from all learner surfaces. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const mutation = validateMutationRequest(request, { requireJson: true })
  if (!mutation.ok) {
    return NextResponse.json({ ok: false, error: mutation.error }, { status: mutation.status })
  }
  const { user, error } = await requireOwner()
  if (error) return error
  const { slug } = await params
  const structure = getCourseStructure(slug)
  if (!structure) return NextResponse.json({ ok: false, error: 'ไม่พบคอร์สนี้' }, { status: 404 })
  try {
    const db = academyDb()
    const { error: upsertError } = await db
      .from('course_settings')
      .upsert({
        course_slug: slug,
        visibility: 'retired',
        edited_by: user.account.id,
        edited_at: new Date().toISOString(),
      }, { onConflict: 'course_slug' })
    if (upsertError) throw new Error(upsertError.message)
    return NextResponse.json({ ok: true, retired: true }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ ok: false, error: 'ถอนคอร์สไม่สำเร็จ' }, { status: 500 })
  }
}
