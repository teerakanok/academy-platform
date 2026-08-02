import { describe, expect, it } from 'vitest'
import type { CourseNode } from '@/lib/content/course-types'
import {
  isProofBearing,
  isTestOutAvailable,
  LEARN_MODE_ALLOWED_WRONG,
  passesLearnMode,
} from '@/lib/course/assessment-policy'

// นโยบายวัดผล — จุดเดียวที่ตัดสินว่า "อะไรผ่าน" และ "อะไรนับเป็นหลักฐาน"
//
// ไฟล์นี้มีอยู่เพราะสองคำถามนั้นเคยกระจายอยู่หลายที่แล้วหลุดไม่พร้อมกัน:
// API ตัดสินอย่างหนึ่ง UI ตัดสินอีกอย่าง และใบรับรองตัดสินอีกแบบ

const node = (kind: CourseNode['kind']): CourseNode => ({
  id: 'n',
  kind,
  prerequisites: [],
  estimatedMinutes: 5,
  skillWeights: {},
})

describe('passesLearnMode — เกณฑ์ผ่านของบทปกติ', () => {
  it('ตอบผิดทุกข้อไม่ผ่าน ไม่ว่าบทจะมีกี่ข้อ (นี่คือรูเดิม F2)', () => {
    for (const total of [1, 2, 3, 5, 10]) {
      expect(passesLearnMode(0, total), `บท ${total} ข้อ ตอบผิดหมด`).toBe(false)
    }
  })

  it('บทที่มี 1–2 ข้อ ต้องไม่กลายเป็น "ผ่านโดยไม่ต้องถูกเลย"', () => {
    // ⚠️ ถ้าใช้เกณฑ์ "ผิดไม่เกิน 1" อย่างเดียว สองเคสนี้จะผ่านทั้งที่ตอบถูก 0 ข้อ —
    // คือรู F2 เดิมในขนาดที่เล็กลง (เทส e2e จับได้ตอนเขียนครั้งแรก)
    expect(passesLearnMode(0, 1)).toBe(false)
    expect(passesLearnMode(0, 2)).toBe(false)
    expect(passesLearnMode(1, 1)).toBe(true)
    expect(passesLearnMode(1, 2)).toBe(true)
  })

  it(`ผิดได้ไม่เกิน ${LEARN_MODE_ALLOWED_WRONG} ข้อเมื่อยังมีข้อที่ถูก`, () => {
    expect(passesLearnMode(4, 5)).toBe(true) // ผิด 1
    expect(passesLearnMode(3, 5)).toBe(false) // ผิด 2
    expect(passesLearnMode(5, 5)).toBe(true) // ถูกหมด
  })

  it('ตรึงตัวเลขตามที่แผนล็อก — เปลี่ยนแล้วต้องแดงให้คนตัดสินใจ', () => {
    expect(LEARN_MODE_ALLOWED_WRONG).toBe(1)
  })

  it('บทที่ไม่มีคำถามเลยไม่ผ่าน (ไม่มีอะไรให้วัด)', () => {
    expect(passesLearnMode(0, 0)).toBe(false)
  })
})

describe('isProofBearing — อะไรที่ใบรับรองอ้างถึงได้', () => {
  it('เฉพาะ capstone เท่านั้น', () => {
    expect(isProofBearing(node('capstone'))).toBe(true)
    expect(isProofBearing(node('lesson'))).toBe(false)
  })
})

describe('isTestOutAvailable — ปิดจนกว่าจะมีคลังข้อแยก', () => {
  it('ปิดทุก node ในเฟสนี้ (โหมดสอนใช้ชุดข้อเดียวกัน จึงเป็นเครื่องเฉลยให้กัน)', () => {
    expect(isTestOutAvailable(node('lesson'))).toBe(false)
    expect(isTestOutAvailable(node('capstone'))).toBe(false)
  })
})
