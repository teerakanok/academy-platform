// Course content contract — โครงคอร์สเรียน (คนละเรื่องกับคลังข้อสอบใน content/types.ts)
//
// หลักการแยกชั้นที่ต้องรักษาไว้:
//   1. "โครง" เป็นกลางทางภาษา (course.json) — id, กราฟ prerequisite, น้ำหนักทักษะ,
//      จังหวะเวลาของ video cue  → ใช้ร่วมกันทุกภาษา
//   2. "ข้อความ" แยกตามภาษา (locales/<locale>/…) → แปลเพิ่มภาษาได้โดยไม่แตะโครง
// เหตุผล: คอร์สเดียวกันต้องขายได้หลายภาษา การยัด { en, th } ลงทุก field จะทำให้
// โครงกับคำแปลผูกกันแน่นจนแยกงานแปลออกไปทำทีหลังไม่ได้
//
// shape นี้คือสิ่งที่ Crucible ต้องผลิตส่งมา (Academy ไม่ใช่ที่ authoring จริง)

export type Locale = 'en' | 'th'

export type LessonNodeKind =
  /** บทเรียนปกติ — ข้ามได้ (พร้อมรับ cheatsheet) */
  | 'lesson'
  /** ด่านบังคับ — ต้องพิสูจน์ความสามารถ ข้ามไม่ได้ (prove-it / competency gate) */
  | 'capstone'

export interface VideoCuePoint {
  id: string
  /** วินาทีที่วิดีโอจะหยุดแล้วเด้งคำถาม */
  atSeconds: number
}

export interface LessonVideo {
  /** เสิร์ฟผ่าน custom player เท่านั้น — ห้าม iframe embed ของ vendor (design guard ที่ล็อกไว้) */
  src: string
  durationSeconds: number
  cues: VideoCuePoint[]
}

/** โครงของ node — ไม่มีข้อความใดๆ (เป็นกลางทางภาษา) */
export interface CourseNode {
  id: string
  kind: LessonNodeKind
  /** node ที่ต้องผ่านก่อน — ทำให้ทั้งคอร์สเป็น DAG ไม่ใช่เส้นตรง */
  prerequisites: string[]
  estimatedMinutes: number
  /** node นี้เพิ่มทักษะอะไรบ้าง (คีย์ต้องมีใน course.skills) */
  skillWeights: Record<string, number>
  video?: LessonVideo
}

export interface CourseSkill {
  id: string
  /** ระดับเต็มของทักษะนี้ในคอร์ส — ใช้เป็นตัวหารของ radar */
  maxScore: number
}

/** โครงคอร์สทั้งหมด (course.json) */
export interface CourseStructure {
  id: string
  slug: string
  version: string
  defaultLocale: Locale
  availableLocales: Locale[]
  level: 'beginner' | 'intermediate' | 'advanced'
  estimatedMinutes: number
  skills: CourseSkill[]
  /** คอร์สนี้ป้อนทักษะระดับ ecosystem ตัวไหนบ้าง (ใช้กับ radar ภาพรวม) */
  globalSkillWeights: Record<string, number>
  nodes: CourseNode[]
}

// ---------- ชั้นข้อความ (ต่อภาษา) ----------

export type LessonBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'heading'; text: string }
  | { kind: 'list'; items: string[]; ordered?: boolean }
  | { kind: 'code'; caption?: string; lines: string[] }
  | { kind: 'callout'; tone: 'info' | 'warning' | 'tip'; title?: string; text: string }
  /** ช่วงลงมือทำ — ตัวตั้งต้นของ prove-it lab จริงในภายหลัง */
  | { kind: 'try'; title: string; steps: string[]; expected?: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }

export interface CheckpointQuestion {
  id: string
  prompt: string
  choices: Record<string, string>
  /** all-or-nothing เหมือน MCQ ของ engine ข้อสอบ */
  correct: string[]
  explanation: string
}

/** คำถามที่เด้งกลางวิดีโอ — ผูกกับ cue id ในโครง */
export interface VideoCueQuestion extends CheckpointQuestion {
  cueId: string
}

/** เนื้อหาบทเรียนของภาษาหนึ่ง (locales/<locale>/lessons/<nodeId>.json) */
export interface LessonContent {
  nodeId: string
  locale: Locale
  title: string
  /** "จบบทนี้แล้วคุณจะ…" — สัญญาที่ให้ผู้เรียน */
  objective: string
  blocks: LessonBlock[]
  /** ใช้ทั้งตอนจบบท และตอนผู้เรียนเลือกข้าม (แก้ skip anxiety) */
  cheatsheet: string[]
  checkpoint: CheckpointQuestion[]
  videoCueQuestions?: VideoCueQuestion[]
}

/** ข้อความระดับคอร์สของภาษาหนึ่ง (locales/<locale>/course.json) */
export interface CourseCopy {
  locale: Locale
  title: string
  subtitle: string
  audience: string
  outcomes: string[]
  skillLabels: Record<string, string>
  /** ชื่อบทสำหรับแสดงบนกราฟ/สารบัญ โดยไม่ต้องโหลดบทเรียนทั้งก้อน */
  nodeTitles: Record<string, string>
}

/** คอร์สที่ประกอบเสร็จแล้วสำหรับภาษาหนึ่ง */
export interface Course {
  structure: CourseStructure
  copy: CourseCopy
  locale: Locale
  /** locale ที่มีเนื้อหาบทเรียนครบจริง (ใช้บอกผู้เรียนตรงๆ ว่าบทไหนยังไม่มีภาษานี้) */
  translatedNodeIds: string[]
}

export interface GlobalSkill {
  id: string
  label: Record<Locale, string>
}
