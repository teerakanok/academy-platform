import { randomInt } from 'node:crypto'
import type { CheckpointQuestion } from '@/lib/content/course-types'
import type { SimulationChallenge } from '@/lib/simulation/types'
import type { AttemptQuestion } from '@/lib/content/public-lesson'

// โครง attempt (W0-0) — เซิร์ฟเวอร์สุ่มชุดข้อ + remap key ของตัวเลือกต่อ attempt
//
// ทำไมต้อง remap ไม่ใช่ "สลับลำดับการแสดงผล": เฉลยจริงคือ `"correct": ["A"]` โดย
// "A" เป็น key ของ choices — สลับลำดับที่แสดงแล้ว client ก็ยังส่ง "A" กลับมาเหมือนเดิม
// เท่ากับกันอะไรไม่ได้เลย · ต้อง map "key จริง ↔ key ที่ client เห็น" ใหม่ทุก attempt
// โดยตารางแปลงอยู่ใน params ฝั่งเซิร์ฟเวอร์ฝ่ายเดียว (แผน 2026-08-02 §5 W0-0)
//
// โมดูลนี้รับ CheckpointQuestion ซึ่งมีเฉลย — ใช้ได้เฉพาะฝั่ง server เท่านั้น
// (จะถูกบังคับด้วย `import 'server-only'` ใน W0-1 ตอนเพิ่ม dependency + SBOM)
// สิ่งเดียวที่อนุญาตให้ออกไปหา client คือ PublicAttemptQuestion ด้านล่าง

/** challenge เดียวที่มีวันนี้คือ checkpoint ของบท — W1 จะเพิ่ม simulation เป็นตัวถัดไป */
export const CHECKPOINT_CHALLENGE_ID = 'checkpoint'

/** สิ่งที่เก็บใน academy.attempt.params — เซิร์ฟเวอร์ถือฝ่ายเดียว ห้ามส่งไป client */
export interface AttemptParams {
  /** ข้อที่สุ่มมาใช้ครั้งนี้ เรียงตามลำดับที่แสดง */
  questionIds: string[]
  /** ต่อข้อ: key ที่ client เห็น → key จริงในไฟล์คอร์ส */
  keyMaps: Record<string, Record<string, string>>
  /**
   * เฉลย (key จริง) ของแต่ละข้อ ณ ตอนออก attempt — snapshot ไม่ใช่ pointer
   *
   * เหตุผล (RIL จับ): attempt อายุ 60 นาที ถ้า deploy เปลี่ยนเนื้อหาระหว่างนั้น
   * การไปเปิดเฉลยจากไฟล์คอร์ส ณ ตอน consume จะตรวจด้วยคนละรุ่นกับโจทย์ที่ผู้เรียน
   * เห็น — ต้องตรวจจากของที่ attempt ถือเองเท่านั้น
   */
  answerKeys: Record<string, string[]>
  /**
   * โจทย์จำลองของ attempt นี้ **ทั้งชิ้นหลังแทนค่าแล้ว** (snapshot ไม่ใช่ pointer)
   *
   * เหตุผลเดียวกับ `answerKeys` แต่แรงกว่า (RIL cross-model รอบ 2 จับ): เดิมเก็บแค่
   * ค่าตัวแปรแล้วไปประกอบกับกติกาจากไฟล์ตอนตรวจ · ถ้ามี deploy ระหว่างที่ attempt
   * ยังไม่หมดอายุ (60 นาที) ผู้เรียนจะถูกตรวจด้วยกติกาชุดใหม่ทั้งที่อ่านโจทย์ชุดเก่า
   * — ตั้งค่าตามที่อ่านแล้วไม่ผ่านโดยไม่มีทางเดาสาเหตุ · และถ้า deploy **ลบ** ด่าน
   * จำลองออก บทนั้นจะถูกบันทึกว่าผ่านทั้งที่ไม่มีหลักฐานของด่านที่ผู้เรียนถูกเสิร์ฟมา
   *
   * เก็บกติกาการตรวจไว้ด้วย (operator/value) — อยู่ฝั่งเซิร์ฟเวอร์ฝ่ายเดียวเสมอ
   * สิ่งที่ส่งออกไปหา client คือรูป public ที่ผ่าน `toPublicSimulation` เท่านั้น
   */
  simulations?: { id: string; challenge: SimulationChallenge }[]
}

/**
 * รูปข้อสอบที่ส่งให้ client — ไม่มี correct ไม่มี explanation โดยโครงสร้าง
 *
 * ใช้ชนิดร่วมกับด่านท้ายบทที่ UI เรนเดอร์ (`AttemptQuestion`) เพื่อให้ลืมฟิลด์
 * ใดฟิลด์หนึ่งเป็น error ตอนคอมไพล์ ไม่ใช่ข้อหายไปจากหน้าจอเงียบๆ
 */
export type PublicAttemptQuestion = AttemptQuestion

/** ตัวสุ่มของจริง — attempt ต้องเดาไม่ได้ จึงใช้ crypto ไม่ใช่ seedable PRNG */
export const cryptoPick = (maxExclusive: number): number => randomInt(maxExclusive)

/** Fisher–Yates ด้วย crypto randomInt — attempt ต้องเดาไม่ได้ จึงไม่ใช้ seedable shuffle */
function cryptoShuffled<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * สุ่มชุดข้อจากคลัง + สร้างตาราง remap key ต่อข้อ
 *
 * `serveCount` วันนี้ = ขนาดคลัง (คลังมีเท่าที่ใช้พอดี) — เมื่อคลังโต ≥3 เท่า
 * (งาน W-content) จำนวนเสิร์ฟจริงจะมาจากนิยามของ challenge ไม่ใช่ขนาดคลัง
 */
export function buildAttemptParams(bank: readonly CheckpointQuestion[], serveCount: number): AttemptParams {
  const sampled = cryptoShuffled(bank).slice(0, Math.min(serveCount, bank.length))
  const keyMaps: Record<string, Record<string, string>> = {}
  const answerKeys: Record<string, string[]> = {}
  for (const q of sampled) {
    // client เห็นชุด key เดิม (เรียงตามตัวอักษร) แต่ข้อความใต้แต่ละ key ถูกสับใหม่
    const realKeys = Object.keys(q.choices)
    const clientKeys = [...realKeys].sort()
    const permuted = cryptoShuffled(realKeys)
    const map: Record<string, string> = {}
    clientKeys.forEach((clientKey, i) => {
      map[clientKey] = permuted[i]
    })
    keyMaps[q.id] = map
    answerKeys[q.id] = [...q.correct]
  }
  return { questionIds: sampled.map((q) => q.id), keyMaps, answerKeys }
}

/** รูปที่ส่งให้ client: ข้อความตัวเลือกอยู่ใต้ key ตามตาราง remap ของ attempt นี้ */
export function toPublicQuestions(
  bank: readonly CheckpointQuestion[],
  params: AttemptParams,
): PublicAttemptQuestion[] {
  const byId = new Map(bank.map((q) => [q.id, q]))
  return params.questionIds.map((id) => {
    const q = byId.get(id)
    if (!q) throw new Error(`attempt params อ้างข้อ ${id} ที่ไม่มีในคลัง`)
    const map = params.keyMaps[id] ?? {}
    const choices: Record<string, string> = {}
    for (const clientKey of Object.keys(map).sort()) {
      choices[clientKey] = q.choices[map[clientKey]]
    }
    // `multiple` เป็นข้อมูลของโจทย์ ไม่ใช่เฉลย — ผู้เรียนต้องรู้ว่าเลือกได้กี่ตัว
    // จึงคำนวณฝั่งเซิร์ฟเวอร์จากจำนวนเฉลย (เหมือน toPublicQuestion ของหน้า lesson)
    return { kind: 'mcq', id: q.id, prompt: q.prompt, choices, multiple: q.correct.length > 1 }
  })
}

/**
 * แปลงคำตอบที่ client ส่ง (key ฝั่ง client) กลับเป็น key จริง เพื่อตรวจกับเฉลยใน snapshot
 *
 * เข้มงวดทั้งชุด: เจอ key ที่ไม่มีในตาราง / key ซ้ำ / ข้อที่ไม่อยู่ใน attempt →
 * ปฏิเสธทั้ง submission (คืน null) ไม่ใช่ตัดตัวปลอมทิ้งเงียบๆ — RIL จับว่าแบบหลัง
 * ทำให้ `[คำตอบถูก, key มั่ว]` หดเหลือ `[คำตอบถูก]` แล้วรอดการตรวจแบบ all-or-nothing
 */
export function remapAnswersToReal(
  params: AttemptParams,
  questionId: string,
  clientAnswers: readonly string[],
): string[] | null {
  // questionId และ key มาจาก client — lookup บน plain object ตรงๆ จะทะลุไปเจอของบน
  // Object.prototype ได้ (qid='toString' ได้ function กลับมาแทน undefined — RIL รอบ 2
  // รันพิสูจน์สด) จึงต้องยึด questionIds เป็นเขตของ attempt และตรวจ own property เสมอ
  if (!params.questionIds.includes(questionId)) return null
  const map = Object.prototype.hasOwnProperty.call(params.keyMaps, questionId)
    ? params.keyMaps[questionId]
    : undefined
  if (!map) return null
  if (new Set(clientAnswers).size !== clientAnswers.length) return null
  const real: string[] = []
  for (const k of clientAnswers) {
    if (!Object.prototype.hasOwnProperty.call(map, k)) return null
    real.push(map[k])
  }
  return real
}
