import { academyDb } from '@/lib/db/server'
import type { ActivationStatus, ExchangeResult } from '@/lib/identity/adapter'

// สี่ชั้นสถานะตามทิศทาง Identity Control — และชั้นก่อนหน้าไม่เคยแปลว่าได้ชั้นถัดไป
//
//   account exists → service activation → product entitlement → resource authorization
//
// ไฟล์นี้ดูแลสองชั้นกลาง ส่วนชั้นแรกอยู่ที่ Identity Control และชั้นสุดท้าย
// (บทไหนปลดล็อกแล้ว) อยู่ที่ roadmap/progress ซึ่งคำนวณจาก DAG
//
// เหตุผลที่ต้องแยกให้ขาดในโค้ด ไม่ใช่แค่ในเอกสาร: ถ้าเขียนรวมกันเมื่อไร มันจะกลาย
// เป็น "ล็อกอินได้ = เข้าได้ทุกอย่าง" โดยไม่มีใครตั้งใจ และจะไม่มีใครสังเกตจนกว่าจะมี
// คอร์สเสียเงิน

export interface ActivationRecord {
  status: ActivationStatus
  revision: number
}

/** บันทึกสถานะการเปิดใช้บริการที่ Identity Control บอกมา — เราไม่ได้เป็นคนตัดสิน */
export async function syncActivation(userId: string, result: ExchangeResult): Promise<void> {
  const db = academyDb()
  const { error } = await db.rpc('sync_service_activation', {
    p_user_id: userId,
    p_status: result.activation.status,
    p_revision: result.activation.revision,
  })
  if (error) throw new Error(`บันทึกสถานะการเปิดใช้บริการไม่สำเร็จ: ${error.message}`)
}

export async function getActivation(userId: string): Promise<ActivationRecord | null> {
  const db = academyDb()
  const { data, error } = await db
    .from('service_activation')
    .select('status, revision')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`อ่านสถานะการเปิดใช้บริการไม่สำเร็จ: ${error.message}`)
  return data ? { status: data.status as ActivationStatus, revision: data.revision as number } : null
}

/** เปิดใช้บริการอยู่ = เข้าเว็บได้ · **ไม่ได้แปลว่าเข้าคอร์สไหนได้** */
export function isServiceUsable(activation: ActivationRecord | null): boolean {
  return activation?.status === 'active'
}

export type EntitlementSource = 'free' | 'purchase' | 'invitation' | 'grant'

/**
 * มีสิทธิ์เข้าคอร์สนี้ไหม — คำถามคนละข้อกับ "เปิดใช้บริการแล้วหรือยัง"
 *
 * ทุกเส้นทางที่ปล่อยเนื้อหาต้องถามผ่านฟังก์ชันนี้ ไม่ใช่เดาจากการที่มี session
 * (middleware เป็นชั้นแรกได้ แต่ห้ามเป็นชั้นสุดท้าย — ทิศทางระบุไว้ตรงๆ)
 */
export async function hasCourseEntitlement(userId: string, courseSlug: string): Promise<boolean> {
  const db = academyDb()
  const { data, error } = await db.rpc('has_course_entitlement', {
    p_user_id: userId,
    p_course_slug: courseSlug,
  })
  if (error) throw new Error(`ตรวจสิทธิ์เข้าคอร์สไม่สำเร็จ: ${error.message}`)
  return data === true
}
