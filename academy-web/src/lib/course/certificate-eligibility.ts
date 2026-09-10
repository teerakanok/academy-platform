import 'server-only'

import { academyDb } from '@/lib/db/server'
import { getCourseStructure } from '@/lib/content/course-source'
import { toLearnerState } from '@/lib/course/progress'
import { loadProgress } from '@/lib/course/progress-db'
import { courseRecordSummary, type CourseRecordSummary } from '@/lib/course/roadmap'
import { isProofBearing } from '@/lib/course/assessment-policy'
import { safeErrorMessage } from '@/lib/safe-log'

/**
 * Evidence-based certificate eligibility (W4 of the approved claim).
 *
 * `courseRecordSummary` judges from progress status; the certificate claim
 * forbids issuing on status alone. This module re-verifies the layer the
 * certificate actually cites: every proof-bearing node must hold a
 * `passed_attempt_id` pointer AND the referenced attempt row must still exist
 * with matching ownership. The issued record snapshots the evidence so later
 * content changes cannot rewrite what a certificate says.
 */
export type CertificateEligibility =
  | { eligible: true; summary: CourseRecordSummary; courseVersion: string; passedAttempts: Record<string, string> }
  | { eligible: false; summary: CourseRecordSummary; courseVersion: string }

export async function certificateEligibility(
  userId: string,
  courseSlug: string,
): Promise<CertificateEligibility | { unavailable: true; reason: string }> {
  try {
    const structure = getCourseStructure(courseSlug)
    if (!structure) return { unavailable: true, reason: 'course-not-found' }
    const record = await loadProgress(userId, courseSlug)
    const summary = courseRecordSummary(structure, toLearnerState(record))
    const courseVersion = structure.version

    if (!summary.recordComplete) {
      return { eligible: false, summary, courseVersion }
    }

    const proofNodes = structure.nodes.filter((node) => isProofBearing(node))
    const db = academyDb()
    const passedAttempts: Record<string, string> = {}
    for (const node of proofNodes) {
      const { data: progress, error: progressError } = await db
        .from('node_progress')
        .select('passed_attempt_id')
        .eq('user_id', userId)
        .eq('course_slug', courseSlug)
        .eq('node_id', node.id)
        .maybeSingle()
      if (progressError) throw new Error(`อ่านหลักฐานด่านวัดผลไม่สำเร็จ: ${progressError.message}`)
      const attemptId = progress?.passed_attempt_id as string | null | undefined
      if (!attemptId) return { eligible: false, summary, courseVersion }
      const { data: attempt, error: attemptError } = await db
        .from('attempt')
        .select('attempt_id')
        .eq('attempt_id', attemptId)
        .eq('user_id', userId)
        .eq('course_slug', courseSlug)
        .eq('node_id', node.id)
        .maybeSingle()
      if (attemptError) throw new Error(`ตรวจหลักฐานด่านวัดผลไม่สำเร็จ: ${attemptError.message}`)
      if (!attempt) return { eligible: false, summary, courseVersion }
      passedAttempts[node.id] = attemptId
    }
    return { eligible: true, summary, courseVersion, passedAttempts }
  } catch (error) {
    console.error('[certificate-eligibility] ตรวจเงื่อนไขใบรับรองไม่สำเร็จ:', safeErrorMessage(error))
    return { unavailable: true, reason: 'eligibility-check-failed' }
  }
}

/** Snapshot stored on the issued record: what the certificate cites, frozen. */
export function certificateEvidenceSnapshot(
  eligibility: Extract<CertificateEligibility, { eligible: true }>,
): {
  assessedPassed: number
  assessedTotal: number
  lessonsFinished: number
  total: number
  passedAttempts: Record<string, string>
} {
  return {
    assessedPassed: eligibility.summary.assessedPassed,
    assessedTotal: eligibility.summary.assessedTotal,
    lessonsFinished: eligibility.summary.lessonsFinished,
    total: eligibility.summary.total,
    passedAttempts: eligibility.passedAttempts,
  }
}
