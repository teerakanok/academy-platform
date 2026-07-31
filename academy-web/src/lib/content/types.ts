// Internal content contract (`CourseContent`) — ส่วนอื่นของ app ห้าม import shape
// ดิบของ Crucible ตรงๆ (กติกาแผน §3); loader เป็นชั้นเดียวที่รู้จัก shape ภายนอก

export type McqType = 'single' | 'multi'

export interface KeywordTag {
  text: string
  tier: string
}

/** อ้างอิง instructional diagram (ไฟล์อยู่ใน assets/ ของ source — ไม่ได้คัดลอกเข้า
 * fixture ตามสโคปแผน §3; เก็บ metadata ไว้เฉยๆ player รุ่นนี้ไม่ render) */
export interface VisualRef {
  id: string
  fileName: string
  src: string
  title?: string
  alt?: string
  caption?: string
}

export interface McqItem {
  id: string
  moduleId: string
  moduleTitle: string
  objective: string
  learningObjective?: string
  lesson?: string
  bloom?: string
  difficulty?: string
  type: McqType
  topic?: string
  stem: string
  choices: Record<string, string>
  correct: string[]
  explanation?: string
  /** เหตุผลรายตัวเลือกที่ถูก — keyed ด้วยอักษร choice (shape จริงจาก fixture) */
  whyCorrect?: Record<string, string>
  whyWrong?: Record<string, string>
  sources?: string[]
  keywords?: KeywordTag[]
  visual?: VisualRef
}

// kind ที่ grade ได้จริงใน player รุ่นนี้ = ทุก kind ใน fixture ที่ล็อก (checks/select/order)
// kind อื่น (เช่น text ใน FL-01 นอก fixture) → UI แสดง banner "ยังไม่รองรับ" — ห้ามใช้
// banner เป็นทางผ่านสำหรับ kind ใน fixture (กติกาแผน §3)
export const GRADABLE_PBQ_KINDS = ['checks', 'select', 'order'] as const
export type GradablePbqKind = (typeof GRADABLE_PBQ_KINDS)[number]
export type PbqFieldKind = GradablePbqKind | 'text'

export interface PbqField {
  id: string
  label: string
  kind: PbqFieldKind
  options?: string[]
  correct: string | string[]
  explanation?: string
  /** เฉพาะ kind=text ใช้ตอน match คำตอบ (นอก fixture ปัจจุบัน — เก็บ shape ไว้) */
  aliases?: string[]
}

export interface PbqItem {
  id: string
  title: string
  /** string หลายค่าได้ เช่น "1.5, 3.6" — attribution ใช้ตัวแรกเท่านั้น (แผน §4-M2-3) */
  objective: string
  scenario: string
  exhibit?: string[]
  fields: PbqField[]
  sources?: string[]
  keywords?: KeywordTag[]
}

export interface ModuleBank {
  slug: string
  moduleId: string
  title: string
  questions: McqItem[]
}

/** media reference แบบ normalize — ไม่ผูก vendor; ตอนนี้ยังไม่มีใน fixture */
export interface MediaRef {
  kind: 'video'
  uri: string
  title?: string
}

export interface FullLengthTest {
  id: string
  title: string
  timeLimitMinutes: number
  questions: McqItem[]
  pbqs: PbqItem[]
}

export interface CourseContent {
  modules: ModuleBank[]
  fullLength: FullLengthTest[]
  media?: MediaRef[]
}
