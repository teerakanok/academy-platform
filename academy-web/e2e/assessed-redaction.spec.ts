import { test, expect } from '@playwright/test'

// สัญญาของ response ในโหมดวัดผล (W0-1)
//
// การย้ายเฉลยออกจากหน้าเว็บจะไร้ความหมายทันที ถ้า API ตอบกลับด้วยสัญญาณที่แปรตาม
// คำตอบ — "ถูกกี่ข้อ" ทำให้ไล่ทีละข้อแบบ Mastermind ได้: เปลี่ยนคำตอบข้อเดียวแล้วดู
// ว่าเลขขยับไหม ~10–15 ครั้งได้เฉลยครบโดยไม่ต้องรู้เนื้อหาเลย
//
// เทสชุดนี้จึงตรวจ **รูปของ response** ไม่ใช่แค่ว่าผ่าน/ไม่ผ่านถูกต้อง

const COURSE = 'content-formats-demo'
const CAPSTONE = 'formats-hands-on'
// บทที่ใช้ยิงคำตอบถูกในโหมด learn — ตั้งใจไม่ใช้ `formats-references` เพราะ
// progress-integrity.spec ยืนยันสถานะของบทนั้น และ spec ทั้งชุดใช้บัญชีเดียวกัน
const LESSON = 'formats-reading'
const SIM_LESSON = 'formats-simulation'

// คืนสภาพเมื่อจบ — เทสชุดนี้ทำให้บทเรียนขยับสถานะจริง (ดูเหตุผลเดียวกันใน answer-leak)
test.afterAll(async ({ playwright, baseURL }, testInfo) => {
  const api = await playwright.request.newContext({
    baseURL: baseURL!,
    storageState: testInfo.project.use.storageState as string,
  })
  await api.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}`)
  await api.dispose()
})

/** ยิง checkpoint ตรงๆ แล้วคืน body ดิบ — ต้องเห็นทุก field ที่เซิร์ฟเวอร์ส่งจริง */
async function submitCheckpoint(
  request: import('@playwright/test').APIRequestContext,
  nodeId: string,
  mode: 'learn' | 'test-out',
  answers: Record<string, string[]>,
) {
  const res = await request.post('/api/progress', {
    data: { slug: COURSE, nodeId, action: 'checkpoint', mode, answers },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Record<string, unknown>
}

test.describe('โหมด assessed — response บอกได้แค่ผ่าน/ไม่ผ่าน', () => {
  test('ตอบผิด: มีเฉพาะ ok กับ passed ไม่มีผลรายข้อ/จำนวน/คำอธิบาย', async ({ request }) => {
    const body = await submitCheckpoint(request, CAPSTONE, 'learn', {
      'cp-1': ['A'],
      'cp-2': ['A'],
      'cp-3': ['A'],
    })
    expect(Object.keys(body).sort()).toEqual(['ok', 'passed'])
    expect(body.passed).toBe(false)
  })

  test('Mastermind: เปลี่ยนคำตอบทีละข้อ → response ต้องแยกไม่ออกว่าข้อไหนขยับ', async ({ request }) => {
    // ทุกคำตอบผิดหมด ยกเว้นค่อยๆ สลับข้อละตัว — ถ้ามีสัญญาณใดแปรตาม จะเห็นตรงนี้
    const shapes = new Set<string>()
    for (const letter of ['A', 'B', 'C', 'D']) {
      const body = await submitCheckpoint(request, CAPSTONE, 'learn', {
        'cp-1': [letter],
        'cp-2': ['A'],
        'cp-3': ['A'],
      })
      shapes.add(JSON.stringify(body))
    }
    // ทุกครั้งที่ยังไม่ผ่าน response ต้องเหมือนกันเป๊ะ — ไม่มีอะไรให้เดา
    expect([...shapes]).toEqual(['{"ok":true,"passed":false}'])
  })

  test('test-out บนบทปกติก็เป็น assessed เหมือนกัน', async ({ request }) => {
    // ตอบผิดโดยตั้งใจ — ไม่ให้บทนี้ขยับสถานะไปรบกวน spec อื่น
    const body = await submitCheckpoint(request, LESSON, 'test-out', { 'cp-1': ['A'] })
    expect(Object.keys(body).sort()).toEqual(['ok', 'passed'])
    expect(body.passed).toBe(false)
  })
})

test.describe('โหมด learn — สอนได้ จึงบอกผลรายข้อและคำอธิบาย', () => {
  test('บทปกติได้ผลรายข้อ + คำอธิบายกลับมา (ไม่ใช่ฝังมากับหน้า)', async ({ request }) => {
    const body = await submitCheckpoint(request, LESSON, 'learn', { 'cp-1': ['B'] })
    expect(body.passed).toBe(true)
    expect(body.results).toBeTruthy()
    const explanations = body.explanations as Record<string, string>
    expect(Object.keys(explanations).length).toBeGreaterThan(0)
    for (const text of Object.values(explanations)) expect(text.length).toBeGreaterThan(10)
  })
})

test.describe('โจทย์จำลองโหมดฝึก — เซิร์ฟเวอร์เป็นคนตรวจและเป็นคนให้คำใบ้', () => {
  test('ยังไม่ผ่าน + ลองครั้งแรก → บอกข้อที่ยังไม่ผ่าน แต่ยังไม่ให้คำใบ้', async ({ request }) => {
    const res = await request.post('/api/practice/simulation', {
      data: {
        slug: COURSE,
        nodeId: SIM_LESSON,
        challengeId: 'static-print-server',
        state: { addressMode: 'dhcp', ipv4: '', applied: false },
        attempt: 1,
      },
    })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.passed).toBe(false)
    expect(body.results.length).toBeGreaterThan(0)
    // กติกาการตรวจต้องไม่ติดมากับผล
    expect(JSON.stringify(body)).not.toContain('"operator"')
    expect(body.hints).toBeUndefined()
  })

  test('ลองครบสองครั้งแล้วยังไม่ผ่าน → คำใบ้มาจากเซิร์ฟเวอร์', async ({ request }) => {
    const res = await request.post('/api/practice/simulation', {
      data: {
        slug: COURSE,
        nodeId: SIM_LESSON,
        challengeId: 'static-print-server',
        state: { addressMode: 'dhcp', ipv4: '', applied: false },
        attempt: 2,
      },
    })
    const body = await res.json()
    expect(Array.isArray(body.hints)).toBe(true)
    expect(body.hints.length).toBeGreaterThan(0)
  })

  test('ไม่ล็อกอิน = ตรวจไม่ได้', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({
      baseURL: baseURL!,
      storageState: { cookies: [], origins: [] },
    })
    const res = await anon.post('/api/practice/simulation', {
      data: { slug: COURSE, nodeId: SIM_LESSON, challengeId: 'static-print-server', state: {}, attempt: 1 },
    })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })
})
