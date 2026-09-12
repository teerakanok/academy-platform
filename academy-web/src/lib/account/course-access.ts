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
import { getEffectiveCourseAvailability } from '@/lib/course/settings'
import { emitAcademySecurityEvent } from '@/lib/security/security-events'
import { safeErrorMessage } from '@/lib/safe-log'

export type CourseAccess =
  | { allowed: true }
  | { allowed: false; reason: 'inactive' | 'not-entitled' | 'locked' | 'retired' | 'unavailable' }

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
    const access = isServiceUsable(activation)
      ? ({ allowed: true } as const)
      : ({ allowed: false, reason: 'inactive' } as const)
    emitAccessDecision('service_access', access)
    return access
  } catch (error) {
    console.error('[course-access] อ่าน service activation ไม่สำเร็จ:', safeErrorMessage(error))
    return emitUnavailableDecision('service_access')
  }
}

/** ประตูเดียวของ content path: ต้องเปิดใช้ Academy และมี entitlement ของคอร์สพร้อมกัน */
export async function getCourseAccess(userId: string, courseSlug: string): Promise<CourseAccess> {
  return getCourseAccessDecision(userId, courseSlug, true)
}

async function getCourseAccessDecision(
  userId: string,
  courseSlug: string,
  emitEvent: boolean,
): Promise<CourseAccess> {
  try {
    const availability = await getEffectiveCourseAvailability(courseSlug)
    if (!availability || availability.visibility === 'retired') {
      return emitCourseDecision('course_access', { allowed: false, reason: 'retired' }, emitEvent)
    }
    const activation = await getActivation(userId)
    if (!isServiceUsable(activation)) {
      return emitCourseDecision('course_access', { allowed: false, reason: 'inactive' }, emitEvent)
    }
    const access = decideCourseAccess(activation, await hasCourseEntitlement(userId, courseSlug))
    return emitCourseDecision('course_access', access, emitEvent)
  } catch (error) {
    console.error('[course-access] ตรวจ course entitlement ไม่สำเร็จ:', safeErrorMessage(error))
    return emitUnavailableDecision('course_access', emitEvent)
  }
}

/** ตรวจครบถึง resource authorization เพื่อให้ direct URL/API ข้าม prerequisite ไม่ได้ */
export async function authorizeCourseResource(
  userId: string,
  courseSlug: string,
  nodeId?: string,
): Promise<CourseAccess> {
  const courseAccess = await getCourseAccessDecision(userId, courseSlug, false)
  if (!courseAccess.allowed || !nodeId) {
    return emitCourseDecision('course_resource', courseAccess)
  }

  const structure = getCourseStructure(courseSlug)
  const node = structure?.nodes.find((candidate) => candidate.id === nodeId)
  if (!structure || !node) return emitCourseDecision('course_resource', { allowed: false, reason: 'locked' })

  try {
    const progress = await loadProgress(userId, courseSlug)
    const access: CourseAccess = nodeStatus(node, toLearnerState(progress)) === 'locked'
      ? { allowed: false, reason: 'locked' }
      : { allowed: true }
    return emitCourseDecision('course_resource', access)
  } catch (error) {
    console.error('[course-access] ตรวจ node prerequisite ไม่สำเร็จ:', safeErrorMessage(error))
    return emitUnavailableDecision('course_resource')
  }
}

function emitCourseDecision(
  event: 'course_access' | 'course_resource',
  access: CourseAccess,
  emitEvent = true,
): CourseAccess {
  if (!emitEvent) return access
  emitAccessDecision(event, access)
  return access
}

function emitUnavailableDecision(
  event: 'service_access' | 'course_access' | 'course_resource',
  emitEvent = true,
): { allowed: false; reason: 'unavailable' } {
  const access = { allowed: false, reason: 'unavailable' } as const
  if (!emitEvent) return access
  emitAccessDecision(event, access)
  return access
}

function emitAccessDecision(
  event: 'service_access' | 'course_access' | 'course_resource',
  access: CourseAccess,
): void {
  const reason = access.allowed ? 'allowed' : normalizedAccessReason(access.reason)
  emitAcademySecurityEvent({
    event,
    outcome: access.allowed ? 'success' : 'failure',
    reason,
  })
}

function normalizedAccessReason(reason: Exclude<CourseAccess, { allowed: true }>['reason']) {
  if (reason === 'not-entitled') return 'not_entitled'
  return reason
}

export function deniedAccessStatus(
  access: Exclude<CourseAccess, { allowed: true }>,
): 403 | 404 | 503 {
  if (access.reason === 'unavailable') return 503
  return access.reason === 'retired' ? 404 : 403
}
