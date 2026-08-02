import { test, expect } from '@playwright/test'

// W1 — โจทย์จำลองเป็น "ด่าน" ของ capstone ไม่ใช่ของเล่นข้างทาง
//
// ก่อนหน้านี้ simulation มีที่เดียวในคอร์สและไม่ใช่ capstone — มี `mode='assessed'`
// กับ `onResult` แต่ไม่มีใครรับผล แปลว่ามันไม่เคยตัดสินอะไรเลย · W1 ต่อมันเข้าแกน
// หลักฐาน: capstone ที่มี simulation ต้องทำถูกด้วยถึงผ่าน
//
// สิ่งที่ต้องพิสูจน์:
//   1. ตอบ MCQ ถูกครบแต่ตั้งค่าหน้าจอผิด → ไม่ผ่าน (ไม่งั้น simulation เป็นของประดับ)
//   2. ตั้งค่าถูกครบด้วยจึงผ่าน
//   3. หลักฐานที่บันทึกมี **ผลราย requirement + เวอร์ชันโจทย์** ไม่ใช่ boolean รวม
//   4. response ของโหมดวัดผลยังเป็น `{passed}` เท่านั้น — simulation ต้องไม่เปิดช่องใหม่

const COURSE = 'content-formats-demo'
const CAPSTONE = 'formats-hands-on'
const MCQ_CORRECT = { 'cp-1': ['B'], 'cp-2': ['C'], 'cp-3': ['B'] }
const SIM_CORRECT = {
  addressMode: 'static',
  ipv4: '192.168.10.50',
  subnet: '255.255.255.0',
  gateway: '192.168.10.1',
  applied: true,
}

async function submit(
  request: import('@playwright/test').APIRequestContext,
  simulations: Record<string, Record<string, string | boolean>>,
) {
  const res = await request.post('/api/progress', {
    data: {
      slug: COURSE,
      nodeId: CAPSTONE,
      action: 'checkpoint',
      mode: 'learn',
      answers: MCQ_CORRECT,
      simulations,
    },
  })
  expect(res.ok()).toBeTruthy()
  return (await res.json()) as Record<string, unknown>
}

test.describe('capstone ที่มีโจทย์จำลองต้องทำถูกทั้งสองอย่าง', () => {
  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}`)
  })

  test('🔴 MCQ ถูกครบแต่ตั้งค่าหน้าจอผิด → ไม่ผ่าน', async ({ request }) => {
    // ถ้าข้อนี้เขียวแบบ "ผ่าน" แปลว่า simulation เป็นของประดับเหมือนเดิม
    const body = await submit(request, { 'sim-1': { addressMode: 'dhcp', applied: false } })
    expect(body.passed).toBe(false)
    // โหมดวัดผลยังคืนแค่ passed — simulation ต้องไม่เปิดช่องรั่วใหม่
    expect(Object.keys(body).sort()).toEqual(['ok', 'passed'])
  })

  test('ตั้งค่าถูกครบด้วยจึงผ่าน', async ({ request }) => {
    const body = await submit(request, { 'sim-1': SIM_CORRECT })
    expect(body.passed).toBe(true)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.completed).toContain(CAPSTONE)
  })

  test('ตั้งค่าเกือบถูก (ขาด applied) ก็ยังไม่ผ่าน — ทุก requirement ต้องครบ', async ({ request }) => {
    const body = await submit(request, { 'sim-1': { ...SIM_CORRECT, applied: false } })
    expect(body.passed).toBe(false)
  })

  test('ไม่ส่งสถานะหน้าจอมาเลย → ไม่ผ่าน (ไม่ใช่ข้ามด่านไปเฉยๆ)', async ({ request }) => {
    const res = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: CAPSTONE, action: 'checkpoint', mode: 'learn', answers: MCQ_CORRECT },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).passed).toBe(false)
  })

  test('บทปกติที่มีแต่ MCQ ยังทำงานเหมือนเดิม (ไม่ breaking)', async ({ request }) => {
    const res = await request.post('/api/progress', {
      data: {
        slug: COURSE,
        nodeId: 'formats-reading',
        action: 'checkpoint',
        mode: 'learn',
        answers: { 'cp-1': ['B'] },
      },
    })
    expect(res.ok()).toBeTruthy()
    expect((await res.json()).passed).toBe(true)
  })

  test('🔴 ผู้เรียนกรอกบนหน้าจอจริงแล้วกดตรวจครั้งเดียว → ผ่านทั้งด่าน', async ({ page }) => {
    // ⚠️ เทสอื่นในไฟล์นี้ยิง API ตรง จึงไม่พิสูจน์ว่า `CheckpointQuiz` ส่งสถานะหน้าจอ
    // ไปพร้อม MCQ จริง — mutation ที่ลบ `simulations` ออกจาก LessonView ไม่ถูกจับเลย
    // (RIL cross-model ยืนยัน) · ข้อนี้เดินผ่าน UI ทั้งเส้น
    await page.goto(`/courses/${COURSE}/lessons/${CAPSTONE}`)

    // ตอบ MCQ ให้ถูกครบ
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-2').locator('input[value="C"]').check()
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="B"]').check()

    // ตั้งค่าบนหน้าจอจำลองเหมือนผู้เรียนจริง
    const sim = page.getByTestId('checkpoint-sim-sim-1')
    await sim.getByTestId('sim-mode-static').click()
    await sim.getByTestId('sim-ipv4').fill('192.168.10.50')
    await sim.getByTestId('sim-subnet').fill('255.255.255.0')
    await sim.getByTestId('sim-gateway').fill('192.168.10.1')
    await sim.getByTestId('sim-apply').click()

    // ปุ่มตรวจเดียวสำหรับทั้งด่าน
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-continue')).toBeVisible()

    // ยืนยันจากสถานะจริงหลัง reload ไม่ใช่ข้อความบนหน้าจอ
    const after = await (await page.request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record.completed).toContain(CAPSTONE)
  })

  test('🔴 หลักฐานที่บันทึกจริงมาจากการตรวจของ route — ไม่ใช่ของที่ใครป้อนเข้ามา', async ({ request }) => {
    // ⚠️ integration test ป้อน evidence ที่แต่งเองเข้า recordNodeEvent จึงพิสูจน์แค่
    // ชั้น DB · mutation ที่ลบ `simulationEvidence` ออกจาก route ไม่ถูกจับเลย
    // (RIL ยืนยัน) · ข้อนี้เดิน route จริงแล้วอ่านสิ่งที่ถูกบันทึก
    expect((await submit(request, { 'sim-1': SIM_CORRECT })).passed).toBe(true)

    const res = await request.get(`/api/progress?slug=${COURSE}`)
    const record = (await res.json()).record as {
      simulationEvidence?: Record<string, Record<string, unknown>>
    }
    const evidence = record.simulationEvidence?.[CAPSTONE]?.['sim-1'] as
      | { passed: boolean; requirements: { id: string; met: boolean }[]; challengeVersion: string; at: string }
      | undefined

    expect(evidence, 'route ต้องบันทึกหลักฐานของด่านจำลอง').toBeTruthy()
    expect(evidence!.passed).toBe(true)
    // ผลราย requirement ครบทั้ง 5 ข้อ ไม่ใช่ boolean รวม
    expect(evidence!.requirements).toHaveLength(5)
    expect(evidence!.requirements.every((r) => r.met)).toBe(true)
    // เวอร์ชันต้องเป็นลายนิ้วมือของกติกา ไม่ใช่เวอร์ชันคอร์ส
    expect(evidence!.challengeVersion).toMatch(/^sim-[0-9a-f]{8}$/)
    expect(Date.parse(evidence!.at)).toBeGreaterThan(0)
  })

  test('🔴 ผ่านแล้วส่งผิดซ้ำ → หลักฐานต้องไม่ถอยหลัง', async ({ request }) => {
    // สถานะบทถูกกันไม่ให้ถอยอยู่แล้ว แต่เดิม **หลักฐานไม่ถูกกัน** → บทที่ระบบบอกว่า
    // ผ่าน มีหลักฐานบอกว่าไม่ผ่าน ขัดกันเอง และใบรับรอง (W4) อ้างอิงหลักฐานชุดนี้
    expect((await submit(request, { 'sim-1': SIM_CORRECT })).passed).toBe(true)
    expect((await submit(request, { 'sim-1': { addressMode: 'dhcp', applied: false } })).passed).toBe(false)

    const record = (await (await request.get(`/api/progress?slug=${COURSE}`)).json()).record as {
      completed: string[]
      simulationEvidence?: Record<string, Record<string, { passed: boolean }>>
    }
    // สถานะยังผ่าน (ถูกต้อง) — และหลักฐานต้องยังบอกว่าผ่านเหมือนกัน
    expect(record.completed).toContain(CAPSTONE)
    expect(record.simulationEvidence?.[CAPSTONE]?.['sim-1'].passed).toBe(true)
  })

  test('หน้าจอจำลองปรากฏในด่านท้ายบทจริง และไม่พากติกาการตรวจไปด้วย', async ({ page }) => {
    const bodies: string[] = []
    page.on('response', async (res) => {
      const type = res.headers()['content-type'] ?? ''
      if (/javascript|html|text\/x-component/.test(type)) bodies.push(await res.text().catch(() => ''))
    })

    await page.goto(`/courses/${COURSE}/lessons/${CAPSTONE}`)
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await page.waitForLoadState('networkidle')

    const received = bodies.join('\n')
    expect(received.length).toBeGreaterThan(1000)

    // ⚠️ สิ่งที่ห้ามรั่วคือ **กติกาการตรวจ** ไม่ใช่ตัวโจทย์ — ค่าอย่าง 192.168.10.50
    // อยู่ใน `brief` และ **ต้องอยู่ในหน้า** ไม่งั้นผู้เรียนไม่มีอะไรให้อ่าน
    // (แผน §5 W1 ระบุข้อนี้ตรงๆ · เทสรุ่นแรกของไฟล์นี้ assert ผิดจนแดง)
    expect(received).not.toContain('"operator"')
    expect(received).not.toContain('"field"')
    // brief ต้องอยู่ — พิสูจน์ว่าเราไม่ได้ตัดโจทย์ทิ้งไปพร้อมกติกา
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toContainText('192.168.10.50')
  })
})
