import type { FullLengthTest, McqItem, PbqField, PbqItem } from '@/lib/content/types'
import { GRADABLE_PBQ_KINDS } from '@/lib/content/types'

// Scoring spec ตายตัวตามแผน §4-M2-3 — ห้ามตีความใหม่:
// - MCQ 1 ข้อ = 1 หน่วย; multi = all-or-nothing (ถูกทั้ง set)
// - PBQ ให้คะแนนต่อ field (1 field = 1 หน่วย, grade ตาม kind)
// - ไม่ตอบ = ผิด; denominator = หน่วยทั้งหมดในชุด นับหน่วยละครั้งเดียว
// - MCQ เข้า module ตาม moduleId + objective ตาม objective ของข้อ
// - PBQ ไม่มี moduleId → ไม่เข้า module breakdown (กลุ่ม "PBQ" แยก);
//   objective ของ PBQ หลายค่า → ทุก field เข้า objective ตัวแรกเท่านั้น (กัน double-count)
// - weakest domain = module กลุ่มคะแนน% ต่ำสุดที่มี ≥3 หน่วย; ต่ำกว่านั้น "ข้อมูลไม่พอ";
//   เสมอกัน → คืนทุกตัวที่เสมอ

export type McqAnswer = string[] | undefined
/** คำตอบ PBQ ต่อ field: checks/order = string[], select = string */
export type PbqFieldAnswer = string | string[] | undefined

export interface ExamAnswers {
  mcq: Record<string, McqAnswer>
  pbq: Record<string, Record<string, PbqFieldAnswer>>
}

export interface GroupScore {
  key: string
  label: string
  correctUnits: number
  totalUnits: number
  percent: number
}

export interface ExamScore {
  correctUnits: number
  totalUnits: number
  percent: number
  moduleBreakdown: GroupScore[]
  /** กลุ่ม PBQ แยกจาก module breakdown */
  pbqGroup: GroupScore | null
  objectiveBreakdown: GroupScore[]
  /** null = ข้อมูลไม่พอ (ไม่มี module ไหนถึง 3 หน่วย) */
  weakestModules: GroupScore[] | null
  mcqResults: Record<string, boolean>
  /** ผลต่อ field: pbqId → fieldId → ถูก/ผิด */
  pbqResults: Record<string, Record<string, boolean>>
}

function sameSet(a: string[], b: string[]): boolean {
  // เทียบเชิงเซ็ตแท้ — dedupe ทั้งสองฝั่งก่อน กันคำตอบซ้ำสมาชิก (เช่น ['A','A'])
  // ถูกนับเทียบ length แล้วผ่านทั้งที่เซ็ตจริงไม่ครบ (finding review lane)
  const sa = new Set(a)
  const sb = new Set(b)
  return sa.size === sb.size && [...sa].every((x) => sb.has(x))
}

function sameOrder(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i])
}

export function gradeMcq(item: McqItem, answer: McqAnswer): boolean {
  if (!answer || answer.length === 0) return false
  // ทั้ง single และ multi: ต้องตรงทั้ง set (single = set ขนาด 1) — all-or-nothing
  return sameSet(answer, item.correct)
}

export function gradePbqField(field: PbqField, answer: PbqFieldAnswer): boolean {
  if (answer === undefined) return false
  switch (field.kind) {
    case 'checks': {
      if (!Array.isArray(answer) || !Array.isArray(field.correct)) return false
      return sameSet(answer, field.correct)
    }
    case 'select':
      return typeof answer === 'string' && answer === field.correct
    case 'order': {
      if (!Array.isArray(answer) || !Array.isArray(field.correct)) return false
      return sameOrder(answer, field.correct)
    }
    case 'text':
      // นอก fixture ที่ล็อก — UI แสดง banner และไม่นับหน่วย (ดู isGradableField)
      return false
  }
}

export function isGradableField(field: PbqField): boolean {
  return (GRADABLE_PBQ_KINDS as readonly string[]).includes(field.kind)
}

/** objective แรกจาก string หลายค่า เช่น "1.5, 3.6" → "1.5" */
export function firstObjective(objective: string): string {
  return objective.split(',')[0]!.trim()
}

interface GroupAcc {
  label: string
  correct: number
  total: number
}

function addUnit(map: Map<string, GroupAcc>, key: string, label: string, correct: boolean) {
  const acc = map.get(key) ?? { label, correct: 0, total: 0 }
  acc.total += 1
  if (correct) acc.correct += 1
  map.set(key, acc)
}

function toGroupScores(map: Map<string, GroupAcc>): GroupScore[] {
  return [...map.entries()]
    .map(([key, { label, correct, total }]) => ({
      key,
      label,
      correctUnits: correct,
      totalUnits: total,
      percent: total === 0 ? 0 : Math.round((correct / total) * 1000) / 10,
    }))
    .sort((a, b) => a.key.localeCompare(b.key))
}

export function scoreExam(
  test: Pick<FullLengthTest, 'questions' | 'pbqs'>,
  answers: ExamAnswers,
): ExamScore {
  const moduleMap = new Map<string, GroupAcc>()
  const objectiveMap = new Map<string, GroupAcc>()
  const mcqResults: Record<string, boolean> = {}
  const pbqResults: Record<string, Record<string, boolean>> = {}
  let correctUnits = 0
  let totalUnits = 0
  let pbqCorrect = 0
  let pbqTotal = 0

  for (const q of test.questions) {
    const correct = gradeMcq(q, answers.mcq[q.id])
    mcqResults[q.id] = correct
    totalUnits += 1
    if (correct) correctUnits += 1
    addUnit(moduleMap, q.moduleId, q.moduleTitle, correct)
    addUnit(objectiveMap, firstObjective(q.objective), `Objective ${firstObjective(q.objective)}`, correct)
  }

  for (const pbq of test.pbqs as PbqItem[]) {
    pbqResults[pbq.id] = {}
    const objKey = firstObjective(pbq.objective)
    for (const field of pbq.fields) {
      if (!isGradableField(field)) continue // kind นอก fixture — ไม่เข้า denominator
      const correct = gradePbqField(field, answers.pbq[pbq.id]?.[field.id])
      pbqResults[pbq.id][field.id] = correct
      totalUnits += 1
      pbqTotal += 1
      if (correct) {
        correctUnits += 1
        pbqCorrect += 1
      }
      // PBQ ไม่เข้า module breakdown — เข้า objective ตัวแรกเท่านั้น
      addUnit(objectiveMap, objKey, `Objective ${objKey}`, correct)
    }
  }

  const moduleBreakdown = toGroupScores(moduleMap)
  const eligible = moduleBreakdown.filter((g) => g.totalUnits >= 3)
  let weakestModules: GroupScore[] | null = null
  if (eligible.length > 0) {
    const min = Math.min(...eligible.map((g) => g.percent))
    weakestModules = eligible.filter((g) => g.percent === min)
  }

  return {
    correctUnits,
    totalUnits,
    percent: totalUnits === 0 ? 0 : Math.round((correctUnits / totalUnits) * 1000) / 10,
    moduleBreakdown,
    pbqGroup:
      pbqTotal > 0
        ? {
            key: 'pbq',
            label: 'PBQ',
            correctUnits: pbqCorrect,
            totalUnits: pbqTotal,
            percent: Math.round((pbqCorrect / pbqTotal) * 1000) / 10,
          }
        : null,
    objectiveBreakdown: toGroupScores(objectiveMap),
    weakestModules,
    mcqResults,
    pbqResults,
  }
}
