import { describe, expect, it } from 'vitest'
import { ContentValidationError, loadFullLength, loadModuleBank } from '@/lib/content/loader'

const validMcq = {
  id: 'M1-001',
  moduleId: 'm1',
  moduleTitle: 'Module 1',
  objective: '1.1',
  type: 'single',
  stem: 'What?',
  choices: { A: 'a', B: 'b' },
  correct: ['A'],
}

const partFile = (part: number, questions: unknown[] = [validMcq]) => ({
  id: `slug-part-0${part}`,
  sourceModuleId: 'm1',
  sourceSlug: 'slug',
  title: `Part ${part}`,
  moduleTitle: 'Module 1',
  part,
  questionRange: [1, 10],
  questions,
})

describe('loadModuleBank', () => {
  it('รวม parts เรียงตามเลข part', () => {
    const bank = loadModuleBank('slug', [
      { file: 'part-02.json', data: partFile(2, [{ ...validMcq, id: 'M1-002' }]) },
      { file: 'part-01.json', data: partFile(1) },
    ])
    expect(bank.questions.map((q) => q.id)).toEqual(['M1-001', 'M1-002'])
    expect(bank.moduleId).toBe('m1')
  })

  it('ไฟล์พัง → error บอกไฟล์ + field ที่พัง ไม่ล้มเงียบ', () => {
    const broken = partFile(1, [{ ...validMcq, correct: [] }])
    try {
      loadModuleBank('slug', [{ file: 'part-01.json', data: broken }])
      expect.unreachable('ต้อง throw')
    } catch (err) {
      expect(err).toBeInstanceOf(ContentValidationError)
      expect((err as Error).message).toContain('part-01.json')
      expect((err as Error).message).toContain('correct')
    }
  })

  it('id ซ้ำข้าม parts → error', () => {
    expect(() =>
      loadModuleBank('slug', [
        { file: 'part-01.json', data: partFile(1) },
        { file: 'part-02.json', data: partFile(2) },
      ]),
    ).toThrow(/id ซ้ำ/)
  })
})

describe('loadFullLength', () => {
  const fl = {
    id: 'fl-1',
    title: 'FL',
    timeLimitMinutes: 165,
    normalQuestions: [validMcq],
    pbqs: [
      {
        id: 'PBQ-1',
        title: 'p',
        objective: '1.5, 3.6',
        scenario: 's',
        exhibit: ['line1', 'line2'],
        fields: [
          { id: 'f1', label: 'l', kind: 'checks', options: ['a'], correct: ['a'] },
          { id: 'f2', label: 'l', kind: 'select', options: ['a', 'b'], correct: 'a' },
          { id: 'f3', label: 'l', kind: 'order', options: ['a', 'b'], correct: ['a', 'b'] },
        ],
      },
    ],
  }

  it('โหลดสำเร็จ — preserve exhibit และทุก field kind', () => {
    const test = loadFullLength('fl.json', fl)
    expect(test.timeLimitMinutes).toBe(165)
    expect(test.pbqs[0].exhibit).toEqual(['line1', 'line2'])
    expect(test.pbqs[0].fields.map((f) => f.kind)).toEqual(['checks', 'select', 'order'])
  })

  it('kind=select แต่ correct เป็น array → error ชี้ field', () => {
    const bad = structuredClone(fl) as Record<string, unknown>
    ;(bad.pbqs as Array<{ fields: Array<{ correct: unknown }> }>)[0].fields[1].correct = ['a']
    expect(() => loadFullLength('fl.json', bad)).toThrow(/f2/)
  })

  it('kind=order ไม่มี options → error', () => {
    const bad = structuredClone(fl) as Record<string, unknown>
    delete (bad.pbqs as Array<{ fields: Array<Record<string, unknown>> }>)[0].fields[2].options
    expect(() => loadFullLength('fl.json', bad)).toThrow(/f3/)
  })

  it('timed ไม่มี timeLimitMinutes → error', () => {
    const bad: Record<string, unknown> = { ...fl }
    delete bad.timeLimitMinutes
    expect(() => loadFullLength('fl.json', bad)).toThrow(ContentValidationError)
  })

  it('มี/ไม่มี PBQ ก็โหลดได้ (pbqs ว่าง)', () => {
    const noPbq = { ...fl, pbqs: [] }
    expect(loadFullLength('fl.json', noPbq).pbqs).toEqual([])
  })
})
