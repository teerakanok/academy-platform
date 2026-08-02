import 'server-only'
import { getLesson } from './course-source'
import type { CheckpointQuestion, Locale, VideoCueQuestion } from './course-types'
import type { SimulationChallenge } from '@/lib/simulation/types'

// ทางเข้าเดียวของ "ของที่เป็นเฉลย" — โมดูลนี้ห้ามถูก import จากฝั่ง browser
//
// `import 'server-only'` ทำให้ **build แดงทันที** ถ้ามี client component ลากโมดูลนี้
// เข้าไป ต่างจากคอมเมนต์เตือนซึ่งกันได้แค่คนที่อ่าน · การรวมทุกทางเข้าเฉลยไว้ที่เดียว
// ทำให้คำถาม "เฉลยออกไปทางไหนได้บ้าง" ตอบได้ด้วยการอ่านไฟล์เดียว ไม่ใช่ไล่ทั้งโปรเจกต์
//
// ฝั่งที่ต้องใช้ข้อมูลเดียวกันเพื่อ "แสดงผล" ให้ไปเรียก `toPublicLesson()` ใน
// public-lesson.ts ซึ่งเป็นทางเดียวที่เนื้อหาควรข้ามไป browser

export interface LessonAnswerKey {
  checkpoint: CheckpointQuestion[]
  videoCueQuestions: VideoCueQuestion[]
  simulations: SimulationChallenge[]
}

// เนื้อหาเป็นไฟล์นิ่งที่ผูกเข้ามาตอน build — เฉลยของบทเดิมจึงเหมือนเดิมตลอดอายุ
// ของ process · เดิมทุกครั้งที่ผู้เรียนกดตรวจจะ parse + validate บทนั้นใหม่ทั้งก้อน
// ซึ่งเป็น CPU ที่เสียเปล่าต่อคลิก (สำคัญบน Workers ที่คิดตาม CPU time)
const cache = new Map<string, LessonAnswerKey>()

/** เฉลยทั้งหมดของบทหนึ่ง — เรียกได้จาก route handler/server component เท่านั้น */
export function getLessonAnswerKey(slug: string, nodeId: string, locale?: Locale): LessonAnswerKey | null {
  const key = `${slug}::${nodeId}::${locale ?? 'default'}`
  const cached = cache.get(key)
  if (cached) return cached

  const resolved = getLesson(slug, nodeId, locale)
  if (!resolved) return null
  const { lesson } = resolved
  const answerKey: LessonAnswerKey = {
    checkpoint: lesson.checkpoint,
    videoCueQuestions: lesson.videoCueQuestions ?? [],
    simulations: lesson.blocks.flatMap((b) => (b.kind === 'simulation' ? [b.challenge] : [])),
  }
  cache.set(key, answerKey)
  return answerKey
}

/** เปรียบเทียบชุดคำตอบแบบไม่สนลำดับ — เกณฑ์ all-or-nothing เดียวกับ engine ข้อสอบ */
export function sameAnswerSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const left = [...a].sort()
  const right = [...b].sort()
  return left.every((v, i) => v === right[i])
}
