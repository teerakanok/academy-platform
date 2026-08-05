import { describe, expect, it } from 'vitest'
import {
  CERTIFICATE_ACHIEVEMENT_STATEMENT,
  CERTIFICATE_COMPLETE_PREVIEW,
  CERTIFICATE_INCOMPLETE_PREVIEW,
  CERTIFICATE_SCOPE_DISCLAIMER,
  CERTIFICATE_TITLE,
  certificateTitle,
} from '@/lib/course/certificate-claim'

describe('Academy certificate claim contract', () => {
  it('names course completion and the assessed requirement without claiming mastery', () => {
    const claim = `${CERTIFICATE_TITLE} ${CERTIFICATE_ACHIEVEMENT_STATEMENT} ${CERTIFICATE_SCOPE_DISCLAIMER}`
    expect(CERTIFICATE_TITLE).toBe('Certificate of Course Completion')
    expect(certificateTitle('Linux Foundations')).toBe('Certificate of Course Completion: Linux Foundations')
    expect(CERTIFICATE_ACHIEVEMENT_STATEMENT).toContain('all course requirements')
    expect(CERTIFICATE_ACHIEVEMENT_STATEMENT).toContain('every required assessed checkpoint')
    expect(CERTIFICATE_SCOPE_DISCLAIMER).toBe('This is not a professional certification.')
    expect(claim).not.toMatch(/mastery|mastered|job.ready|skills certified/i)
  })

  it('previews lead with the learner state and never say a certificate was issued', () => {
    expect(CERTIFICATE_COMPLETE_PREVIEW).toMatch(/^A shareable Certificate of Course Completion/)
    expect(CERTIFICATE_COMPLETE_PREVIEW).toContain('assessed completion of this course')
    expect(CERTIFICATE_COMPLETE_PREVIEW).toContain('separate from a professional certification')
    expect(CERTIFICATE_INCOMPLETE_PREVIEW).toMatch(/^A shareable Certificate of Course Completion/)
    expect(CERTIFICATE_INCOMPLETE_PREVIEW).toContain('Finish every lesson')
    expect(`${CERTIFICATE_COMPLETE_PREVIEW} ${CERTIFICATE_INCOMPLETE_PREVIEW}`).not.toMatch(/earned|issued|download/i)
  })
})
