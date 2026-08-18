import {
  getActivation,
  hasCourseEntitlement,
  isServiceUsable,
  type ActivationRecord,
} from './access'
import { getCourseStructure } from '@/lib/content/course-source'
import { loadProgress } from '@/lib/course/progress-db'
import { toLearnerState } from '@/lib/course/progress'
import { nodeStatus } from '@/lib/course/roadmap'
import { safeErrorMessage } from '@/lib/safe-log'

export type CourseAccess =
  | { allowed: true }
  | { allowed: false; reason: 'inactive' | 'not-entitled' | 'locked' | 'unavailable' }

export function decideCourseAccess(
  activation: ActivationRecord | null,
  entitled: boolean,
): CourseAccess {
  if (!isServiceUsable(activation)) return { allowed: false, reason: 'inactive' }
  if (!entitled) return { allowed: false, reason: 'not-entitled' }
  return { allowed: true }
}

/** ชั้น service activation แยกไว้ให้ dashboard/รายการ progress ใช้โดยไม่เดาสถานะเอง */
export async function getServiceAccess(userId: string): Promise<CourseAccess> {
  try {
    const activation = await getActivation(userId)
    return isServiceUsable(activation) ? { allowed: true } : { allowed: false, reason: 'inactive' }
  } catch (error) {
    console.error('[course-access] อ่าน service activation ไม่สำเร็จ:', safeErrorMessage(error))
    return { allowed: false, reason: 'unavailable' }
  }
}

/** ประตูเดียวของ content path: ต้องเปิดใช้ Academy และมี entitlement ของคอร์สพร้อมกัน */
export async function getCourseAccess(userId: string, courseSlug: string): Promise<CourseAccess> {
  try {
    const activation = await getActivation(userId)
    if (!isServiceUsable(activation)) return { allowed: false, reason: 'inactive' }
    return decideCourseAccess(activation, await hasCourseEntitlement(userId, courseSlug))
  } catch (error) {
    console.error('[course-access] ตรวจ course entitlement ไม่สำเร็จ:', safeErrorMessage(error))
    return { allowed: false, reason: 'unavailable' }
  }
}

/** ตรวจครบถึง resource authorization เพื่อให้ direct URL/API ข้าม prerequisite ไม่ได้ */
export async function authorizeCourseResource(
  userId: string,
  courseSlug: string,
  nodeId?: string,
): Promise<CourseAccess> {
  const courseAccess = await getCourseAccess(userId, courseSlug)
  if (!courseAccess.allowed || !nodeId) return courseAccess

  const structure = getCourseStructure(courseSlug)
  const node = structure?.nodes.find((candidate) => candidate.id === nodeId)
  if (!structure || !node) return { allowed: false, reason: 'locked' }

  try {
    const progress = await loadProgress(userId, courseSlug)
    return nodeStatus(node, toLearnerState(progress)) === 'locked'
      ? { allowed: false, reason: 'locked' }
      : { allowed: true }
  } catch (error) {
    console.error('[course-access] ตรวจ node prerequisite ไม่สำเร็จ:', safeErrorMessage(error))
    return { allowed: false, reason: 'unavailable' }
  }
}

export function deniedAccessStatus(access: Exclude<CourseAccess, { allowed: true }>): 403 | 503 {
  return access.reason === 'unavailable' ? 503 : 403
}
