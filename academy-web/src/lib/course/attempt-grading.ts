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

  // ⚠️ ไม่เทียบกับเนื้อหาปัจจุบันเลย — attempt คือ "สัญญาของงานครั้งนี้"
  //
  // เดิมถ้าจำนวนด่านไม่ตรงกับไฟล์วันนี้จะตอบ stale · ผลคือ deploy ที่เพิ่มด่านทำให้
  // ผู้เรียนที่กำลังทำอยู่เสียสิทธิ์หนึ่งช่องทั้งที่ attempt มีโจทย์และกติกาครบอยู่แล้ว
  // (RIL red-team ข้อ 4) · สิ่งที่ถูกต้องคือตัดสินจากสิ่งที่เขาถูกเสิร์ฟ แล้วบันทึกว่า
  // ผ่านด้วยกติกาเวอร์ชันไหน (`passed_challenge_version` ทำหน้าที่นี้อยู่แล้ว)
  //
  // เหลือ stale ไว้กรณีเดียว: attempt ที่ออกก่อนระบบเก็บ snapshot (deploy คร่อม) —
  // ตรวจด้วยไฟล์ไม่ได้เพราะค่าตัวแปรของเขาไม่มีใครรู้แล้ว
  const snapshot = params.simulations
  if (snapshot === undefined) return { ok: false, reason: 'stale-attempt' }
  void fromContent
  return { ok: true, simulations: snapshot }
}
