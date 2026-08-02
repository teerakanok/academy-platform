import type {
  CheckpointQuestion,
  LessonBlock,
  LessonContent,
  Locale,
  VideoCueQuestion,
} from './course-types'
import type { SimulationChallenge, SimulationRequirement } from '@/lib/simulation/types'

// เส้นแบ่งระหว่าง "สิ่งที่เซิร์ฟเวอร์รู้" กับ "สิ่งที่ browser ได้เห็น" (W0-1)
//
// ปัญหาที่แก้ (F1 — พิสูจน์แล้วด้วยการดึง HTML จริงของหน้าบทเรียน): หน้าบทเรียนส่ง
// `LessonContent` ทั้งก้อนเข้า client component ซึ่งแปลว่า `correct` และ `explanation`
// ของทุกข้ออยู่ใน payload ที่ view-source เห็น — **ไม่ต้องปลอมผลก็ผ่านได้**
// การเปลี่ยนเซิร์ฟเวอร์ให้ตรวจคำตอบเอง (แก้ไปแล้ว) กัน "การปลอมผล" ได้ แต่ไม่ได้กัน
// "การอ่านเฉลย" ซึ่งเป็นคนละรู
//
// วิธีที่เลือก: **ชนิดข้อมูลเป็นตัวบังคับ ไม่ใช่วินัยของคนเขียน** — client component
// รับได้เฉพาะชนิด `Public*` ซึ่งไม่มี field เฉลยอยู่ในโครงเลย ใครเผลอส่งของเต็มเข้าไป
// จะไม่ผ่าน type check ตั้งแต่ตอน build ไม่ใช่หลุดไปโผล่ตอน production
//
// โมดูลนี้ตั้งใจ **ไม่** import 'server-only' เพราะฝั่ง client ต้อง import ชนิด
// `Public*` มาใช้ประกาศ props — ของที่ห้ามข้ามฝั่งคือ `LessonContent` เต็มซึ่งอยู่ใน
// `answer-key.ts` (โมดูลนั้นเป็นตัวที่กันด้วย server-only)

/**
 * โจทย์ MCQ ที่ browser เห็น — ไม่มี `correct` ไม่มี `explanation` โดยโครงสร้าง
 *
 * `multiple` เป็นข้อมูลของ **โจทย์** ไม่ใช่เฉลย: ผู้เรียนต้องรู้ว่าเลือกได้กี่ตัวถึงจะ
 * ทำข้อสอบได้ (UI เดิมก็บอกว่า "select all that apply") · เซิร์ฟเวอร์คำนวณให้จาก
 * จำนวนเฉลย เพื่อไม่ให้ฝั่ง client ต้องมีเฉลยเพื่อรู้ว่าเป็นข้อเลือกหลายตัว
 */
export type PublicCheckpointQuestion = Omit<CheckpointQuestion, 'correct' | 'explanation'> & {
  multiple: boolean
}

export type PublicVideoCueQuestion = Omit<VideoCueQuestion, 'correct' | 'explanation'>

/**
 * เงื่อนไขของโจทย์จำลองที่ browser เห็น — เหลือแค่ `label`
 *
 * `field`/`operator`/`value` คือ **กติกาการตรวจ** ซึ่งเท่ากับเฉลย ส่วนตัวโจทย์ที่
 * ผู้เรียนต้องอ่าน (เช่น "ต้องเข้าถึงได้ที่ 192.168.10.50") อยู่ใน `brief` และต้องอยู่
 * ในหน้าเสมอ — สิ่งที่ห้ามรั่วคือกติกา ไม่ใช่โจทย์
 */
export type PublicSimulationRequirement = Pick<SimulationRequirement, 'id' | 'label'>

/** โจทย์จำลองที่ browser เห็น — ไม่มีกติกาการตรวจ และไม่มี `hints`/`debrief` */
export interface PublicSimulationChallenge
  extends Omit<SimulationChallenge, 'requirements' | 'hints' | 'debrief'> {
  requirements: PublicSimulationRequirement[]
}

/** บล็อกเนื้อหาที่ browser เห็น — เหมือนเดิมทุกชนิด ยกเว้น simulation ที่ถูกลดรูป */
export type PublicLessonBlock =
  | Exclude<LessonBlock, { kind: 'simulation' }>
  | { kind: 'simulation'; challenge: PublicSimulationChallenge }

export interface PublicLesson {
  nodeId: string
  locale: Locale
  title: string
  objective: string
  blocks: PublicLessonBlock[]
  attribution?: string
  cheatsheet: string[]
  checkpoint: PublicCheckpointQuestion[]
  videoCueQuestions?: PublicVideoCueQuestion[]
}

function toPublicQuestion({ id, prompt, choices, correct }: CheckpointQuestion): PublicCheckpointQuestion {
  return { id, prompt, choices, multiple: correct.length > 1 }
}

export function toPublicSimulation(challenge: SimulationChallenge): PublicSimulationChallenge {
  // สร้างทีละ field ที่อนุญาต — **ห้าม spread แล้วลบทีหลัง** เพราะ field ใหม่ที่ถูก
  // เพิ่มเข้า SimulationChallenge วันหน้าจะไหลออกไปเองโดยไม่มีใครรู้ (เทสคุมข้อนี้อยู่)
  return {
    id: challenge.id,
    title: challenge.title,
    brief: challenge.brief,
    surface: challenge.surface,
    initial: challenge.initial,
    requirements: challenge.requirements.map(({ id, label }) => ({ id, label })),
  }
}

/**
 * ลดรูปบทเรียนให้เหลือเฉพาะสิ่งที่ต้องใช้แสดงผล
 *
 * นี่คือ **ทางเดียว** ที่เนื้อหาบทเรียนควรข้ามไปฝั่ง browser
 */
export function toPublicLesson(lesson: LessonContent): PublicLesson {
  return {
    nodeId: lesson.nodeId,
    locale: lesson.locale,
    title: lesson.title,
    objective: lesson.objective,
    blocks: lesson.blocks.map((block) =>
      block.kind === 'simulation'
        ? { kind: 'simulation' as const, challenge: toPublicSimulation(block.challenge) }
        : block,
    ),
    attribution: lesson.attribution,
    cheatsheet: lesson.cheatsheet,
    checkpoint: lesson.checkpoint.map(toPublicQuestion),
    videoCueQuestions: lesson.videoCueQuestions?.map((q) => ({ ...toPublicQuestion(q), cueId: q.cueId })),
  }
}
