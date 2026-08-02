import { test, expect } from '@playwright/test'

// W0-3 — `completed` ของบทปกติไม่ใช่หลักฐาน (แก้ F2 + F3)
//
// 🔴 เกณฑ์ของงานนี้ต้องเป็นเทสแบบ **"ไล่ลองจนผ่าน"** ไม่ใช่ยิงผิดครั้งเดียวแล้วเช็ค —
// แผนระบุตรงๆ ว่าเทสที่ยิงครั้งเดียวจะเขียวทั้งที่ลูป brute-force ยังเปิดอยู่
//
// สิ่งที่ต้องพิสูจน์สองชั้น:
//   1. ตอบผิดเกินเกณฑ์ในบทปกติ → ไม่ได้ `completed` (เดิมตอบผิดทุกข้อก็ได้)
//   2. ไล่ลองจนได้ `completed` ครบทุกบทปกติ (ทำได้จริง และตั้งใจให้ทำได้)
//      → **ยังไม่มีสิทธิ์ใบรับรอง** เพราะ capstone ยังไม่ผ่าน

const COURSE = 'content-formats-demo'
const LESSON = 'formats-reading' // บทปกติ 1 ข้อ (A–D)
const CAPSTONE = 'formats-hands-on'

interface CheckpointResponse {
  ok: boolean
  passed: boolean
  results?: Record<string, boolean>
}

async function answer(
  request: import('@playwright/test').APIRequestContext,
  nodeId: string,
  answers: Record<string, string[]>,
): Promise<CheckpointResponse> {
  const res = await request.post('/api/progress', {
    data: { slug: COURSE, nodeId, action: 'checkpoint', mode: 'learn', answers },
  })
  expect(res.ok()).toBeTruthy()
  return res.json()
}

test.describe('completed คือความคืบหน้า ไม่ใช่หลักฐาน', () => {
  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}`)
  })

  test('ตอบผิดในบทปกติ (เกินเกณฑ์ที่ยอมให้ผิด) → ไม่ได้ completed', async ({ request }) => {
    // บทนี้มีข้อเดียว ผิดหนึ่งข้อ = ผิดทั้งชุด ซึ่งเกินเกณฑ์ "ผิดไม่เกิน 1 ข้อ"
    // เมื่อคิดเป็นสัดส่วนของบท — เกณฑ์คือ *ผิดไม่เกิน 1* และต้องเหลือข้อที่ถูกด้วย
    const body = await answer(request, LESSON, { 'cp-1': ['A'] })
    expect(body.passed).toBe(false)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.completed).not.toContain(LESSON)
  })

  test('🔴 ไล่ลองจนผ่านบททั่วไปได้จริง แต่ยังไม่มีสิทธิ์ใบรับรอง', async ({ request }) => {
    // ── ชั้นที่ 1: brute-force บทปกติจนผ่าน (พิสูจน์ว่าลูปนี้เปิดอยู่จริง) ──
    let passedAfter = 0
    for (const letter of ['A', 'B', 'C', 'D']) {
      passedAfter += 1
      const body = await answer(request, LESSON, { 'cp-1': [letter] })
      if (body.passed) break
    }
    const progress = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(
      progress.record.completed,
      `ไล่ลอง ${passedAfter} ครั้งแล้วยังไม่ผ่าน — เทสนี้ตั้งใจพิสูจน์ว่าไล่ลองได้จริง`,
    ).toContain(LESSON)

    // ── ชั้นที่ 2: ทำแบบเดียวกันไม่ได้กับ capstone และใบรับรองยังไม่มา ──
    // ยิงคำตอบผิดซ้ำๆ ที่ capstone — response ต้องไม่บอกอะไรที่ช่วยไล่ทีละข้อ
    const shapes = new Set<string>()
    for (const letter of ['A', 'B', 'C', 'D']) {
      const res = await request.post('/api/progress', {
        data: {
          slug: COURSE,
          nodeId: CAPSTONE,
          action: 'checkpoint',
          mode: 'learn',
          answers: { 'cp-1': [letter], 'cp-2': ['A'], 'cp-3': ['A'] },
        },
      })
      shapes.add(JSON.stringify(await res.json()))
    }
    expect([...shapes], 'capstone ต้องไม่รั่วสัญญาณให้ไล่ทีละข้อ').toEqual(['{"ok":true,"passed":false}'])

    const capstoneState = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(capstoneState.record.completed).not.toContain(CAPSTONE)
    expect(capstoneState.record.testedOut).toEqual([])
  })

  test('ผ่าน capstone จริงจึงจะนับเป็นหลักฐาน', async ({ request }) => {
    // ปิดทางเข้าใจผิดว่า "เข้มจนไม่มีใครผ่านได้" — คนที่ตอบถูกต้องผ่านตามปกติ
    const body = await answer(request, CAPSTONE, {
      'cp-1': ['B'],
      'cp-2': ['C'],
      'cp-3': ['B'],
    })
    expect(body.passed).toBe(true)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.completed).toContain(CAPSTONE)
  })
})
