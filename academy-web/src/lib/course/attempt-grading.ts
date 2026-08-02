import type { SimulationChallenge } from '@/lib/simulation/types'
import type { AttemptParams } from './attempt'

// ตัดสินว่า "ตรวจด้วยโจทย์ชุดไหน" — จุดเดียวที่ตอบคำถามนี้
//
// กติกา: **มี attempt = ตรวจจากของที่ attempt ถือเองเสมอ** ไม่แตะไฟล์เนื้อหาเลย
//
// ทำไมต้องแยกออกมาเป็นฟังก์ชัน (RIL cross-model รอบ 2): attempt อายุ 60 นาที และ
// deploy ระหว่างนั้นเปลี่ยนกติกาหรือลบด่านทิ้งได้ · เดิมตรรกะนี้ฝังอยู่กลาง route
// ซึ่งเทสไปแตะไม่ได้ตรงๆ เทสที่เขียนได้จึงเป็นแค่สำเนาของตรรกะ ไม่ได้ตรึงของจริง

export type SimulationSet = { id: string; challenge: SimulationChallenge }[]

export type GradeSource =
  | { ok: true; simulations: SimulationSet }
  /** โจทย์ที่ attempt ถือกับด่านของบทวันนี้ไม่ตรงกัน — ตรวจต่ออย่างซื่อสัตย์ไม่ได้ */
  | { ok: false; reason: 'stale-attempt' }

export function simulationsToGrade(
  params: AttemptParams | null,
  fromContent: SimulationSet,
): GradeSource {
  // ไม่มี attempt (บทสอนทั่วไปที่ไม่ต้องใช้) — ใช้ของในไฟล์ตามเดิม
  if (!params) return { ok: true, simulations: fromContent }

  const snapshot = params.simulations ?? []
  // จำนวนด่านต่างกัน = เนื้อหาเปลี่ยนหลัง attempt ออกไปแล้ว · ถ้าปล่อยผ่านโดยใช้
  // snapshot บทอาจถูกบันทึกว่าผ่านโดยไม่มีหลักฐานของด่านที่เพิ่งเพิ่ม และถ้าใช้ไฟล์
  // ผู้เรียนก็ถูกตัดสินด้วยกติกาที่ไม่เคยเห็น — ทางที่ซื่อสัตย์คือให้เริ่มใหม่
  if (snapshot.length !== fromContent.length) return { ok: false, reason: 'stale-attempt' }
  return { ok: true, simulations: snapshot }
}
