import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// Fixture integrity (แผน §3) — กัน fixture ถูกคัดลอกผิด/ตกหล่นแล้ว acceptance เขียวปลอม
// ตัวเลขนับจริงจาก source ณ วันคัดลอก (Crucible 640c8613, 2026-07-31):
// 15 parts · 150 MCQ (questionRange 1–150) — หมายเหตุ: แผนเขียน 165 ซึ่งเป็นความคลาด
// เคลื่อนของรอบวางแผน; source + manifest ของ source เองยืนยัน 150 (ดู fixtures/cas005/README.md)
// FL-02: 85 MCQ + 5 PBQ · 21 fields · kinds {checks, select, order} · PBQ-009 มี exhibit

const FIXTURE = join(__dirname, '..', '..', 'fixtures', 'cas005')
const MODULE_DIR = join(FIXTURE, 'module-banks', 'module-1-governance-risk-compliance')

interface PartFile {
  part: number
  questions: Array<{ id: string; type: string }>
}
interface FullLength {
  normalQuestions: Array<{ id: string }>
  pbqs: Array<{ id: string; exhibit?: string[]; fields: Array<{ kind: string }> }>
}

describe('fixture integrity — module-1', () => {
  const files = readdirSync(MODULE_DIR).filter((f) => f.endsWith('.json'))

  it('มี 15 part files ครบ', () => {
    expect(files).toHaveLength(15)
  })

  it('รวม 150 MCQ — ทุก id ไม่ซ้ำ ทุก type อยู่ใน {single, multi}', () => {
    let total = 0
    const ids = new Set<string>()
    for (const f of files) {
      const data = JSON.parse(readFileSync(join(MODULE_DIR, f), 'utf8')) as PartFile
      for (const q of data.questions) {
        total += 1
        ids.add(q.id)
        expect(['single', 'multi']).toContain(q.type)
      }
    }
    expect(total).toBe(150)
    expect(ids.size).toBe(150)
  })
})

describe('fixture integrity — full-length-02', () => {
  const fl = JSON.parse(
    readFileSync(join(FIXTURE, 'full-length', 'cas005-full-practice-02.json'), 'utf8'),
  ) as FullLength

  it('85 MCQ + 5 PBQ', () => {
    expect(fl.normalQuestions).toHaveLength(85)
    expect(fl.pbqs).toHaveLength(5)
  })

  it('PBQ fields รวม 21 และเซ็ต kind = {checks, select, order} พอดี', () => {
    const fields = fl.pbqs.flatMap((p) => p.fields)
    expect(fields).toHaveLength(21)
    expect(new Set(fields.map((f) => f.kind))).toEqual(new Set(['checks', 'select', 'order']))
  })

  it('PBQ-009 มี exhibit (ต้อง preserve + render)', () => {
    const pbq9 = fl.pbqs.find((p) => p.id === 'PBQ-009')!
    expect(pbq9.exhibit).toBeDefined()
    expect(pbq9.exhibit!.length).toBeGreaterThan(0)
  })
})
