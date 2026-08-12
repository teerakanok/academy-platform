import type { Locale } from '@/lib/content/course-types'

type AccessIssue = 'signed-out' | 'access-lost' | 'unavailable' | 'reset-completed-unavailable'
type RoadmapStatus = 'completed' | 'tested-out' | 'skipped' | 'in-progress' | 'available' | 'locked'

export type LearnerCourseUi = {
  timeSummary: (hours: number, minutes: number, lessons: number, checkpoints: number) => string
  untranslated: (translated: number, total: number, locale: Locale, fallback: Locale) => string
  start: string
  continue: string
  accessIssue: Record<AccessIssue, string>
  retry: string
  outcomesHeading: string
  progressUnconfirmed: string
  progressLoading: string
  roadmapHeading: string
  roadmapSummary: (done: number, total: number, skipped: number) => string
  roadmapIntro: string
  roadmapUnavailable: string
  learningRecord: string
  recordHeading: (complete: boolean) => string
  checkpointCount: (passed: number, total: number) => string
  recordBody: (complete: boolean) => string
  noAssessment: string
  certificatePreview: (complete: boolean) => string
  lessonsFinished: (finished: number, total: number) => string
  skippedBlockers: (count: number) => string
  openBlocker: string
  moreBlockers: (count: number) => string
  roadmap: {
    status: Record<RoadmapStatus, string>
    required: string
    lockedUntil: (titles: string) => string
    accessibleLabel: (title: string, status: string, required: boolean, minutes: number) => string
    doneLegend: string
    testedOutLegend: string
    skippedLegend: string
    readyLegend: string
    requiredLegend: string
  }
  reset: {
    trigger: string
    title: string
    successTitle: string
    warning: string
    attempts: string
    submitting: string
    success: string
    unknown: string
    accessLost: string
    completedUnavailable: string
    keep: string
    confirm: string
    submittingButton: string
    close: string
    check: string
    done: string
  }
}

const en: LearnerCourseUi = {
  timeSummary: (hours, minutes, lessons, checkpoints) =>
    `${hours}h ${minutes}m · ${lessons} lessons · ${checkpoints} required checkpoints`,
  untranslated: (translated, total, locale, fallback) =>
    `${translated} of ${total} learning steps are available in ${locale.toUpperCase()}. The rest open in ${fallback.toUpperCase()} and are labelled before you enter.`,
  start: 'Start the first lesson',
  continue: 'Continue',
  accessIssue: {
    'signed-out': 'Sign in again to load your learning record. Progress is hidden until it can be confirmed.',
    'access-lost': 'This course is no longer in your active Academy access. Your learning record is unchanged.',
    unavailable: 'We could not load your course access. Your learning record is unchanged.',
    'reset-completed-unavailable': 'Your reset completed, but we could not load your latest learning record. Try again to refresh it.',
  },
  retry: 'Try again',
  outcomesHeading: 'What you will be able to do',
  progressUnconfirmed: 'Course progress will appear after your account and learning record can be confirmed.',
  progressLoading: 'Loading your learning record…',
  roadmapHeading: 'Your route through this course',
  roadmapSummary: (done, total, skipped) => `${done}/${total} lessons done${skipped > 0 ? ` · ${skipped} skipped` : ''}`,
  roadmapIntro: 'Lessons unlock as you clear what comes before them. You can skip an ordinary lesson and take its summary instead — required checkpoints are the exception, and they have to be earned.',
  roadmapUnavailable: 'The lesson roadmap is unavailable until course access can be confirmed.',
  learningRecord: 'Learning record',
  recordHeading: (complete) => complete
    ? 'Course record complete — every required checkpoint passed'
    : 'Finish the lessons and pass every required checkpoint',
  checkpointCount: (passed, total) => `${passed} / ${total} checkpoints`,
  recordBody: (complete) => complete
    ? 'Your learning record shows every lesson finished and every required checkpoint passed.'
    : 'A complete course record needs every lesson finished and every required checkpoint passed. Passing required checkpoints provides the assessed evidence.',
  noAssessment: 'This course needs at least one required checkpoint before its completion record can be final. We are adding one.',
  certificatePreview: (complete) => complete
    ? 'A shareable Certificate of Course Completion with public verification is planned for a later release. It will recognize assessed completion of this course; it is separate from a professional certification.'
    : 'A shareable Certificate of Course Completion with public verification is planned for a later release. Finish every lesson and pass every required assessed checkpoint to complete its course record.',
  lessonsFinished: (finished, total) => `Lessons finished: ${finished} / ${total}`,
  skippedBlockers: (count) => `${count === 1 ? 'One lesson you skipped is' : `${count} lessons you skipped are`} still open. ${count === 1 ? 'Its checkpoint is' : 'Their checkpoints are'} quick if you already know the material.`,
  openBlocker: 'Open: ',
  moreBlockers: (count) => `+${count} more`,
  roadmap: {
    status: {
      completed: 'Done',
      'tested-out': 'Tested out',
      skipped: 'Skipped',
      'in-progress': 'In progress',
      available: 'Ready',
      locked: 'Locked',
    },
    required: 'required',
    lockedUntil: (titles) => `Locked until you clear: ${titles}`,
    accessibleLabel: (title, status, required, minutes) =>
      `${title} — ${status}${required ? ', required checkpoint' : ''}, ${minutes} minutes`,
    doneLegend: 'Done, you worked through it',
    testedOutLegend: 'Tested out before this route was paused',
    skippedLegend: 'Skipped, still open',
    readyLegend: 'Ready to start',
    requiredLegend: 'Hexagon = required checkpoint, cannot be skipped',
  },
  reset: {
    trigger: 'Reset my progress',
    title: 'Reset course progress?',
    successTitle: 'Progress reset',
    warning: 'This permanently removes your lesson progress, checkpoint results, and certificate evidence for this course.',
    attempts: 'Checkpoint attempts already issued and retry limits are not restored.',
    submitting: 'Resetting your course progress…',
    success: 'Progress reset. This course is ready to start again.',
    unknown: 'We could not confirm whether the reset completed. Check the reset status again, or close and review your current progress before deciding what to do next.',
    accessLost: 'Your Academy access changed before the reset. Your progress was not reset.',
    completedUnavailable: 'The reset completed, but we could not load your current learning record. Close this message and try loading the course again.',
    keep: 'Keep my progress',
    confirm: 'Reset course progress',
    submittingButton: 'Resetting…',
    close: 'Close',
    check: 'Check reset status',
    done: 'Done',
  },
}

const th: LearnerCourseUi = {
  timeSummary: (hours, minutes, lessons, checkpoints) =>
    `${hours} ชม. ${minutes} นาที · ${lessons} บท · ${checkpoints} ด่านบังคับ`,
  untranslated: (translated, total, locale, fallback) =>
    `${locale.toUpperCase()} พร้อมสำหรับ ${translated} จาก ${total} ขั้นการเรียน ขั้นที่เหลือจะเปิดเป็น ${fallback.toUpperCase()} และมีป้ายบอกก่อนเข้า`,
  start: 'เริ่มบทแรก',
  continue: 'เรียนต่อ',
  accessIssue: {
    'signed-out': 'เข้าสู่ระบบอีกครั้งเพื่อโหลดประวัติการเรียน ระบบจะซ่อนความคืบหน้าจนกว่าจะยืนยันได้',
    'access-lost': 'คอร์สนี้ไม่อยู่ในสิทธิ์ Academy ที่ใช้งานอยู่แล้ว ประวัติการเรียนของคุณไม่เปลี่ยนแปลง',
    unavailable: 'โหลดสิทธิ์เข้าเรียนไม่ได้ ประวัติการเรียนของคุณไม่เปลี่ยนแปลง',
    'reset-completed-unavailable': 'ล้างความคืบหน้าแล้ว แต่ยังโหลดประวัติล่าสุดไม่ได้ ลองอีกครั้งเพื่อรีเฟรชข้อมูล',
  },
  retry: 'ลองอีกครั้ง',
  outcomesHeading: 'เมื่อจบคอร์สนี้ คุณจะทำสิ่งเหล่านี้ได้',
  progressUnconfirmed: 'ความคืบหน้าจะแสดงเมื่อยืนยันบัญชีและประวัติการเรียนได้แล้ว',
  progressLoading: 'กำลังโหลดประวัติการเรียน…',
  roadmapHeading: 'เส้นทางการเรียนของคุณ',
  roadmapSummary: (done, total, skipped) => `เรียนจบ ${done}/${total} บท${skipped > 0 ? ` · ข้ามไว้ ${skipped} บท` : ''}`,
  roadmapIntro: 'แต่ละบทจะเปิดเมื่อผ่านสิ่งที่ต้องเรียนก่อนหน้า บทธรรมดาข้ามไปอ่านสรุปได้ ส่วนด่านบังคับต้องทำให้ผ่าน',
  roadmapUnavailable: 'ยังแสดงเส้นทางบทเรียนไม่ได้จนกว่าจะยืนยันสิทธิ์เข้าเรียน',
  learningRecord: 'ประวัติการเรียน',
  recordHeading: (complete) => complete
    ? 'ประวัติคอร์สสมบูรณ์ — ผ่านด่านบังคับครบแล้ว'
    : 'เรียนให้ครบและผ่านด่านบังคับทุกด่าน',
  checkpointCount: (passed, total) => `ผ่าน ${passed} / ${total} ด่าน`,
  recordBody: (complete) => complete
    ? 'ประวัติการเรียนแสดงว่าคุณเรียนจบทุกบทและผ่านด่านบังคับครบแล้ว'
    : 'ประวัติคอร์สจะสมบูรณ์เมื่อเรียนจบทุกบทและผ่านด่านบังคับครบ ผลจากด่านบังคับคือหลักฐานที่ใช้ประเมิน',
  noAssessment: 'คอร์สนี้ต้องมีด่านบังคับอย่างน้อยหนึ่งด่านก่อนปิดประวัติการเรียนได้ เรากำลังเพิ่มด่านดังกล่าว',
  certificatePreview: (complete) => complete
    ? 'ใบรับรองการจบคอร์สที่แชร์และตรวจสอบสาธารณะได้มีแผนเปิดในรุ่นถัดไป ใบนี้รับรองการจบคอร์สตามด่านประเมิน ไม่ใช่ใบรับรองวิชาชีพ'
    : 'ใบรับรองการจบคอร์สที่แชร์และตรวจสอบสาธารณะได้มีแผนเปิดในรุ่นถัดไป เรียนให้ครบและผ่านด่านประเมินทุกด่านเพื่อให้ประวัติคอร์สสมบูรณ์',
  lessonsFinished: (finished, total) => `เรียนจบแล้ว: ${finished} / ${total} บท`,
  skippedBlockers: (count) => `${count === 1 ? 'บทที่ข้ามไว้ 1 บท' : `บทที่ข้ามไว้ ${count} บท`} ยังกลับมาเรียนได้ ด่านของบทเหล่านี้ใช้เวลาไม่นานหากคุณรู้เนื้อหาอยู่แล้ว`,
  openBlocker: 'เปิด: ',
  moreBlockers: (count) => `+อีก ${count} บท`,
  roadmap: {
    status: {
      completed: 'เรียนจบ',
      'tested-out': 'ผ่านจากการทดสอบ',
      skipped: 'ข้ามไว้',
      'in-progress': 'กำลังเรียน',
      available: 'พร้อมเรียน',
      locked: 'ยังไม่เปิด',
    },
    required: 'ด่านบังคับ',
    lockedUntil: (titles) => `เปิดเมื่อผ่าน: ${titles}`,
    accessibleLabel: (title, status, required, minutes) =>
      `${title} — ${status}${required ? ', ด่านบังคับ' : ''}, ${minutes} นาที`,
    doneLegend: 'เรียนจบแล้ว',
    testedOutLegend: 'ผ่านจากการทดสอบก่อนพักเส้นทางนี้',
    skippedLegend: 'ข้ามไว้ ยังกลับมาเรียนได้',
    readyLegend: 'พร้อมเริ่ม',
    requiredLegend: 'รูปหกเหลี่ยม = ด่านบังคับ ข้ามไม่ได้',
  },
  reset: {
    trigger: 'เริ่มความคืบหน้าใหม่',
    title: 'เริ่มความคืบหน้าคอร์สใหม่?',
    successTitle: 'ล้างความคืบหน้าแล้ว',
    warning: 'การทำเช่นนี้จะลบความคืบหน้าของบท ผลด่านบังคับ และหลักฐานสำหรับใบรับรองของคอร์สนี้อย่างถาวร',
    attempts: 'จำนวนครั้งที่ใช้ทำด่านบังคับและโควตาการลองใหม่จะไม่คืนกลับ',
    submitting: 'กำลังล้างความคืบหน้าคอร์ส…',
    success: 'ล้างความคืบหน้าแล้ว คอร์สนี้พร้อมให้เริ่มเรียนใหม่',
    unknown: 'ยังยืนยันไม่ได้ว่าล้างความคืบหน้าสำเร็จหรือไม่ ตรวจสถานะอีกครั้ง หรือปิดหน้าต่างนี้แล้วดูความคืบหน้าปัจจุบันก่อนตัดสินใจ',
    accessLost: 'สิทธิ์ Academy เปลี่ยนก่อนล้างความคืบหน้า จึงยังไม่ได้ลบข้อมูลการเรียนของคุณ',
    completedUnavailable: 'ล้างความคืบหน้าแล้ว แต่ยังโหลดประวัติปัจจุบันไม่ได้ ปิดข้อความนี้แล้วลองเปิดคอร์สอีกครั้ง',
    keep: 'เก็บความคืบหน้าไว้',
    confirm: 'ล้างความคืบหน้าคอร์ส',
    submittingButton: 'กำลังล้าง…',
    close: 'ปิด',
    check: 'ตรวจสถานะการล้าง',
    done: 'เรียบร้อย',
  },
}

export function learnerCourseUi(locale: Locale): LearnerCourseUi {
  return locale === 'th' ? th : en
}
