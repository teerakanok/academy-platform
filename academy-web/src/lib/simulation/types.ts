// โจทย์จำลองหน้าจอจริง — "เคยทำ" ต่างจาก "เคยอ่าน" ตรงนี้
//
// ปัญหาที่แก้: อ่านเรื่องตั้งค่า DHCP หรือสร้าง GPO จบแล้วยังไม่รู้ว่าหน้าจอจริงหน้าตา
// อย่างไร ปุ่มอยู่ตรงไหน เลือกอะไรแล้วอะไรหายไป — ความมั่นใจจึงไม่เกิด และตัวผู้เรียน
// เองก็รู้ว่ายังไม่รู้จริง เครื่องจริงก็ไม่มีให้ทุกคน
//
// หลักที่ยึด:
//   1. **ตัดสินจากสถานะสุดท้าย ไม่ใช่ลำดับการคลิก** — ของจริงมีหลายทางไปถึงผลเดียวกัน
//      การบังคับลำดับคือการสอนให้ท่องขั้นตอน ซึ่งตรงข้ามกับสิ่งที่เราอยากได้
//   2. **โจทย์บอกผลลัพธ์ที่ต้องการ ไม่ใช่วิธีทำ** — "ให้เครื่องนี้ต้องเข้าถึงได้ที่ IP
//      เดิมเสมอ" ไม่ใช่ "เลือก static แล้วกรอก 192.168.10.50"
//   3. **เงื่อนไขแยกเป็นข้อ** เพื่อบอกได้ว่าข้อไหนยังไม่ผ่าน โดยไม่ต้องเฉลยคำตอบ

/** หน้าจอที่จำลอง — เพิ่มชนิดใหม่ = เพิ่ม component + ประกาศฟิลด์ที่มันมี */
export type SimulationSurface = 'network-interface'

export type SimulationValue = string | boolean

export type SimulationState = Record<string, SimulationValue>

export type RequirementOperator = 'equals' | 'notEquals' | 'oneOf' | 'isTrue' | 'isFalse'

export interface SimulationRequirement {
  id: string
  /** ข้อความที่ผู้เรียนเห็น — ต้องบอก "ต้องการอะไร" ไม่ใช่ "กดตรงไหน" */
  label: string
  field: string
  operator: RequirementOperator
  value?: string | string[]
}

export interface SimulationChallenge {
  id: string
  title: string
  /** โจทย์ที่ผู้เรียนอ่านก่อนลงมือ */
  brief: string
  surface: SimulationSurface
  /** สถานะตั้งต้นของหน้าจอ — ควรเป็นสถานะที่ "ยังไม่ถูก" เพื่อให้มีอะไรให้ทำ */
  initial: SimulationState
  requirements: SimulationRequirement[]
  /** คำใบ้ ใช้ได้เฉพาะโหมดฝึก ตอนวัดผลจริงจะไม่แสดง */
  hints?: string[]
  /** ข้อความหลังทำถูก — อธิบายว่าทำไมคำตอบนี้ถึงถูกในสถานการณ์นี้ */
  debrief?: string
}

export interface RequirementResult {
  id: string
  label: string
  met: boolean
}

export interface SimulationVerdict {
  passed: boolean
  results: RequirementResult[]
  metCount: number
  total: number
}

function valueOf(state: SimulationState, field: string): SimulationValue | undefined {
  return state[field]
}

function meets(state: SimulationState, req: SimulationRequirement): boolean {
  const actual = valueOf(state, req.field)
  switch (req.operator) {
    case 'equals':
      // เทียบแบบตัดช่องว่างหัวท้าย — ผู้เรียนพิมพ์เว้นวรรคเกินไม่ควรถือว่าผิด
      return typeof actual === 'string' && typeof req.value === 'string'
        ? actual.trim() === req.value.trim()
        : actual === req.value
    case 'notEquals':
      return !(typeof actual === 'string' && typeof req.value === 'string'
        ? actual.trim() === req.value.trim()
        : actual === req.value)
    case 'oneOf':
      return Array.isArray(req.value) && typeof actual === 'string' && req.value.includes(actual.trim())
    case 'isTrue':
      return actual === true
    case 'isFalse':
      return actual === false || actual === undefined
  }
}

/**
 * ตรวจสถานะสุดท้ายกับเงื่อนไขทุกข้อ
 *
 * คืนผลรายข้อเสมอ ไม่ใช่แค่ผ่าน/ไม่ผ่าน — ผู้เรียนต้องรู้ว่าเหลืออะไร ไม่ใช่รู้แค่ว่า
 * "ยังผิดอยู่" ซึ่งไม่ได้บอกอะไรและทำให้เดาสุ่มแทนที่จะคิด
 */
export function gradeSimulation(
  challenge: SimulationChallenge,
  state: SimulationState,
): SimulationVerdict {
  const results = challenge.requirements.map((req) => ({
    id: req.id,
    label: req.label,
    met: meets(state, req),
  }))
  const metCount = results.filter((r) => r.met).length
  return {
    passed: metCount === results.length && results.length > 0,
    results,
    metCount,
    total: results.length,
  }
}
