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
    // MCQ ในด่าน (รูปไฟล์เดิมไม่มี `kind` — loader เติมให้ แต่ไฟล์ดิบยังไม่มี)
    const mcqs = lesson.checkpoint.filter((item) => !('kind' in item) || item.kind === 'mcq')
    for (const q of [...mcqs, ...(lesson.videoCueQuestions ?? [])]) {
      expect(serialized, `${file}: ${q.id} ยังพา explanation ไปด้วย`).not.toContain(q.explanation)
    }

    // แม่แบบตัวแปรต้องไม่หลุดไปหา browser เลย — ถ้าหลุด ผู้เรียนอ่านเจอ `{{targetIp}}`
    expect(serialized, `${file}: แม่แบบตัวแปรหลุดไปกับ payload`).not.toContain('{{')

    // กติกาการตรวจของโจทย์จำลอง — ทั้งที่อยู่ในบล็อกเนื้อหาและที่เป็นด่านท้ายบท (W1)
    const simulationChallenges = [
      ...lesson.blocks.flatMap((b) => (b.kind === 'simulation' ? [b.challenge] : [])),
      // ด่านท้ายบทไม่ถูกส่งมากับหน้าแล้ว (W1) แต่ยังตรวจว่าไม่มีอะไรของมันหลุดมา
      ...lesson.checkpoint.flatMap((item) => ('kind' in item && item.kind === 'simulation' ? [item.challenge] : [])),
    ]
    for (const challenge of simulationChallenges) {
      const block = { challenge }
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
    for (const [i, item] of lesson.checkpoint.entries()) {
      const pubItem = pub.checkpoint[i]
      if ('kind' in item && item.kind === 'simulation') {
        // ด่านจำลองผูกกับ attempt ตั้งแต่ W1 — หน้า lesson บอกได้แค่ว่า "มีด่าน id นี้"
        // ตัวโจทย์ (ที่แทนค่าสุ่มแล้ว) มาจาก /api/attempts เท่านั้น · ถ้าส่งของในไฟล์
        // มาด้วย ผู้เรียนจะเห็นแม่แบบ `{{targetIp}}` ซึ่งไม่ใช่โจทย์ของใครเลย
        expect(pubItem.kind).toBe('simulation')
        if (pubItem.kind === 'simulation') {
          expect(pubItem.id).toBe(item.id)
          expect(pubItem.challenge, 'หน้า lesson ต้องไม่ส่งโจทย์ในไฟล์มาด้วย').toBeUndefined()
        }
        continue
      }
      expect(pubItem.kind).toBe('mcq')
      if (pubItem.kind === 'mcq') {
        expect(pubItem.prompt).toBe(item.prompt)
        expect(pubItem.choices).toEqual(item.choices)
      }
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

describe('ด่านที่ผูกกับ attempt — หน้า lesson ส่งได้แค่รายชื่องาน', () => {
  // รูที่ชุดนี้ปิด (RIL cross-model รอบ 2): หน้ายังส่ง `choices` ชุด key จริงมาด้วย
  // คนที่ผ่านแล้วบอกเพื่อนว่า "B, C, B" เพื่อนเทียบข้อความระหว่างหน้ากับ /api/attempts
  // แล้วแปลงเป็น key ของ attempt ตัวเองได้ทันที — remap จึงไม่เหลือความหมายเลย
  const withCheckpoint = lessons.find(({ lesson }) =>
    lesson.checkpoint.some((item) => !('kind' in item) || item.kind === 'mcq'),
  )!

  it('🔴 tasksFromAttempt: ไม่มี prompt/choices ติดไปกับหน้า', () => {
    const pub = toPublicLesson(withCheckpoint.lesson, { tasksFromAttempt: true })
    for (const item of pub.checkpoint) {
      expect(item.kind === 'mcq' ? item.choices : undefined).toBeUndefined()
      expect(item.kind === 'mcq' ? item.prompt : undefined).toBeUndefined()
      expect(item.id).toBeTruthy()
    }
    const serialized = JSON.stringify(pub)
    for (const item of withCheckpoint.lesson.checkpoint) {
      if ('kind' in item && item.kind === 'simulation') continue
      for (const text of Object.values(item.choices)) {
        expect(serialized, `ข้อความตัวเลือกของ ${item.id} ยังติดมากับหน้า`).not.toContain(text)
      }
    }
  })

  it('ค่าเริ่มต้น (บทสอนทั่วไป) ยังส่งโจทย์มาเหมือนเดิม', () => {
    const pub = toPublicLesson(withCheckpoint.lesson)
    const mcq = pub.checkpoint.find((item) => item.kind === 'mcq')!
    expect(mcq.kind === 'mcq' ? mcq.choices : undefined).toBeTruthy()
  })
})
