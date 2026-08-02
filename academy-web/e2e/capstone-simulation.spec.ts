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
