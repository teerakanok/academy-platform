import { test, expect } from '@playwright/test'
import { passCapstone, startCapstoneAttempt } from './support/capstone'
import { prepareNodeAccess } from './support/access'

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
// capstone มีด่านจำลองที่ค่าเป้าหมาย **สุ่มต่อ attempt** ตั้งแต่ W1 — จึงเขียนค่า
// ตายตัวไม่ได้ ต้องขอ attempt แล้วอ่านค่าจาก brief (ดู support/capstone.ts)

interface CheckpointResponse {
  ok: boolean
  passed: boolean
  results?: Record<string, boolean>
}

async function answer(
  request: import('@playwright/test').APIRequestContext,
  nodeId: string,
  answers: Record<string, string[]>,
  simulations?: Record<string, Record<string, string | boolean>>,
): Promise<CheckpointResponse> {
  const res = await request.post('/api/progress', {
    data: { slug: COURSE, nodeId, action: 'checkpoint', mode: 'learn', answers, simulations },
  })
  expect(res.ok()).toBeTruthy()
  return res.json()
}

test.describe('completed คือความคืบหน้า ไม่ใช่หลักฐาน', () => {
  test.beforeEach(async () => {
    await prepareNodeAccess(COURSE, CAPSTONE)
  })

  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}&operationId=${crypto.randomUUID()}`)
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
    //
    // ยิงคำตอบผิดซ้ำๆ — response ต้องไม่บอกอะไรที่ช่วยไล่ทีละข้อ · ตั้งแต่ W1
    // capstone ต้องมี attempt (ค่าเป้าหมายของด่านจำลองสุ่มต่อครั้ง) และ attempt
    // ใช้ได้ครั้งเดียว จึงต้องขอใหม่ทุกรอบ — ซึ่งทำให้การไล่ลองแพงขึ้นอีกชั้น
    const shapes = new Set<string>()
    for (const letter of ['A', 'B', 'C']) {
      const attempt = await startCapstoneAttempt(request)
      const res = await request.post('/api/progress', {
        data: {
          slug: COURSE,
          nodeId: CAPSTONE,
          action: 'checkpoint',
          mode: 'learn',
          answers: { 'cp-1': [letter], 'cp-2': ['A'], 'cp-3': ['A'] },
          simulations: { 'sim-1': attempt.correctState },
          attemptId: attempt.attemptId,
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
    await passCapstone(request)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.completed).toContain(CAPSTONE)
  })

  test('🔴 การ์ด record ต้องสะท้อนเกณฑ์สองชั้นโดยไม่แอบอ้างว่าออกใบแล้ว', async ({ page, request }) => {
    // ⚠️ เทสรุ่นก่อนตรวจแต่ค่าใน API — RIL พิสูจน์ว่า mutation ที่บังคับ
    // `record.recordComplete = true` ใน CourseOverview **ไม่ถูกจับเลย** เพราะไม่มีเทสไหน
    // ดูการ์ดจริง · นี่คือหน้าจอที่ผู้เรียนใช้ดูว่า learning record บันทึกอะไรไว้แล้ว

    // เดินบทปกติให้ครบทุกบทที่ไม่ใช่ capstone (คอร์สนี้มี 3 บทปกติ)
    await answer(request, LESSON, { 'cp-1': ['B'] })
    await answer(request, 'formats-references', { 'cp-1': ['B'], 'cp-2': ['A'] })
    await answer(request, 'formats-simulation', { 'cp-1': ['B'], 'cp-2': ['C'], 'cp-3': ['B'] })

    await page.goto(`/courses/${COURSE}`)
    const card = page.getByTestId('certificate-status')
    await expect(card).toHaveAttribute('data-record-complete', 'false')
    await expect(page.getByTestId('certificate-assessed-count')).toContainText('0 / 1')
    await expect(card).not.toContainText('Course record complete')

    // ผ่าน capstone จริง → การ์ดบอกว่า record ครบ แต่ไม่อ้างว่าออกใบแล้ว
    await passCapstone(request)
    await page.reload()
    await expect(card).toHaveAttribute('data-record-complete', 'true')
    await expect(page.getByTestId('certificate-assessed-count')).toContainText('1 / 1')
    await expect(card).toContainText('Course record complete')
    await expect(card).toContainText('Certificate issuance and verification are planned for a later release.')
    await expect(card).not.toContainText(/earned|certificate of completion/i)
  })

  test('🔴 ผ่าน capstone แล้วแต่บทปกติยังค้าง → record ต้องยังไม่ครบ', async ({ page, request }) => {
    // ⚠️ อีกด้านของเงื่อนไขสองชั้น · เทสก่อนหน้าเดินจาก "บทครบ+capstone ไม่ผ่าน"
    // ไป "ครบทั้งคู่" จึงไม่จับ UI ที่ตัดเงื่อนไขบทปกติทิ้ง (RIL จับ mutation นี้ได้)
    await passCapstone(request)

    await page.goto(`/courses/${COURSE}`)
    const card = page.getByTestId('certificate-status')
    await expect(card).toHaveAttribute('data-record-complete', 'false')
    // ด่านวัดผลผ่านครบแล้ว แต่ยังไม่ครบเกณฑ์ เพราะบทปกติยังค้าง
    await expect(page.getByTestId('certificate-assessed-count')).toContainText('1 / 1')
    await expect(card).not.toContainText('Course record complete')
    // และต้องบอกผู้เรียนตรงๆ ว่าเหลืออะไร — ทั้งจำนวนบทและลิงก์ไปบทที่ค้าง
    await expect(page.getByTestId('certificate-progress-note')).toContainText('1 / 4')
    await expect(card).toContainText('Finish the lessons and pass every required checkpoint')
    await expect(page.getByTestId(`certificate-blocker-${LESSON}`)).toBeVisible()
  })
})
