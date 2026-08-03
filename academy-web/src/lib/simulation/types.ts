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

/** input ที่ผู้เรียนแก้ได้จริงบนแต่ละ surface; loader ใช้กัน authoring typo */
export const SIMULATION_SURFACE_INPUT_FIELDS: Record<SimulationSurface, readonly string[]> = {
  'network-interface': ['ipv4', 'subnet', 'gateway', 'dns1'],
}

export type SimulationValue = string | boolean

export type SimulationState = Record<string, SimulationValue>

export interface SimulationRequiredFields {
  dhcp: string[]
  static: string[]
}

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
  /**
   * โจทย์ที่ผู้เรียนอ่านก่อนลงมือ
   *
   * อ้างตัวแปรที่สุ่มต่อ attempt ได้ด้วย `{{ชื่อ}}` (W1 · ดู simulation/variables.ts)
   */
  brief: string
  /**
   * ตัวแปรที่สุ่มค่าใหม่ทุก attempt — ทำให้คำตอบแชร์กันไม่ได้
   *
   * ไม่ประกาศ = โจทย์ค่าตายตัวเหมือนเดิม (เนื้อหาเก่าไม่ต้องแก้)
   */
  variables?: import('./variables').SimulationVariables
  surface: SimulationSurface
  /** สถานะตั้งต้นของหน้าจอ — ควรเป็นสถานะที่ "ยังไม่ถูก" เพื่อให้มีอะไรให้ทำ */
  initial: SimulationState
  /** ช่องที่ต้องกรอกก่อนส่งได้ เป็น public structure ไม่ใช่ค่าคำตอบ */
  requiredFields: SimulationRequiredFields
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

export type SimulationReadiness =
  | { ready: true }
  | { ready: false; reason: 'untouched' | 'invalid-mode' | 'incomplete' | 'unapplied' }

function sameState(left: SimulationState, right: SimulationState): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  for (const key of keys) {
    if (left[key] !== right[key]) return false
  }
  return true
}

/** ตรวจความพร้อมจาก public surface contract เท่านั้น ไม่อ่านกติกาหรือเฉลย */
export function simulationReadiness(
  surface: SimulationSurface,
  initial: SimulationState,
  state: SimulationState,
  requiredFields: SimulationRequiredFields,
): SimulationReadiness {
  if (sameState(initial, state)) return { ready: false, reason: 'untouched' }

  switch (surface) {
    case 'network-interface': {
      const mode = state.addressMode
      if (mode !== 'dhcp' && mode !== 'static') return { ready: false, reason: 'invalid-mode' }
      if (state.applied !== true) return { ready: false, reason: 'unapplied' }
      if (
        requiredFields[mode].some((field) => {
          const value = state[field]
          return value === undefined || (typeof value === 'string' && !value.trim())
        })
      ) {
        return { ready: false, reason: 'incomplete' }
      }
      return { ready: true }
    }
  }
}

/**
 * อ่านค่าของ field จากสถานะที่ client ส่งมา
 *
 * ⚠️ ต้องเป็น own property เท่านั้น — สถานะมาจาก client ทั้งก้อน การ index ตรงๆ
 * จะไปเจอของบน Object.prototype ได้ (field='toString' คืน function)
 */
function valueOf(state: SimulationState, field: string): SimulationValue | undefined {
  return Object.prototype.hasOwnProperty.call(state, field) ? state[field] : undefined
}

/**
 * เงื่อนไขข้อนี้ผ่านไหม — **ตัดสินแบบ fail-closed เสมอ**
 *
 * 🔴 รุ่นก่อนมีกรณีที่ "ผ่านเพราะไม่มีอะไรเลย" (RIL cross-model จับ):
 *   · `equals` ที่ requirement ไม่ระบุ `value` และ client ไม่ส่ง field มา
 *     → `undefined === undefined` → ผ่าน
 *   · `notEquals` และ `isFalse` → ผ่านทันทีเมื่อ client **ละ field ทิ้ง**
 * แปลว่าการไม่ทำอะไรเลยผ่านด่านได้ · วันนี้ capstone ที่มีอยู่ไม่โดนเพราะระบุ value
 * ครบ แต่สัญญาของ operator เปิดรูไว้ให้เนื้อหาชุดถัดไป
 *
 * กติกาใหม่: ไม่มี field ในสถานะ = ไม่ผ่านเสมอ · operator ที่ต้องมี `value`
 * แต่ไม่มี = ไม่ผ่านเสมอ (และ loader ปฏิเสธตั้งแต่ตอนโหลดเนื้อหาด้วย)
 */
function meets(state: SimulationState, req: SimulationRequirement): boolean {
  const actual = valueOf(state, req.field)
  // ไม่ได้ตั้งค่าอะไรเลยไม่มีทางผ่าน ไม่ว่าเงื่อนไขจะเป็นแบบไหน
  if (actual === undefined) return false

  switch (req.operator) {
    case 'equals':
      if (req.value === undefined) return false
      // เทียบแบบตัดช่องว่างหัวท้าย — ผู้เรียนพิมพ์เว้นวรรคเกินไม่ควรถือว่าผิด
      return typeof actual === 'string' && typeof req.value === 'string'
        ? actual.trim() === req.value.trim()
        : actual === req.value
    case 'notEquals':
      if (req.value === undefined) return false
      return !(typeof actual === 'string' && typeof req.value === 'string'
        ? actual.trim() === req.value.trim()
        : actual === req.value)
    case 'oneOf':
      return Array.isArray(req.value) && typeof actual === 'string' && req.value.includes(actual.trim())
    case 'isTrue':
      return actual === true
    case 'isFalse':
      return actual === false
  }
}

/**
 * ตรวจสถานะสุดท้ายกับเงื่อนไขทุกข้อ
 *
 * คืนผลรายข้อเสมอ ไม่ใช่แค่ผ่าน/ไม่ผ่าน — ผู้เรียนต้องรู้ว่าเหลืออะไร ไม่ใช่รู้แค่ว่า
 * "ยังผิดอยู่" ซึ่งไม่ได้บอกอะไรและทำให้เดาสุ่มแทนที่จะคิด
 */
/**
 * ลายนิ้วมือของ "กติกาการตรวจ" ของโจทย์หนึ่งชิ้น
 *
 * 🔴 เดิมหลักฐานบันทึก `structure.version` ของทั้งคอร์สเป็นเวอร์ชันของโจทย์ ซึ่ง
 * ไม่ขยับเมื่อ requirements เปลี่ยน (RIL cross-model จับ) — แปลว่าตอบไม่ได้จริงว่า
 * ผู้เรียนผ่านด้วยกติกาชุดไหน ทั้งที่นั่นคือเหตุผลทั้งหมดที่เก็บ field นี้
 *
 * ค่านี้คำนวณจาก surface + requirements โดยตรง จึงเปลี่ยนเองอัตโนมัติเมื่อกติกา
 * เปลี่ยน ไม่ต้องพึ่งว่ามีใครจำได้ว่าต้อง bump เลขเวอร์ชัน
 */
export function gradingFingerprint(challenge: SimulationChallenge): string {
  const canonical = JSON.stringify({
    surface: challenge.surface,
    requiredFields: {
      dhcp: [...challenge.requiredFields.dhcp].sort(),
      static: [...challenge.requiredFields.static].sort(),
    },
    requirements: challenge.requirements
      .map((r) => ({ id: r.id, field: r.field, operator: r.operator, value: r.value ?? null }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  })
  // FNV-1a — สั้น อ่านออก และไม่ต้องพึ่ง crypto (ฟังก์ชันนี้ต้องรันได้ทั้งสองฝั่ง)
  let hash = 0x811c9dc5
  for (let i = 0; i < canonical.length; i++) {
    hash ^= canonical.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return `sim-${hash.toString(16).padStart(8, '0')}`
}

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
