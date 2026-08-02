import type { SimulationChallenge } from './types'

// โจทย์จำลองที่ "ค่าเป้าหมายต่างกันทุกครั้ง" (W1)
//
// ปัญหาที่แก้: การรับสถานะสุดท้ายจาก client แปลว่า curl ยิงตรงก็ผ่านได้โดยไม่ต้อง
// เปิดหน้าจอเลย — และถ้าโจทย์เป็นค่าตายตัว คำตอบที่ถูกก็แชร์กันได้ทั้งรุ่น
// (แผน 2026-08-02 §5 W1 เลือกทางนี้ไว้: สุ่มพารามิเตอร์ต่อ attempt)
//
// วิธี: โจทย์ประกาศ "ตัวแปร" ที่สุ่มได้ แล้ว `brief` กับ `requirements[].value`
// อ้างถึงมันด้วย `{{ชื่อ}}` · เซิร์ฟเวอร์สุ่มค่าตอนออก attempt แล้วเก็บไว้ใน
// `params` ฝ่ายเดียว — ผู้เรียนอ่านค่าที่ต้องทำจาก brief ของ attempt ตัวเอง
//
// ⚠️ สิ่งที่ยัง **ไม่** ได้พิสูจน์และห้ามเคลม: นี่พิสูจน์ว่าผู้เรียน "รู้คำตอบที่ถูก
// ของโจทย์ตัวเอง" ไม่ใช่ "ลงมือทำจริง" · การให้เซิร์ฟเวอร์ถือ state แล้วรับทีละ
// action เป็นงานใหญ่ที่แผนเลื่อนไว้จนกว่า simulation จะเป็นด่านของ certification

/** ตัวแปรที่สุ่มได้ — เพิ่มชนิดใหม่ = เพิ่ม case ใน `rollValue` และ schema ของ loader */
export type SimulationVariable =
  /** เลขโฮสต์ในเครือข่าย /24 เช่น 192.168.10.{min..max} */
  | { kind: 'ipv4-host'; network: string; min: number; max: number }
  /** เลือกหนึ่งค่าจากรายการที่กำหนด */
  | { kind: 'oneOf'; values: string[] }

export type SimulationVariables = Record<string, SimulationVariable>
export type RolledVariables = Record<string, string>

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g

/**
 * สุ่มค่าให้ทุกตัวแปรของโจทย์หนึ่งชิ้น
 *
 * `pick` ถูกส่งเข้ามาเพื่อให้เทสกำหนดผลได้ — ของจริงใช้ `crypto.randomInt` ที่
 * ฝั่งเรียก (attempt.ts) เพราะโมดูลนี้ต้องรันได้ทั้งสองฝั่งโดยไม่ผูกกับ node:crypto
 */
export function rollVariables(
  variables: SimulationVariables | undefined,
  pick: (maxExclusive: number) => number,
): RolledVariables {
  const rolled: RolledVariables = {}
  for (const [name, spec] of Object.entries(variables ?? {})) {
    rolled[name] = rollValue(spec, pick)
  }
  return rolled
}

function rollValue(spec: SimulationVariable, pick: (maxExclusive: number) => number): string {
  switch (spec.kind) {
    case 'ipv4-host': {
      const span = spec.max - spec.min + 1
      return `${spec.network}.${spec.min + pick(span)}`
    }
    case 'oneOf':
      return spec.values[pick(spec.values.length)]
  }
}

/** แทนที่ `{{ชื่อ}}` ในข้อความด้วยค่าที่สุ่มไว้ */
export function fillPlaceholders(text: string, rolled: RolledVariables): string {
  return text.replace(PLACEHOLDER, (whole, name: string) => rolled[name] ?? whole)
}

/** ชื่อตัวแปรทั้งหมดที่ข้อความหนึ่งอ้างถึง */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((m) => m[1])
}

/**
 * แทนค่าตัวแปรลงในโจทย์ทั้งชิ้น — ทั้งที่ผู้เรียนอ่าน (`brief`, `label`) และที่
 * เซิร์ฟเวอร์ใช้ตรวจ (`requirements[].value`) · คืน `null` ถ้าแทนค่าไม่ครบ
 *
 * ⚠️ ต้องแทนทั้งสองฝั่งเสมอ ถ้าแทนแค่ `brief` ผู้เรียนจะเห็นโจทย์ใหม่แต่ถูกตรวจ
 * ด้วยค่าเดิม — ตั้งค่าถูกตามที่อ่านแล้วไม่ผ่าน ซึ่งไม่มีทางเดาสาเหตุได้เลย
 *
 * ⚠️ ทำไมต้อง fail closed แทนที่จะคืนโจทย์ดิบ (RIL cross-model รอบ W1):
 * attempt ที่ออก**ก่อน**โค้ดชุดนี้ deploy ไม่มี `simulationVars` แต่ยังไม่หมดอายุ
 * ในอีก 60 นาที · ถ้าคืนโจทย์ดิบ ค่าที่ใช้ตรวจจะเป็นสตริง `"{{targetIp}}"` ตรงตัว
 * แปลว่าใครกรอก `{{targetIp}}` ลงช่อง IP ก็ **ผ่านด่าน** ทันที · เคสเดียวกันเกิดได้
 * ทุกครั้งที่เพิ่มตัวแปรใหม่ในไฟล์เนื้อหาแล้ว attempt เก่ายังค้างอยู่
 */
export function resolveChallenge(
  challenge: SimulationChallenge,
  rolled: RolledVariables,
): SimulationChallenge | null {
  const resolved =
    Object.keys(rolled).length === 0
      ? challenge
      : {
          ...challenge,
          brief: fillPlaceholders(challenge.brief, rolled),
          requirements: challenge.requirements.map((req) => ({
            ...req,
            label: fillPlaceholders(req.label, rolled),
            value:
              typeof req.value === 'string'
                ? fillPlaceholders(req.value, rolled)
                : Array.isArray(req.value)
                  ? req.value.map((v) => fillPlaceholders(v, rolled))
                  : req.value,
          })),
          hints: challenge.hints?.map((h) => fillPlaceholders(h, rolled)),
          debrief: challenge.debrief ? fillPlaceholders(challenge.debrief, rolled) : challenge.debrief,
        }

  return hasUnresolvedPlaceholder(resolved) ? null : resolved
}

/** ยังมีแม่แบบค้างอยู่ไหม — ตรวจทั้งฝั่งที่อ่านและฝั่งที่ใช้ตรวจ */
function hasUnresolvedPlaceholder(challenge: SimulationChallenge): boolean {
  const texts = [
    challenge.brief,
    ...(challenge.hints ?? []),
    challenge.debrief ?? '',
    ...challenge.requirements.flatMap((req) => [
      req.label,
      ...(typeof req.value === 'string' ? [req.value] : Array.isArray(req.value) ? req.value : []),
    ]),
  ]
  return texts.some((text) => placeholdersIn(text).length > 0)
}
