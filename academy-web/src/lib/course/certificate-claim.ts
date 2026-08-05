export const CERTIFICATE_TITLE = 'Certificate of Course Completion'

export function certificateTitle(courseTitle: string): string {
  return `${CERTIFICATE_TITLE}: ${courseTitle}`
}

export const CERTIFICATE_ACHIEVEMENT_STATEMENT =
  'Completed all course requirements and passed every required assessed checkpoint.'

export const CERTIFICATE_SCOPE_DISCLAIMER = 'This is not a professional certification.'

export const CERTIFICATE_COMPLETE_PREVIEW =
  `A shareable ${CERTIFICATE_TITLE} with public verification is planned for a later release. ` +
  `It will recognize assessed completion of this course; it is separate from a professional certification.`

export const CERTIFICATE_INCOMPLETE_PREVIEW =
  `A shareable ${CERTIFICATE_TITLE} with public verification is planned for a later release. ` +
  `Finish every lesson and pass every required assessed checkpoint to complete its course record.`
