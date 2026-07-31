import { describe, expect, it } from 'vitest'
import type { McqItem, PbqField } from '@/lib/content/types'
import { gradeMcq, gradePbqField } from '@/lib/player/scoring'
import { assertManifestContract, buildCourseContent, loadFullLength, loadModuleBank } from '@/lib/content/loader'
import { loadAttempt, newAttempt, saveAttempt, type ProgressStore } from '@/lib/player/progress'

// Regression tests สำหรับ findings จาก review lane อิสระ (2026-07-31)

const mcq = (over: Partial<McqItem> = {}): McqItem => ({
  id: 'Q1',
  moduleId: 'm1',
  moduleTitle: 'M1',
  objective: '1.1',
  type: 'multi',
  stem: 's',
  choices: { A: 'a', B: 'b', C: 'c' },
  correct: ['A', 'B'],
  ...over,
})

describe('scoring: คำตอบมีสมาชิกซ้ำต้องไม่ผ่านด้วย length เท่ากัน', () => {
  it("MCQ multi: ['A','A'] กับ correct ['A','B'] = ผิด", () => {
    expect(gradeMcq(mcq(), ['A', 'A'])).toBe(false)
  })

  it("MCQ: ['A','A'] กับ correct ['A'] = ถูก (เซ็ตเดียวกัน)", () => {
    expect(gradeMcq(mcq({ type: 'single', correct: ['A'] }), ['A', 'A'])).toBe(true)
  })

  it("PBQ checks: duplicate ในคำตอบไม่หลอก grader", () => {
    const field: PbqField = { id: 'f', label: 'l', kind: 'checks', options: ['x', 'y', 'z'], correct: ['x', 'y'] }
    expect(gradePbqField(field, ['x', 'x'])).toBe(false)
    expect(gradePbqField(field, ['y', 'x'])).toBe(true)
  })
})

describe('loader: semantic invariants', () => {
  const partFile = (questions: unknown[]) => ({
    id: 'p1',
    sourceModuleId: 'm1',
    sourceSlug: 'slug',
    title: 'P1',
    moduleTitle: 'M1',
    part: 1,
    questions,
  })

  it('correct ชี้ตัวเลือกที่ไม่มีใน choices → error', () => {
    expect(() =>
      loadModuleBank('slug', [{ file: 'p1.json', data: partFile([mcq({ correct: ['Z'] }) as unknown]) }]),
    ).toThrow(/ไม่มีใน choices/)
  })

  it('type=single แต่ correct 2 ตัว → error', () => {
    expect(() =>
      loadModuleBank('slug', [
        { file: 'p1.json', data: partFile([mcq({ type: 'single', correct: ['A', 'B'] }) as unknown]) },
      ]),
    ).toThrow(/single/)
  })

  it('PBQ correct มีค่านอก options → error', () => {
    const fl = {
      id: 'fl',
      title: 't',
      timeLimitMinutes: 60,
      normalQuestions: [mcq({ type: 'single', correct: ['A'] })],
      pbqs: [
        {
          id: 'P1',
          title: 't',
          objective: '1.1',
          scenario: 's',
          fields: [{ id: 'f1', label: 'l', kind: 'select', options: ['a', 'b'], correct: 'zzz' }],
        },
      ],
    }
    expect(() => loadFullLength('fl.json', fl)).toThrow(/ไม่อยู่ใน options/)
  })

  it('PBQ field id ซ้ำ → error', () => {
    const fl = {
      id: 'fl',
      title: 't',
      timeLimitMinutes: 60,
      normalQuestions: [mcq({ type: 'single', correct: ['A'] })],
      pbqs: [
        {
          id: 'P1',
          title: 't',
          objective: '1.1',
          scenario: 's',
          fields: [
            { id: 'f1', label: 'l', kind: 'select', options: ['a'], correct: 'a' },
            { id: 'f1', label: 'l2', kind: 'select', options: ['b'], correct: 'b' },
          ],
        },
      ],
    }
    expect(() => loadFullLength('fl.json', fl)).toThrow(/field id ซ้ำ/)
  })
})

describe('manifest contract', () => {
  const bank = loadModuleBank('slug', [
    {
      file: 'p1.json',
      data: {
        id: 'p1',
        sourceModuleId: 'm1',
        sourceSlug: 'slug',
        title: 'P1',
        moduleTitle: 'M1',
        part: 1,
        questions: [mcq({ type: 'single', correct: ['A'] })],
      },
    },
  ])
  const content = buildCourseContent([bank], [])

  it('จำนวนตรง manifest → ผ่าน', () => {
    expect(() =>
      assertManifestContract(content, { modules: [{ slug: 'slug', questionCount: 1, parts: [] }] }, 'manifest.json'),
    ).not.toThrow()
  })

  it('โหลดได้น้อยกว่า manifest (ไฟล์หาย) → error ไม่เงียบ', () => {
    expect(() =>
      assertManifestContract(content, { modules: [{ slug: 'slug', questionCount: 10, parts: [] }] }, 'manifest.json'),
    ).toThrow(/manifest ระบุ 10/)
  })

  it('module ใน manifest โหลดไม่พบ → error', () => {
    expect(() =>
      assertManifestContract(content, { modules: [{ slug: 'other', questionCount: 1, parts: [] }] }, 'manifest.json'),
    ).toThrow(/โหลดไม่พบ/)
  })
})

describe('progress: deep validation ของ record ที่พังละเอียด', () => {
  function memStore(): ProgressStore & { map: Map<string, string> } {
    const map = new Map<string, string>()
    return {
      map,
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
      keys: () => [...map.keys()],
    }
  }

  it.each([
    ['answers.mcq = null', (r: Record<string, unknown>) => ((r.answers as Record<string, unknown>).mcq = null)],
    ['answers = array', (r: Record<string, unknown>) => (r.answers = [])],
    ['mcq answer เป็น number', (r: Record<string, unknown>) => (((r.answers as Record<string, Record<string, unknown>>).mcq)['Q1'] = 42)],
    ['pbq field เป็น object', (r: Record<string, unknown>) => (((r.answers as Record<string, Record<string, unknown>>).pbq)['P1'] = { f1: {} })],
    ['endsAt เป็น string', (r: Record<string, unknown>) => (r.endsAt = 'soon')],
  ])('%s → ถือว่า corrupt: ลบ + แจ้ง ไม่ปล่อยไป crash ใน player', (_name, mutate) => {
    const store = memStore()
    const rec = newAttempt('exam-1', 'exam', { now: 1000 })
    saveAttempt(store, rec)
    const key = [...store.map.keys()][0]
    const raw = JSON.parse(store.map.get(key)!) as Record<string, unknown>
    mutate(raw)
    store.map.set(key, JSON.stringify(raw))
    const result = loadAttempt(store, 'exam-1', rec.attemptId)
    expect(result.record).toBeNull()
    expect(result.corruptReset).toBe(true)
  })
})
