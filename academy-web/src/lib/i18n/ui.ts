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
  nav: {
    main: string
    myLearning: string
    practice: string
    signIn: string
    signOut: string
    signingOut: string
    signOutError: string
    skipToContent: string
  }
  footer: { privacy: string }
  courses: {
    eyebrow: string
    heading: string
    intro: string
    openToAll: string
    lessons: (n: number) => string
    checkpoints: (n: number) => string
    level: Record<'beginner' | 'intermediate' | 'advanced', string>
    searchLabel: string
    searchPlaceholder: string
    levelFilter: { legend: string; all: string }
    resultCount: (count: number) => string
    noResultsHeading: string
    noResultsBody: string
    clearFilters: string
    emptyHeading: string
    emptyBody: string
    updates: string
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
  video: { audio: string; captionsHint: (labels: string) => string; unavailable: string; retry: string }
  language: { label: string }
  theme: { switchToLight: string; switchToDark: string }
}

const en: UiStrings = {
  nav: {
    main: 'Main',
    myLearning: 'My learning',
    practice: 'Practice',
    signIn: 'Sign in',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
    signOutError: 'Could not sign out. Your session may still be active. Try again.',
    skipToContent: 'Skip to content',
  },
  footer: { privacy: 'Privacy notice' },
  courses: {
    eyebrow: 'CYBERSKILLS Academy',
    heading: 'Course previews',
    intro: 'See each course route before learning access opens: the lessons, prerequisite order, and required checkpoints.',
    openToAll: 'Previews are open to everyone. Learning access will open with a CYBERSKILLS account.',
    lessons: (n) => `${n} lessons`,
    checkpoints: (n) => `${n} required checkpoint${n === 1 ? '' : 's'}`,
    level: { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' },
    searchLabel: 'Search courses',
    searchPlaceholder: 'Search by title or short description',
    levelFilter: { legend: 'Level', all: 'All levels' },
    resultCount: (count) => `${count} ${count === 1 ? 'course' : 'courses'}`,
    noResultsHeading: 'No matching courses',
    noResultsBody: 'Try another search term or choose a different level.',
    clearFilters: 'Clear search and level filters',
    emptyHeading: 'Course previews are being prepared',
    emptyBody: 'There are no public course previews at the moment. Get launch updates when the next route is ready.',
    updates: 'Get launch updates',
  },
  signIn: {
    title: 'One CYBERSKILLS account',
    subtitle:
      'Your CYBERSKILLS account keeps your Academy learning record with you across devices.',
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
    unavailable: 'The video could not be loaded. Check your connection and try again.',
    retry: 'Reload video',
  },
  language: { label: 'Language' },
  theme: { switchToLight: 'Switch to light theme', switchToDark: 'Switch to dark theme' },
}

const th: UiStrings = {
  nav: {
    main: 'เมนูหลัก',
    myLearning: 'คอร์สของฉัน',
    practice: 'ทำข้อสอบ',
    signIn: 'เข้าสู่ระบบ',
    signOut: 'ออกจากระบบ',
    signingOut: 'กำลังออกจากระบบ…',
    signOutError: 'ออกจากระบบไม่สำเร็จ เซสชันอาจยังใช้งานอยู่ ลองอีกครั้ง',
    skipToContent: 'ข้ามไปที่เนื้อหา',
  },
  footer: { privacy: 'นโยบายความเป็นส่วนตัว' },
  courses: {
    eyebrow: 'CYBERSKILLS Academy',
    heading: 'ตัวอย่างคอร์ส',
    intro: 'ดูเส้นทางของแต่ละคอร์สก่อนเปิดให้เรียน: บทเรียน ลำดับก่อนหลัง และด่านบังคับ',
    openToAll: 'ทุกคนดูตัวอย่างคอร์สได้ ส่วนการเข้าเรียนจะเปิดพร้อมบัญชี CYBERSKILLS',
    lessons: (n) => `${n} บท`,
    checkpoints: (n) => `${n} ด่านบังคับ`,
    level: { beginner: 'เริ่มต้น', intermediate: 'ระดับกลาง', advanced: 'ขั้นสูง' },
    searchLabel: 'ค้นหาคอร์ส',
    searchPlaceholder: 'ค้นหาด้วยชื่อหรือคำอธิบายสั้น',
    levelFilter: { legend: 'ระดับ', all: 'ทุกระดับ' },
    resultCount: (count) => `พบ ${count} คอร์ส`,
    noResultsHeading: 'ไม่พบคอร์สที่ตรงกับเงื่อนไข',
    noResultsBody: 'ลองใช้คำค้นอื่น หรือเปลี่ยนระดับคอร์ส',
    clearFilters: 'ล้างการค้นหาและตัวกรองระดับ',
    emptyHeading: 'กำลังเตรียมตัวอย่างคอร์ส',
    emptyBody: 'ตอนนี้ยังไม่มีตัวอย่างคอร์สที่เปิดให้ดู รับข่าวเมื่อเส้นทางถัดไปพร้อมได้',
    updates: 'รับข่าวเมื่อเปิดให้เรียน',
  },
  signIn: {
    title: 'บัญชี CYBERSKILLS ของคุณ',
    subtitle:
      'บัญชี CYBERSKILLS จะเก็บประวัติการเรียน Academy ไว้ให้เรียนต่อข้ามอุปกรณ์ได้',
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
    unavailable: 'โหลดวิดีโอไม่สำเร็จ โปรดตรวจสอบการเชื่อมต่อแล้วลองอีกครั้ง',
    retry: 'โหลดวิดีโอใหม่',
  },
  language: { label: 'ภาษา' },
  theme: { switchToLight: 'เปลี่ยนเป็นโหมดสว่าง', switchToDark: 'เปลี่ยนเป็นโหมดมืด' },
}

export const UI: Record<UiLocale, UiStrings> = { en, th }

export function isUiLocale(value: unknown): value is UiLocale {
  return value === 'en' || value === 'th'
}
