import 'server-only'

import { academyDb } from '@/lib/db/server'

// ลงเรียนคอร์สฟรีด้วยตัวเอง — ตัวตัดสินอยู่ใน DB (`academy.enrol_free_course`, 0040)
//
// runtime ส่งได้แค่ "ใคร + คอร์สไหน" · DB เป็นคนตรวจเองว่าคอร์สนั้นมี offer ฟรีจริง
// บัญชีเปิดใช้ Academy อยู่ และไม่เคยถูก owner เพิกถอน · การที่ course.json เขียนว่าฟรี
// ไม่ได้ทำให้ลงเรียนได้ มันแค่ทำให้หน้าเว็บ "แสดง" ว่าฟรี

export type FreeEnrolmentResult =
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'not-free' | 'inactive' | 'revoked' | 'invalid' | 'unavailable' }

export async function enrolFreeCourse(userId: string, courseSlug: string): Promise<FreeEnrolmentResult> {
  const { data, error } = await academyDb().rpc('enrol_free_course', {
    p_user_id: userId,
    p_course_slug: courseSlug,
  })
  if (error) {
    if (error.code === '55000') return { ok: false, reason: 'inactive' }
    if (error.code === '22023') return { ok: false, reason: 'invalid' }
    if (error.code === '42501') {
      return { ok: false, reason: /revoked/.test(error.message ?? '') ? 'revoked' : 'not-free' }
    }
    return { ok: false, reason: 'unavailable' }
  }
  const result = data as { enrolled?: unknown; changed?: unknown } | null
  if (!result || result.enrolled !== true || typeof result.changed !== 'boolean') {
    return { ok: false, reason: 'unavailable' }
  }
  return { ok: true, changed: result.changed }
}
