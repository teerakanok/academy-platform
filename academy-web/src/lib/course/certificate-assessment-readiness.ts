import 'server-only'

import { getLesson } from '@/lib/content/course-source'
import type { CourseStructure } from '@/lib/content/course-types'
import { isProofBearing } from './assessment-policy'

// The approved certificate assessment requires a bank at least three times the
// five-question serve ceiling. Publishing an internal course cannot bypass this.
export const MIN_CERTIFICATE_ASSESSMENT_BANK = 15

export function certificateAssessmentReady(structure: CourseStructure): boolean {
  const proofNodes = structure.nodes.filter(isProofBearing)
  if (proofNodes.length === 0) return false
  try {
    return proofNodes.every((node) => structure.availableLocales.every((locale) => {
      const resolved = getLesson(structure.slug, node.id, locale)
      if (!resolved) return false
      const questions = resolved.lesson.checkpoint.filter((item) => item.kind === 'mcq')
      return questions.length >= MIN_CERTIFICATE_ASSESSMENT_BANK
        && new Set(questions.map((question) => question.id)).size === questions.length
    }))
  } catch {
    return false
  }
}
