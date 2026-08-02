import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { toPublicLesson, toPublicSimulation } from '@/lib/content/public-lesson'
import type { LessonContent } from '@/lib/content/course-types'
import type { SimulationChallenge } from '@/lib/simulation/types'

// เส้นแบ่ง "เซิร์ฟเวอร์รู้ / browser เห็น" (W0-1)
//
// เทสชุดนี้พิสูจน์สองอย่างที่ต่างกัน:
//   1. ฟังก์ชันลดรูปตัดของที่เป็นเฉลยออกจริง — ทดสอบกับ **เนื้อหาจริงทุกไฟล์ในคอร์ส**
//      ไม่ใช่ fixture ที่แต่งให้ผ่าน
//   2. ของที่ตัดออกคือ "กติกาการตรวจ" ไม่ใช่ "โจทย์" — brief ต้องยังอยู่ ไม่งั้น
//      ผู้เรียนไม่มีอะไรให้อ่าน

const contentRoot = join(__dirname, '..', '..', 'content', 'courses')

function everyLesson(): { file: string; lesson: LessonContent }[] {
  const out: { file: string; lesson: LessonContent }[] = []
  for (const slug of readdirSync(contentRoot)) {
    const localesDir = join(contentRoot, slug, 'locales')
    for (const locale of readdirSync(localesDir)) {
      const lessonsDir = join(localesDir, locale, 'lessons')
      for (const name of readdirSync(lessonsDir)) {
        const file = join(lessonsDir, name)
        out.push({ file: `${slug}/${locale}/${name}`, lesson: JSON.parse(readFileSync(file, 'utf8')) })
      }
    }
  }
  return out
}

const lessons = everyLesson()

describe('toPublicLesson — เนื้อหาจริงทุกไฟล์', () => {
  it('มีบทเรียนให้ตรวจจริง (กันเทสผ่านเพราะลูปว่าง)', () => {
    expect(lessons.length).toBeGreaterThan(5)
  })

  it.each(lessons.map((l) => l.file))('%s: payload ไม่มีเฉลยหรือคำอธิบายเหลืออยู่เลย', (file) => {
    const { lesson } = lessons.find((l) => l.file === file)!
    const serialized = JSON.stringify(toPublicLesson(lesson))

    // ใช้ `explanation` เป็นตัวชี้วัด ไม่ใช่ค่าเฉลย — เฉลย MCQ คือตัวอักษรเดี่ยว
    // ("A"/"B") ซึ่งเป็น key ของ choices ที่ **ต้อง** อยู่ใน payload อยู่แล้ว
    for (const q of [...lesson.checkpoint, ...(lesson.videoCueQuestions ?? [])]) {
      expect(serialized, `${file}: ${q.id} ยังพา explanation ไปด้วย`).not.toContain(q.explanation)
    }

    // กติกาการตรวจของโจทย์จำลอง: operator/value ต้องไม่เหลือ และ hints ต้องหายไป
    for (const block of lesson.blocks) {
      if (block.kind !== 'simulation') continue
      for (const req of block.challenge.requirements) {
        expect(serialized, `${file}: requirement ${req.id} ยังพา operator ไปด้วย`).not.toContain(
          `"operator":"${req.operator}"`,
        )
      }
      for (const hint of block.challenge.hints ?? []) {
        expect(serialized, `${file}: hints ยังอยู่ใน payload`).not.toContain(hint)
      }
      if (block.challenge.debrief) {
        expect(serialized, `${file}: debrief ยังอยู่ใน payload`).not.toContain(block.challenge.debrief)
      }
    }
  })

  it.each(lessons.map((l) => l.file))('%s: ของที่ต้องใช้แสดงผลยังครบ', (file) => {
    const { lesson } = lessons.find((l) => l.file === file)!
    const pub = toPublicLesson(lesson)

    expect(pub.title).toBe(lesson.title)
    expect(pub.blocks).toHaveLength(lesson.blocks.length)
    expect(pub.checkpoint).toHaveLength(lesson.checkpoint.length)
    for (const [i, q] of lesson.checkpoint.entries()) {
      expect(pub.checkpoint[i].prompt).toBe(q.prompt)
      expect(pub.checkpoint[i].choices).toEqual(q.choices)
    }
    // cueId ต้องรอด — ไม่งั้นส่งคำตอบกลับไม่ได้ว่าเป็นคำถามไหน
    for (const [i, q] of (lesson.videoCueQuestions ?? []).entries()) {
      expect(pub.videoCueQuestions?.[i].cueId).toBe(q.cueId)
    }
  })
})

describe('toPublicSimulation', () => {
  const challenge: SimulationChallenge = {
    id: 'sim-1',
    title: 'ตั้งค่าอินเทอร์เฟซ',
    brief: 'ต้องเข้าถึงได้ที่ 192.168.10.50 เสมอ',
    surface: 'network-interface',
    initial: { mode: 'dhcp' },
    requirements: [
      { id: 'r1', label: 'ที่อยู่ไม่เปลี่ยน', field: 'mode', operator: 'equals', value: 'static' },
      { id: 'r2', label: 'ตั้ง IP ตามโจทย์', field: 'ip', operator: 'equals', value: '192.168.10.50' },
    ],
    hints: ['ลองดูโหมดการรับที่อยู่'],
    debrief: 'static ทำให้ที่อยู่คงเดิมทุกครั้งที่บูต',
  }

  it('เหลือแค่ id กับ label ต่อ requirement', () => {
    const pub = toPublicSimulation(challenge)
    expect(pub.requirements).toEqual([
      { id: 'r1', label: 'ที่อยู่ไม่เปลี่ยน' },
      { id: 'r2', label: 'ตั้ง IP ตามโจทย์' },
    ])
  })

  it('ตัด hints และ debrief ออก แต่ **เก็บ brief ไว้** — brief คือโจทย์ ไม่ใช่เฉลย', () => {
    const pub = toPublicSimulation(challenge) as unknown as Record<string, unknown>
    expect(pub.hints).toBeUndefined()
    expect(pub.debrief).toBeUndefined()
    expect(pub.brief).toBe(challenge.brief)
    expect(pub.initial).toEqual(challenge.initial)
  })

  it('field ที่เพิ่มเข้ามาใหม่ต้องไม่ไหลออกไปเองโดยไม่มีใครรู้', () => {
    // สร้างจากรายชื่อ field ที่อนุญาต ไม่ใช่ spread แล้วลบทีหลัง — ถ้าวันหนึ่งมีคนเพิ่ม
    // field ที่เป็นความลับเข้า SimulationChallenge เทสนี้จะจับได้ทันที
    const withSecret = { ...challenge, gradingNotes: 'เฉลย: static + .50' } as SimulationChallenge
    const serialized = JSON.stringify(toPublicSimulation(withSecret))
    expect(serialized).toContain('sim-1')
    expect(serialized).not.toContain('gradingNotes')
  })
})
