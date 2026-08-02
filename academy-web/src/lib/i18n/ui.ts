// ข้อความของตัวเว็บ (chrome) สองภาษา
//
// แยกจาก "เนื้อหาคอร์ส" โดยสิ้นเชิง — เนื้อหาอยู่ในไฟล์คอร์สและมี locale ของตัวเอง
// ส่วนนี้คือปุ่ม เมนู ป้าย ข้อความสถานะ ซึ่งเป็นของเว็บ ไม่ใช่ของคอร์ส
//
// กฎที่ห้ามผิด: **ภาษาอังกฤษต้องไม่มีคำไทยหลุดเลยแม้แต่คำเดียว** คนต่างชาติที่เปิด
// มาต้องอ่านได้ทั้งหน้า ไม่ใช่เจอลิงก์ภาษาไทยคาอยู่กลางหน้า (เคยหลุดจริงที่ลิงก์
// privacy บน footer) — มีเทสคุมข้อนี้
//
// ภาษาไทยเขียนแบบที่คนไทยพูดจริง ไม่ใช่แปลจากอังกฤษทีละคำ เช่น "เรียนต่อ" ไม่ใช่
// "ดำเนินการเรียนรู้ต่อไป" · "ยังไม่ได้เริ่ม" ไม่ใช่ "ยังมิได้เริ่มต้น"

export type UiLocale = 'en' | 'th'

export const UI_LOCALES: UiLocale[] = ['en', 'th']
export const DEFAULT_UI_LOCALE: UiLocale = 'en'
export const UI_LOCALE_COOKIE = 'academy.lang'

export const UI_LOCALE_LABEL: Record<UiLocale, string> = {
  en: 'English',
  th: 'ไทย',
}

export interface UiStrings {
  nav: { myLearning: string; practice: string; signIn: string; signOut: string; skipToContent: string }
  footer: { privacy: string }
  courses: {
    eyebrow: string
    heading: string
    intro: string
    openToAll: string
    lessons: (n: number) => string
    level: Record<'beginner' | 'intermediate' | 'advanced', string>
  }
  signIn: {
    title: string
    subtitle: string
    emailLabel: string
    emailHelp: string
    sendCode: string
    sending: string
    codeLabel: string
    codeHelp: (email: string) => string
    verify: string
    verifying: string
    otherEmail: string
    browseFirst: string
    browseLink: string
    consent: string
    notOpenEyebrow: string
    notOpenTitle: string
    notOpenBody: string
  }
  video: { audio: string; captionsHint: (labels: string) => string }
  language: { label: string }
}

const en: UiStrings = {
  nav: {
    myLearning: 'My learning',
    practice: 'Practice',
    signIn: 'Sign in',
    signOut: 'Sign out',
    skipToContent: 'Skip to content',
  },
  footer: { privacy: 'Privacy notice' },
  courses: {
    eyebrow: 'CYBERSKILLS Academy',
    heading: 'Courses',
    // ⚠️ "พิสูจน์แล้วข้ามได้" ถูกปิดทั้งคอร์ส (assessment-policy) — ข้อความต้อง
    // ไม่สัญญาเส้นทางที่ยังไม่มี · และต้องบอกตรงๆ ว่าอะไรคือสิ่งที่นับเป็นหลักฐาน
    intro:
      'Each course is a map, not a queue — take the route that fits you. The required checkpoints are what the certificate stands behind, and a lesson you skip stays open until you come back for it.',
    openToAll:
      'Course pages are open to everyone. Taking a course needs a free CYBERSKILLS account, which works across everything we run.',
    lessons: (n) => `${n} lessons`,
    level: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
  },
  signIn: {
    title: 'One CYBERSKILLS account',
    subtitle: 'The same account works across everything we run. Academy now, and the certifications we issue later.',
    emailLabel: 'Email address',
    emailHelp: 'We send a six-digit code. There is no password to set.',
    sendCode: 'Send me a code',
    sending: 'Sending…',
    codeLabel: 'Enter the code',
    codeHelp: (email) => `Sent to ${email}. It expires in an hour.`,
    verify: 'Continue',
    verifying: 'Checking…',
    otherEmail: 'Use a different email',
    browseFirst: 'You can',
    browseLink: 'look through the courses',
    consent: 'By continuing you agree to how we handle your data.',
    notOpenEyebrow: 'Preview',
    notOpenTitle: 'Accounts are not open yet',
    notOpenBody: 'You can read the course pages in this build. Sign-in opens when the platform launches.',
  },
  video: {
    audio: 'Audio',
    captionsHint: (labels) => `Subtitles in ${labels} are available from the CC button on the player.`,
  },
  language: { label: 'Language' },
}

const th: UiStrings = {
  nav: {
    myLearning: 'คอร์สของฉัน',
    practice: 'ทำข้อสอบ',
    signIn: 'เข้าสู่ระบบ',
    signOut: 'ออกจากระบบ',
    skipToContent: 'ข้ามไปที่เนื้อหา',
  },
  footer: { privacy: 'นโยบายความเป็นส่วนตัว' },
  courses: {
    eyebrow: 'CYBERSKILLS Academy',
    heading: 'คอร์สทั้งหมด',
    intro:
      'แต่ละคอร์สเป็นแผนที่ ไม่ใช่คิวที่ต้องไล่ตามลำดับ เลือกเส้นทางที่เหมาะกับคุณได้ · ด่านบังคับคือสิ่งที่ใบรับรองยืนยัน ส่วนบทที่ข้ามไว้จะค้างอยู่จนกว่าจะกลับมาทำ',
    openToAll:
      'หน้าคอร์สเปิดให้ทุกคนอ่าน ส่วนการเข้าเรียนต้องมีบัญชี CYBERSKILLS ซึ่งสมัครฟรีและใช้ได้กับทุกบริการของเรา',
    lessons: (n) => `${n} บท`,
    level: { beginner: 'เริ่มต้น', intermediate: 'ระดับกลาง', advanced: 'ขั้นสูง' },
  },
  signIn: {
    title: 'บัญชีเดียว ใช้ได้ทุกบริการ',
    subtitle: 'บัญชี CYBERSKILLS ใบเดียวใช้ได้กับทุกอย่างที่เราทำ ตอนนี้คือ Academy และต่อไปคือใบรับรองที่เราออกเอง',
    emailLabel: 'อีเมล',
    emailHelp: 'เราจะส่งรหัส 6 หลักไปให้ ไม่ต้องตั้งรหัสผ่าน',
    sendCode: 'ส่งรหัสให้ฉัน',
    sending: 'กำลังส่ง…',
    codeLabel: 'ใส่รหัสที่ได้รับ',
    codeHelp: (email) => `ส่งไปที่ ${email} แล้ว รหัสใช้ได้ภายในหนึ่งชั่วโมง`,
    verify: 'ไปต่อ',
    verifying: 'กำลังตรวจ…',
    otherEmail: 'ใช้อีเมลอื่น',
    browseFirst: 'ยังไม่อยากสมัครก็',
    browseLink: 'ดูคอร์สก่อนได้',
    consent: 'การกดไปต่อถือว่าคุณรับทราบวิธีที่เราเก็บและใช้ข้อมูลของคุณ',
    notOpenEyebrow: 'รุ่นทดลอง',
    notOpenTitle: 'ยังไม่เปิดให้สมัคร',
    notOpenBody: 'ตอนนี้อ่านหน้าคอร์สได้ก่อน ส่วนการสมัครจะเปิดตอนที่ระบบพร้อมใช้จริง',
  },
  video: {
    audio: 'เสียง',
    captionsHint: (labels) => `มีคำบรรยาย ${labels} เปิดได้จากปุ่ม CC บนตัวเล่น`,
  },
  language: { label: 'ภาษา' },
}

export const UI: Record<UiLocale, UiStrings> = { en, th }

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'th'
}
