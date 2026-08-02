import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// โครง attempt (W0-0) — พื้นผิว API ที่ผู้เรียนได้โจทย์ของด่านวัดผล
//
// สิ่งที่ต้องพิสูจน์ที่ชั้นนี้ (ชั้น DB มีเทส race/replay/ownership แยกอยู่แล้ว):
//   1. ไม่มี session = ไม่มี attempt — 401 ไม่ใช่โจทย์เปล่าๆ
//   2. โจทย์ที่ส่งมา "ไม่มีเฉลยติดมา" — assert ด้วยสตริง explanation จริงจากไฟล์คอร์ส
//      (อย่า assert ด้วยเฉลย "A"/"B" — มันคือ key ของ choices ที่ต้องอยู่ใน payload อยู่แล้ว)
//   3. โควตาต่อ (user, node) บังคับจริงที่ API — ครั้งที่เกินได้ 429
//
// ใช้ capstone ของคอร์ส demo — บัญชี e2e ถูกสร้างใหม่ทุก run (auth.setup) โควตาจึง
// ไม่ค้างข้าม run

const COURSE = 'content-formats-demo'
const CAPSTONE = 'formats-hands-on'
const LESSON_NODE = 'formats-references'

const lessonFile = JSON.parse(
  readFileSync(
    join(__dirname, '..', 'content', 'courses', COURSE, 'locales', 'en', 'lessons', `${CAPSTONE}.json`),
    'utf8',
  ),
) as { checkpoint: { id: string; prompt: string; choices: Record<string, string>; explanation: string }[] }

test.describe('POST /api/attempts', () => {
  test('ไม่ล็อกอิน = ไม่มี attempt (401)', async ({ playwright, baseURL }) => {
    // ⚠️ newContext() ใต้ @playwright/test สืบทอด storageState ของ project —
    // ต้องล้างเป็นค่าว่างชัดๆ ไม่งั้น "anon" จะแอบถือ session ของ learner แล้วเทสนี้
    // จะวัดคนละอย่างกับที่ตั้งใจ (เจอจริงตอนรันครั้งแรก: ได้ 200 เพราะ cookie ติดไป)
    const anon = await playwright.request.newContext({
      baseURL: baseURL!,
      storageState: { cookies: [], origins: [] },
    })
    const res = await anon.post('/api/attempts', { data: { slug: COURSE, nodeId: CAPSTONE } })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })

  test('บทปกติยังไม่มีพื้นผิววัดผลแบบ attempt (400)', async ({ request }) => {
    const res = await request.post('/api/attempts', { data: { slug: COURSE, nodeId: LESSON_NODE } })
    expect(res.status()).toBe(400)
  })

  test('node ที่ไม่มีจริงถูกปฏิเสธ (404)', async ({ request }) => {
    const res = await request.post('/api/attempts', { data: { slug: COURSE, nodeId: 'ไม่มีบทนี้' } })
    expect(res.status()).toBe(404)
  })

  test('ออก attempt ได้โจทย์ครบ โดยไม่มีเฉลยหรือคำอธิบายติดมา', async ({ request }) => {
    const res = await request.post('/api/attempts', { data: { slug: COURSE, nodeId: CAPSTONE } })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()

    expect(body.attemptId).toMatch(/^[0-9a-f-]{36}$/)
    expect(Date.parse(body.expiresAt)).toBeGreaterThan(Date.now())

    // โจทย์ครบตามจำนวนของ capstone และแต่ละข้อมีของที่ใช้แสดงผลเท่านั้น
    expect(body.questions).toHaveLength(lessonFile.checkpoint.length)
    for (const q of body.questions as Record<string, unknown>[]) {
      expect(Object.keys(q).sort()).toEqual(['choices', 'id', 'prompt'])
    }

    // เฉลยต้องไม่รั่ว: explanation เป็นสตริงยาวไม่ซ้ำกับอะไร ใช้เป็นตัวชี้วัดได้จริง
    const payload = JSON.stringify(body)
    for (const q of lessonFile.checkpoint) {
      expect(payload).not.toContain(q.explanation)
    }
  })

  test('โควตาต่อบท: 3 ครั้งแรกได้ ครั้งที่ 4 ต้อง 429 เป๊ะ', async ({ request }) => {
    // ใช้ capstone ของอีกคอร์สที่ไม่มีเทสไหนออก attempt — ลำดับจึงบังคับได้เป๊ะ
    // (ถ้ายอมรับช่วง "1–3 ครั้ง" เพดานที่พิมพ์ผิดเป็น 4 ก็เขียวได้ — RIL จับ)
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) {
      const res = await request.post('/api/attempts', {
        data: { slug: 'basic-os-linux', nodeId: 'permissions' },
      })
      statuses.push(res.status())
    }
    expect(statuses).toEqual([200, 200, 200, 429])
  })
})
