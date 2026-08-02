import { test, expect } from '@playwright/test'
import { startCapstoneAttempt } from './support/capstone'

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

/**
 * ยิง capstone พร้อม attempt ของตัวเอง แล้วคืน body ดิบ
 *
 * capstone ต้องมี attempt ตั้งแต่ W1 (ค่าเป้าหมายของด่านจำลองสุ่มต่อครั้ง) และโควตา
 * คือ 3 ครั้ง/30 นาที ต่อ (user, node) · เทสชุดนี้ต้องยิงซ้ำหลายรอบเพื่อดูว่ารูป
 * response แปรตามคำตอบไหม จึง `reset` ก่อนทุกครั้ง — reset ทิ้งความคืบหน้าทั้งคอร์ส
 * และล้าง attempt ของคอร์สนั้น ทำให้ทุกครั้งเริ่มจากสภาพเดียวกันจริงๆ
 */
async function submitCapstone(
  request: import('@playwright/test').APIRequestContext,
  pick: 'correct' | 'wrong' | ((attempt: Awaited<ReturnType<typeof startCapstoneAttempt>>) => Record<string, string[]>),
) {
  await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}`)
  const attempt = await startCapstoneAttempt(request)
  const answers =
    pick === 'correct' ? attempt.answers : pick === 'wrong' ? attempt.wrongAnswers : pick(attempt)
  const res = await request.post('/api/progress', {
    data: {
      slug: COURSE,
      nodeId: CAPSTONE,
      action: 'checkpoint',
      mode: 'learn',
      answers,
      // ด่านจำลองตั้งค่าถูกเสมอ — ตัวแปรเดียวที่ขยับคือคำตอบ MCQ
      simulations: { 'sim-1': attempt.correctState },
      attemptId: attempt.attemptId,
    },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Record<string, unknown>
}

test.describe('โหมด assessed — response บอกได้แค่ผ่าน/ไม่ผ่าน', () => {
  test('ตอบผิด: มีเฉพาะ ok กับ passed ไม่มีผลรายข้อ/จำนวน/คำอธิบาย', async ({ request }) => {
    const body = await submitCapstone(request, 'wrong')
    expect(Object.keys(body).sort()).toEqual(['ok', 'passed'])
    expect(body.passed).toBe(false)
  })

  test('Mastermind: เปลี่ยนคำตอบทีละข้อ → response ต้องแยกไม่ออกว่าข้อไหนขยับ', async ({ request }) => {
    // ทุกคำตอบผิดหมด ยกเว้นค่อยๆ สลับข้อละตัว — ถ้ามีสัญญาณใดแปรตาม จะเห็นตรงนี้
    const shapes = new Set<string>()
    for (const index of [0, 1, 2, 3]) {
      const body = await submitCapstone(request, (attempt) => ({
        ...attempt.wrongAnswers,
        // สลับเฉพาะข้อแรกไปทีละตัวเลือก — ถ้ามีสัญญาณใดแปรตามคำตอบ จะเห็นตรงนี้
        'cp-1': [Object.keys(attempt.questions.find((q) => q.id === 'cp-1')!.choices).sort()[index]],
      }))
      shapes.add(JSON.stringify(body))
    }
    // ทุกครั้งที่ยังไม่ผ่าน response ต้องเหมือนกันเป๊ะ — ไม่มีอะไรให้เดา
    expect([...shapes]).toEqual(['{"ok":true,"passed":false}'])
  })

  test('ตอบถูกครบ: response ก็ยังมีเฉพาะ ok กับ passed ไม่มีเฉลยแนบมา', async ({ request }) => {
    // capstone มีด่านจำลองด้วยตั้งแต่ W1 — ต้องส่งสถานะหน้าจอที่ถูกมาด้วย
    // ⚠️ ตรวจกรณี "ผ่าน" ด้วย ไม่ใช่แค่ "ไม่ผ่าน" — ถ้าวันหนึ่งมีคนแนบเฉลยเฉพาะตอน
    // ผ่าน เทสที่ดูแต่กรณีไม่ผ่านจะเขียวทั้งที่รูเปิด (RIL cross-model จับ)
    const body = await submitCapstone(request, 'correct')
    expect(body.passed).toBe(true)
    expect(Object.keys(body).sort()).toEqual(['ok', 'passed'])
  })

  test('🔴 Mastermind ผ่าน GET: อ่านความคืบหน้าแล้วต้องไม่รู้ว่าข้อไหนถูก', async ({ request }) => {
    // รูที่ข้อนี้ปิด (RIL cross-model รอบ W1): POST ตอบแค่ `{ok, passed}` ตามสัญญา
    // แล้ว แต่ GET เคยคืน `checkpointResults` รายข้อของ capstone กับผลราย
    // requirement ของด่านจำลองมาให้ — ส่งผิดสามชุด (A,A,A / B,B,B / C,C,C) แล้ว
    // อ่านจาก GET ก็ได้เฉลยครบโดยไม่ต้องรู้เนื้อหาเลย
    // **ปิดรูที่จุดหนึ่งแล้วเปิดที่อีกจุด คือรูเดิม**
    await submitCapstone(request, 'wrong')

    const body = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    const record = body.record as {
      checkpointResults?: Record<string, unknown>
      simulationEvidence?: Record<string, unknown>
    }

    expect(record.checkpointResults?.[CAPSTONE], 'ผลรายข้อของ capstone หลุดมากับ GET').toBeUndefined()
    expect(record.simulationEvidence?.[CAPSTONE], 'หลักฐานราย requirement หลุดมากับ GET').toBeUndefined()
    // และต้องไม่มีร่องรอยของ id รายข้อใน payload ทั้งก้อน
    const payload = JSON.stringify(body)
    expect(payload).not.toContain('cp-1')
    expect(payload).not.toContain('r-mode')
  })

  test('test-out ถูกปิดทั้งหมด — โหมดสอนต้องไม่กลายเป็นเครื่องเฉลยของโหมดวัดผล', async ({ request }) => {
    // บทปกติใช้ checkpoint ชุดเดียวกันทั้ง learn และ test-out · learn คืนคำอธิบาย
    // ตามหน้าที่ของการสอน ถ้า test-out ยังทำงานอยู่ ใครก็เก็บเฉลยจาก learn แล้วไปยิง
    // test-out ให้ได้ `tested-out` ซึ่งนับเป็นพิสูจน์แล้ว
    const res = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: LESSON, action: 'checkpoint', mode: 'test-out', answers: { 'cp-1': ['B'] } },
    })
    expect(res.status()).toBe(400)

    // และต้องไม่มีบทไหนกลายเป็น tested-out ได้เลย
    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.testedOut).toEqual([])
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

test.describe('endpoint เฉลย — เปิดได้เฉพาะบทที่ผ่านแล้วจริง', () => {
  test('ยังไม่ผ่าน → ถูกปฏิเสธ (ไม่งั้นคือย้าย oracle ไปที่ใหม่แล้วไม่มีใครเฝ้า)', async ({ request }) => {
    // ใช้บทที่ยังไม่มีใครทำในไฟล์นี้ — capstone ถูก describe ก่อนหน้าทำให้ผ่านไปแล้ว
    const res = await request.get(`/api/explanations?slug=${COURSE}&nodeId=${SIM_LESSON}`)
    expect(res.status()).toBe(403)
    expect(await res.text()).not.toContain('"correct"')
  })

  test('ผ่านแล้ว → ได้เฉลยและคำอธิบายไปทบทวน', async ({ request }) => {
    // ทำบทปกติให้ผ่านจริงก่อน แล้วค่อยขอเฉลยของบทนั้น
    const graded = await submitCheckpoint(request, LESSON, 'learn', { 'cp-1': ['B'] })
    expect(graded.passed).toBe(true)

    const res = await request.get(`/api/explanations?slug=${COURSE}&nodeId=${LESSON}`)
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.questions.length).toBeGreaterThan(0)
    for (const q of body.questions) {
      expect(Array.isArray(q.correct)).toBe(true)
      expect(typeof q.explanation).toBe('string')
    }
  })

  test('ไม่ล็อกอิน = ขอไม่ได้', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({
      baseURL: baseURL!,
      storageState: { cookies: [], origins: [] },
    })
    const res = await anon.get(`/api/explanations?slug=${COURSE}&nodeId=${LESSON}`)
    expect(res.status()).toBe(401)
    await anon.dispose()
  })
})

test.describe('โจทย์จำลองโหมดฝึก — เซิร์ฟเวอร์เป็นคนตรวจและเป็นคนให้คำใบ้', () => {
  const WRONG_STATE = { addressMode: 'dhcp', ipv4: '', applied: false }

  function practice(
    request: import('@playwright/test').APIRequestContext,
    data: Record<string, unknown>,
  ) {
    return request.post('/api/practice/simulation', {
      data: { slug: COURSE, nodeId: SIM_LESSON, challengeId: 'static-print-server', ...data },
    })
  }

  test('ยังไม่ผ่าน + ไม่ได้ขอคำใบ้ → บอกข้อที่ยังไม่ผ่าน แต่ไม่มีคำใบ้ติดมา', async ({ request }) => {
    const res = await practice(request, { state: WRONG_STATE })
    expect(res.ok()).toBeTruthy()
    const body = await res.json()
    expect(body.passed).toBe(false)
    expect(body.results.length).toBeGreaterThan(0)
    // กติกาการตรวจต้องไม่ติดมากับผล
    expect(JSON.stringify(body)).not.toContain('"operator"')
    expect(body.hints).toBeUndefined()
  })

  test('ขอคำใบ้ → คำใบ้มาจากเซิร์ฟเวอร์ ไม่ใช่จาก payload ของหน้า', async ({ request }) => {
    const res = await practice(request, { state: WRONG_STATE, wantHint: true })
    const body = await res.json()
    expect(Array.isArray(body.hints)).toBe(true)
    expect(body.hints.length).toBeGreaterThan(0)
  })

  test('ทำถูกแล้วขอคำใบ้ → ไม่ให้ (ไม่มีอะไรให้ใบ้แล้ว)', async ({ request }) => {
    const res = await practice(request, {
      state: { addressMode: 'static', ipv4: '192.168.10.50', subnet: '255.255.255.0', gateway: '192.168.10.1', dns1: '192.168.10.1', applied: true },
      wantHint: true,
    })
    const body = await res.json()
    expect(body.passed).toBe(true)
    expect(body.hints).toBeUndefined()
  })

  test('state ที่มีคีย์เกินขอบเขต → ถูกปฏิเสธ ไม่ใช่ปล่อยให้ทำงานฟรี', async ({ request }) => {
    const bloated: Record<string, string> = {}
    for (let i = 0; i < 200; i++) bloated[`f${i}`] = 'x'
    const res = await practice(request, { state: bloated })
    expect(res.status()).toBe(400)
  })

  test('body ใหญ่เกินขอบเขต → 413 ก่อนถึงขั้น parse ทั้งก้อน', async ({ request }) => {
    const res = await request.post('/api/practice/simulation', {
      headers: { 'content-type': 'application/json' },
      data: JSON.stringify({
        slug: COURSE,
        nodeId: SIM_LESSON,
        challengeId: 'static-print-server',
        state: { addressMode: 'x'.repeat(20_000) },
      }),
    })
    expect(res.status()).toBe(413)
  })

  test('body ภาษาไทยที่ใหญ่เกินขอบเขตก็ต้อง 413 — ขอบเขตต้องนับเป็น byte ไม่ใช่ตัวอักษร', async ({
    request,
  }) => {
    // ⚠️ เทสรุ่นแรกใช้ ASCII ล้วนจึงเขียวทั้งที่ช่องโหว่เปิดอยู่: อักษรไทยหนึ่งตัวนับ
    // เป็น 1 ใน String.length แต่กิน 3 byte จริง — 32 ช่อง × 200 ตัวอักษรไทย
    // ผ่าน guard ที่นับด้วย String.length ได้สบายทั้งที่เกิน 8 KiB ไปหลายเท่า
    const thai: Record<string, string> = {}
    for (let i = 0; i < 32; i++) thai[`f${i}`] = 'ก'.repeat(200)
    const payload = JSON.stringify({
      slug: COURSE,
      nodeId: SIM_LESSON,
      challengeId: 'static-print-server',
      state: thai,
    })
    expect(payload.length, 'payload ต้องเล็กพอในหน่วยตัวอักษร มิฉะนั้นเทสไม่ได้พิสูจน์อะไร').toBeLessThan(8 * 1024)
    expect(new TextEncoder().encode(payload).length).toBeGreaterThan(8 * 1024)

    const res = await request.post('/api/practice/simulation', {
      headers: { 'content-type': 'application/json' },
      data: payload,
    })
    expect(res.status()).toBe(413)
  })

  test('ไม่ล็อกอิน = ตรวจไม่ได้', async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({
      baseURL: baseURL!,
      storageState: { cookies: [], origins: [] },
    })
    const res = await anon.post('/api/practice/simulation', {
      data: { slug: COURSE, nodeId: SIM_LESSON, challengeId: 'static-print-server', state: {} },
    })
    expect(res.status()).toBe(401)
    await anon.dispose()
  })
})
