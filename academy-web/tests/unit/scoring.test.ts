import { describe, expect, it } from 'vitest'
import type { McqItem, PbqField, PbqItem } from '@/lib/content/types'
import { firstObjective, gradeMcq, gradePbqField, scoreExam } from '@/lib/player/scoring'

const mcq = (over: Partial<McqItem> = {}): McqItem => ({
  id: 'Q1',
  moduleId: 'm1',
  moduleTitle: 'Module 1',
  objective: '1.1',
  type: 'single',
  stem: 'stem',
  choices: { A: 'a', B: 'b', C: 'c' },
  correct: ['A'],
  ...over,
})

describe('gradeMcq — all-or-nothing', () => {
  it('single: ตรงตัวเดียว = ถูก', () => {
    expect(gradeMcq(mcq(), ['A'])).toBe(true)
    expect(gradeMcq(mcq(), ['B'])).toBe(false)
  })

  it('multi: ต้องถูกทั้ง set — เกิน/ขาด = ผิด ไม่มี partial', () => {
    const q = mcq({ type: 'multi', correct: ['A', 'C'] })
    expect(gradeMcq(q, ['A', 'C'])).toBe(true)
    expect(gradeMcq(q, ['C', 'A'])).toBe(true) // ลำดับไม่สำคัญ
    expect(gradeMcq(q, ['A'])).toBe(false) // ขาด
    expect(gradeMcq(q, ['A', 'B', 'C'])).toBe(false) // เกิน
  })

  it('ไม่ตอบ = ผิด', () => {
    expect(gradeMcq(mcq(), undefined)).toBe(false)
    expect(gradeMcq(mcq(), [])).toBe(false)
  })
})

describe('gradePbqField — ตาม kind', () => {
  const checks: PbqField = { id: 'f1', label: 'l', kind: 'checks', options: ['a', 'b', 'c'], correct: ['a', 'b'] }
  const select: PbqField = { id: 'f2', label: 'l', kind: 'select', options: ['x', 'y'], correct: 'x' }
  const order: PbqField = { id: 'f3', label: 'l', kind: 'order', options: ['1', '2', '3'], correct: ['1', '2', '3'] }

  it('checks = set equality (ลำดับไม่สำคัญ, เกิน/ขาด = ผิด)', () => {
    expect(gradePbqField(checks, ['b', 'a'])).toBe(true)
    expect(gradePbqField(checks, ['a'])).toBe(false)
    expect(gradePbqField(checks, ['a', 'b', 'c'])).toBe(false)
  })

  it('select = string equality', () => {
    expect(gradePbqField(select, 'x')).toBe(true)
    expect(gradePbqField(select, 'y')).toBe(false)
  })

  it('order = ลำดับต้องตรงเป๊ะ', () => {
    expect(gradePbqField(order, ['1', '2', '3'])).toBe(true)
    expect(gradePbqField(order, ['2', '1', '3'])).toBe(false)
    expect(gradePbqField(order, ['1', '2'])).toBe(false)
  })

  it('ไม่ตอบ = ผิด ทุก kind', () => {
    expect(gradePbqField(checks, undefined)).toBe(false)
    expect(gradePbqField(select, undefined)).toBe(false)
    expect(gradePbqField(order, undefined)).toBe(false)
  })

  it('text (นอก fixture) = ไม่ grade', () => {
    const text: PbqField = { id: 'f4', label: 'l', kind: 'text', correct: 'ans', aliases: ['answer'] }
    expect(gradePbqField(text, 'ans')).toBe(false)
  })
})

describe('firstObjective', () => {
  it('หลายค่า → ตัวแรก trim แล้ว', () => {
    expect(firstObjective('1.5, 3.6')).toBe('1.5')
    expect(firstObjective('4.3')).toBe('4.3')
  })
})

describe('scoreExam — denominator + breakdown + attribution', () => {
  const pbq: PbqItem = {
    id: 'PBQ-X',
    title: 'pbq',
    objective: '2.1, 4.4', // attribution → 2.1 เท่านั้น
    scenario: 's',
    fields: [
      { id: 'a', label: 'a', kind: 'select', options: ['x', 'y'], correct: 'x' },
      { id: 'b', label: 'b', kind: 'checks', options: ['p', 'q'], correct: ['p'] },
      { id: 'c', label: 'c', kind: 'order', options: ['1', '2'], correct: ['1', '2'] },
    ],
  }
  const questions = [
    mcq({ id: 'Q1', moduleId: 'm1', moduleTitle: 'M1', objective: '1.1', correct: ['A'] }),
    mcq({ id: 'Q2', moduleId: 'm1', moduleTitle: 'M1', objective: '1.2', correct: ['B'] }),
    mcq({ id: 'Q3', moduleId: 'm1', moduleTitle: 'M1', objective: '1.1', correct: ['C'] }),
    mcq({ id: 'Q4', moduleId: 'm2', moduleTitle: 'M2', objective: '2.1', correct: ['A'] }),
  ]

  it('นับหน่วยครั้งเดียว: 4 MCQ + 3 PBQ fields = 7 หน่วย — PBQ ไม่เข้า module breakdown', () => {
    const score = scoreExam(
      { questions, pbqs: [pbq] },
      {
        mcq: { Q1: ['A'], Q2: ['B'], Q3: ['A'], Q4: undefined }, // 2 ถูก
        pbq: { 'PBQ-X': { a: 'x', b: ['q'], c: ['1', '2'] } }, // 2 ถูก
      },
    )
    expect(score.totalUnits).toBe(7)
    expect(score.correctUnits).toBe(4)
    // module breakdown มีแค่ m1(3) + m2(1) — ไม่มีหน่วย PBQ ปน
    const total = score.moduleBreakdown.reduce((s, g) => s + g.totalUnits, 0)
    expect(total).toBe(4)
    expect(score.pbqGroup!.totalUnits).toBe(3)
    expect(score.pbqGroup!.correctUnits).toBe(2)
  })

  it('objective ของ PBQ เข้าเฉพาะตัวแรก (2.1) — กัน double-count', () => {
    const score = scoreExam(
      { questions, pbqs: [pbq] },
      { mcq: {}, pbq: { 'PBQ-X': { a: 'x', b: ['p'], c: ['1', '2'] } } },
    )
    const obj21 = score.objectiveBreakdown.find((g) => g.key === '2.1')!
    const obj44 = score.objectiveBreakdown.find((g) => g.key === '4.4')
    expect(obj21.totalUnits).toBe(4) // Q4 (1) + PBQ fields (3)
    expect(obj44).toBeUndefined()
    // denominator รวมทุกกลุ่ม objective = totalUnits (นับครั้งเดียว)
    const sum = score.objectiveBreakdown.reduce((s, g) => s + g.totalUnits, 0)
    expect(sum).toBe(score.totalUnits)
  })

  it('weakest domain: เฉพาะ module ≥3 หน่วย; ต่ำกว่า = ไม่เข้าเกณฑ์', () => {
    const score = scoreExam(
      { questions, pbqs: [] },
      { mcq: { Q1: ['A'], Q2: ['X'], Q3: ['X'], Q4: ['X'] } }, // m1 = 1/3, m2 = 0/1
    )
    // m2 มีแค่ 1 หน่วย → ไม่เข้าเกณฑ์ แม้ 0%
    expect(score.weakestModules).toHaveLength(1)
    expect(score.weakestModules![0].key).toBe('m1')
  })

  it('weakest domain: ไม่มี module ถึง 3 หน่วย → null (ข้อมูลไม่พอ)', () => {
    const score = scoreExam(
      { questions: questions.slice(2), pbqs: [] },
      { mcq: {} },
    )
    expect(score.weakestModules).toBeNull()
  })

  it('weakest domain เสมอกัน → คืนทุกตัวที่เสมอ', () => {
    const qs = [
      ...['a', 'b', 'c'].map((s, i) => mcq({ id: `A${i}`, moduleId: 'm1', moduleTitle: 'M1', objective: '1.1' })),
      ...['a', 'b', 'c'].map((s, i) => mcq({ id: `B${i}`, moduleId: 'm2', moduleTitle: 'M2', objective: '2.1' })),
    ]
    const score = scoreExam({ questions: qs, pbqs: [] }, { mcq: {} }) // ทุกข้อผิด → 0% เสมอ
    expect(score.weakestModules!.map((g) => g.key).sort()).toEqual(['m1', 'm2'])
  })

  it('percent ปัดทศนิยม 1 ตำแหน่ง และชุดว่าง = 0', () => {
    const score = scoreExam({ questions: [], pbqs: [] }, { mcq: {}, pbq: {} })
    expect(score.totalUnits).toBe(0)
    expect(score.percent).toBe(0)
    expect(score.pbqGroup).toBeNull()
  })
})
