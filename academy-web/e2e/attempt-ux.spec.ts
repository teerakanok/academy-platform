import { test, expect, type Page } from '@playwright/test'
import { answerOnPage } from './support/capstone'
import { prepareNodeAccess } from './support/access'

// W1 — หน้าจอต้องไม่แสดงโจทย์ที่ยังไม่ใช่ของผู้เรียน
//
// ตั้งแต่ค่าเป้าหมายสุ่มต่อ attempt ไฟล์เนื้อหาเก็บแค่ **แม่แบบ** (`{{targetIp}}`)
// โจทย์จริงมาจาก `/api/attempts` · ถ้าเรนเดอร์ของในไฟล์ไปก่อนแล้วค่อยสลับ ผู้เรียนจะ
// อ่านโจทย์ที่ยังไม่ใช่ของตัวเอง และช่องกรอกถูกแทนที่ใต้มือระหว่างพิมพ์
// (Playwright เองยังจับได้ว่า element ถูก detach กลางคลิก)
//
// อีกครึ่งหนึ่งที่ต้องพิสูจน์: เมื่อขอโจทย์ไม่ได้ ต้อง**บอก**ผู้เรียน ไม่ใช่ปล่อยให้
// กรอกจนเสร็จแล้วค่อยเด้งตอนกดส่ง — ของเดิมเงียบสนิทเพราะ error ถูกกลืนใน .catch()

const COURSE = 'content-formats-demo'
const CAPSTONE = 'formats-hands-on'
const LESSON_URL = `/courses/${COURSE}/lessons/${CAPSTONE}`

async function applySimulation(page: Page, correct: boolean) {
  const sim = page.getByTestId('checkpoint-sim-sim-1')
  if (!correct) {
    // DHCP + Apply เป็นการทำงานที่ครบ แต่เป็นคำตอบผิดสำหรับโจทย์ static นี้
    await sim.getByTestId('sim-apply').click()
    return
  }

  const target = /192\.168\.10\.\d+/.exec((await sim.textContent()) ?? '')?.[0]
  expect(target).toBeTruthy()
  await sim.getByTestId('sim-mode-static').click()
  await sim.getByTestId('sim-ipv4').fill(target!)
  await sim.getByTestId('sim-subnet').fill('255.255.255.0')
  await sim.getByTestId('sim-gateway').fill('192.168.10.1')
  await sim.getByTestId('sim-apply').click()
}

test.describe('การรอโจทย์ของ attempt', () => {
  test.beforeEach(async () => {
    await prepareNodeAccess(COURSE, CAPSTONE)
  })

  // คืนโควตาให้ไฟล์ถัดไป — e2e ทั้งชุดใช้บัญชีเดียว และโควตาคือ 3 ครั้ง/30 นาที
  // ต่อ (user, node) · ไฟล์ที่กิน attempt แล้วไม่คืน จะทำให้ไฟล์ถัดไปแดงแบบไม่มีเหตุผล
  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}&operationId=${crypto.randomUUID()}`)
  })

  test('🔴 ระหว่างรอโจทย์ ต้องไม่มีด่านให้ทำ และต้องไม่มีแม่แบบโผล่บนหน้าจอ', async ({ page }) => {
    // หน่วง response ไว้ในมือเรา — สถานะ "กำลังรอ" จึงตรวจได้แน่นอน ไม่ใช่ลุ้นจังหวะ
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route('**/api/attempts', async (route) => {
      await held
      await route.continue()
    })

    await page.goto(LESSON_URL)
    await expect(page.getByTestId('checkpoint-attempt-loading')).toBeVisible()
    // ด่านต้องยังไม่มา — ไม่งั้นเท่ากับให้ทำโจทย์ที่ไม่ใช่ของตัวเอง
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toHaveCount(0)
    await expect(page.getByTestId('checkpoint-submit')).toHaveCount(0)
    // และแม่แบบต้องไม่มีอยู่ในหน้าเลย รวมทั้งใน payload ที่ฝังมากับ HTML —
    // ก่อนหน้านี้หน้า lesson ส่งโจทย์ในไฟล์มาด้วย จึงมี `{{targetIp}}` ติดมาทั้งที่
    // ไม่มีใครใช้ (เทสข้อนี้จับได้ตอนเขียน)
    expect(await page.content()).not.toContain('{{')

    release()
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await expect(page.getByTestId('checkpoint-sim-sim-1')).not.toContainText('{{')
  })

  test('🔴 ตอบผิดแล้วกด Try again ต้องได้โจทย์ชุดใหม่ ไม่ใช่ทางตัน', async ({ page }) => {
    // attempt ถูกใช้ไปแล้วตั้งแต่กดตรวจครั้งแรก (ใช้ซ้ำ = 409) · ของเดิม `retry()`
    // ล้างแค่ช่องกรอกแล้วส่ง attempt id เดิมอีกครั้ง ผู้เรียนจึงกรอกใหม่ทั้งชุด
    // แล้วกดส่งได้แต่ error ไปเรื่อยๆ โดยไม่มีทางออก (RIL cross-model รอบ W1)
    await page.goto(LESSON_URL)
    const sim = page.getByTestId('checkpoint-sim-sim-1')
    await expect(sim).toBeVisible()
    const firstTarget = /192\.168\.10\.\d+/.exec((await sim.textContent()) ?? '')?.[0]

    // ตอบผิดทั้ง MCQ และด่านจำลอง แล้วกดตรวจ (เลือกจากข้อความ — key ถูก remap ต่อ attempt)
    await answerOnPage(page, COURSE, CAPSTONE, { wrongFor: ['cp-1', 'cp-2', 'cp-3'] })
    await applySimulation(page, false)
    const oldDraftKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('academy.checkpoint-draft:v1:')))
    expect(oldDraftKeys).toHaveLength(1)
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-not-passed')).toBeVisible()

    // กดลองใหม่ → ต้องออก attempt ใหม่จริง (รอ response ไม่ใช่รอเวลา ไม่งั้นอ่านโจทย์
    // ชุดเดิมที่ยังค้างบนหน้าจอ)
    const [issued] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/attempts') && r.request().method() === 'POST'),
      page.getByTestId('checkpoint-retry').click(),
    ])
    expect(issued.status(), 'กดลองใหม่แล้วต้องได้โจทย์ชุดใหม่').toBe(200)
    const sim2 = page.getByTestId('checkpoint-sim-sim-1')
    await expect(sim2).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('academy.checkpoint-draft:v1:'))))
      .not.toContain(oldDraftKeys[0])

    // ตอบให้ถูกครบด้วยค่าของโจทย์ชุดใหม่ → ต้องผ่านจริง ไม่ใช่ค้างที่ 409
    const secondTarget = /192\.168\.10\.\d+/.exec((await sim2.textContent()) ?? '')?.[0]
    expect(secondTarget).toBeTruthy()
    expect(firstTarget).toBeTruthy()
    await answerOnPage(page, COURSE, CAPSTONE)
    await sim2.getByTestId('sim-mode-static').click()
    await sim2.getByTestId('sim-ipv4').fill(secondTarget!)
    await sim2.getByTestId('sim-subnet').fill('255.255.255.0')
    await sim2.getByTestId('sim-gateway').fill('192.168.10.1')
    await sim2.getByTestId('sim-apply').click()
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-continue')).toBeVisible()
  })

  test('🔴 attempt หมดอายุ/ใช้ไปแล้ว → ได้ attempt ใหม่อัตโนมัติ ไม่ใช่ปุ่มที่กดแล้ว error ซ้ำ', async ({
    page,
  }) => {
    // จำลอง 409 (attempt ใช้ไม่ได้แล้ว) ครั้งเดียวตอนกดตรวจ · ของเดิมหน้าจะบอกให้
    // "ลองใหม่อีกครั้ง" แล้วปุ่มก็ส่ง attempt id เดิมซ้ำ → 409 ตลอดกาล
    await page.goto(LESSON_URL)
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await answerOnPage(page, COURSE, CAPSTONE)
    await applySimulation(page, true)
    const oldDraftKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('academy.checkpoint-draft:v1:')))
    expect(oldDraftKeys).toHaveLength(1)

    // Route mocking intercepts the submit before the server can consume the
    // original attempt. In the real `attempt-invalid` case it is already
    // unusable, so issue_attempt returns a new ID. This client-replacement
    // fixture changes only that identity: it proves remount and removal of the
    // old scoped draft, while the real retry path covers a full replacement run.
    await page.route('**/api/attempts', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as Record<string, unknown>
      await route.fulfill({ response, body: JSON.stringify({ ...body, attemptId: crypto.randomUUID() }) })
    })

    let blocked = false
    await page.route('**/api/progress', async (route) => {
      if (route.request().method() === 'POST' && !blocked) {
        blocked = true
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'ความพยายามนี้ใช้ไม่ได้แล้ว' }),
        })
        return
      }
      await route.continue()
    })

    const [issued] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/attempts') && r.request().method() === 'POST'),
      page.getByTestId('checkpoint-submit').click(),
    ])
    expect(issued.status(), 'เจอ 409 แล้วต้องขอโจทย์ชุดใหม่ให้เอง').toBe(200)
    // ด่าน remount ด้วย attempt ใหม่ ไม่ใช่ปุ่มค้างที่กดแล้ว error เดิม
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await expect(page.getByTestId('checkpoint-submit')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('academy.checkpoint-draft:v1:'))))
      .not.toContain(oldDraftKeys[0])
  })

  test('simulation ยังไม่พร้อมจาก server drift ต้องคง attempt ใบเดิมไว้', async ({ page }) => {
    let issued = 0
    await page.route('**/api/attempts', async (route) => {
      if (route.request().method() === 'POST') issued += 1
      await route.continue()
    })
    await page.route('**/api/progress', async (route) => {
      const body = route.request().method() === 'POST'
        ? (route.request().postDataJSON() as { action?: string })
        : null
      if (body?.action === 'checkpoint') {
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'ทำโจทย์จำลองให้ครบและกดยืนยันการตั้งค่าก่อนตรวจ',
            code: 'simulation-incomplete',
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(LESSON_URL)
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await answerOnPage(page, COURSE, CAPSTONE)
    await applySimulation(page, true)
    await page.getByTestId('checkpoint-submit').click()

    await expect(page.getByTestId('checkpoint-validation-error')).toContainText('Your answers are still here')
    await expect(page.getByTestId('progress-sync-error')).toHaveCount(0)
    await expect(page.locator('[data-testid="checkpoint"] input[name^="q-"]:checked')).toHaveCount(3)
    const target = /192\.168\.10\.\d+/.exec((await page.getByTestId('checkpoint-sim-sim-1').textContent()) ?? '')?.[0]
    await expect(page.getByTestId('checkpoint-sim-sim-1').getByTestId('sim-ipv4')).toHaveValue(target!)
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    expect(issued, 'validation error ที่ไม่ consume ต้องไม่ออก attempt ใหม่').toBe(1)
  })

  test('claim ถูกแทนที่ → reconcile ผลเดิมก่อน และไม่ออก attempt ใหม่ซ้ำ', async ({ page }) => {
    let issued = 0
    let reconcile = false
    await page.route('**/api/attempts', async (route) => {
      if (route.request().method() === 'POST') issued += 1
      await route.continue()
    })
    await page.route('**/api/progress**', async (route) => {
      const body = route.request().method() === 'POST'
        ? (route.request().postDataJSON() as { action?: string })
        : null
      if (body?.action === 'checkpoint' && reconcile === false) {
        reconcile = true
        await route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            error: 'กำลังตรวจสอบผลจากคำขออีกครั้ง',
            code: 'claim-replaced',
          }),
        })
        return
      }
      if (route.request().method() === 'GET' && reconcile) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            record: {
              version: 'v1',
              slug: COURSE,
              completed: [CAPSTONE],
              skipped: [],
              testedOut: [],
              inProgress: [],
              checkpointResults: { [CAPSTONE]: {} },
              videoCueResults: {},
              simulationEvidence: {},
              lastNodeId: CAPSTONE,
              updatedAt: Date.now(),
            },
          }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(LESSON_URL)
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await answerOnPage(page, COURSE, CAPSTONE)
    await applySimulation(page, true)
    await page.getByTestId('checkpoint-submit').click()

    await expect(page.getByTestId('checkpoint-continue')).toBeVisible()
    expect(issued, 'claim-replaced ต้องไม่กินโควตาด้วย attempt ใหม่').toBe(1)
  })

  test('🔴 โควตาเต็ม → บอกตรงๆ พร้อมทางไปต่อ ไม่ใช่ปล่อยให้ทำจนเสร็จแล้วเด้ง', async ({ page }) => {
    let attempts = 0
    await page.route('**/api/attempts', async (route) => {
      attempts += 1
      // ครั้งแรกโควตาเต็ม ครั้งที่สอง (กด Try again) ปล่อยผ่านของจริง
      if (attempts === 1) {
        await route.fulfill({
          status: 429,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false, error: 'quota' }),
        })
        return
      }
      await route.continue()
    })

    await page.goto(LESSON_URL)
    const failed = page.getByTestId('checkpoint-attempt-failed')
    await expect(failed).toBeVisible()
    // ข้อความต้องอธิบายว่าเกิดอะไรและทำอะไรต่อได้ ไม่ใช่รหัสข้อผิดพลาด
    await expect(failed).toContainText('attempts')
    await expect(failed).toContainText('try again')
    // ห้ามมีด่านให้กรอกทิ้งไว้ข้างใต้
    await expect(page.getByTestId('checkpoint-submit')).toHaveCount(0)

    await page.getByTestId('checkpoint-attempt-retry').click()
    await expect(page.getByTestId('checkpoint-sim-sim-1')).toBeVisible()
    await expect(failed).toHaveCount(0)
  })
})

test.describe('เปิดหน้าซ้ำ', () => {
  test.beforeEach(async () => {
    await prepareNodeAccess(COURSE, CAPSTONE)
  })

  // RIL cross-model รอบ 2 ข้อ 4: ทุก reload เคยออก attempt ใหม่ · ผู้เรียนที่ตอบไป
  // ครึ่งทางแล้วเผลอ refresh สามครั้งใน 30 นาที เจอ 429 ทั้งที่ยังไม่เคยกดส่งเลย
  test('🔴 refresh หลายครั้งต้องได้โจทย์ใบเดิม ไม่กินโควตา', async ({ page }) => {
    const seen: string[] = []
    page.on('response', async (r) => {
      if (r.url().includes('/api/attempts') && r.request().method() === 'POST' && r.ok()) {
        seen.push(((await r.json()) as { attemptId: string }).attemptId)
      }
    })

    // เก็บ "โจทย์ที่เห็นจริงบนหน้าจอ" ทุกครั้ง ไม่ใช่แค่ id ของใบ
    const targets: string[] = []
    const prompts: string[] = []
    for (let i = 0; i < 4; i++) {
      await page.goto(LESSON_URL)
      const sim = page.getByTestId('checkpoint-sim-sim-1')
      await expect(sim).toBeVisible()
      const target = /192\.168\.10\.\d+/.exec((await sim.textContent()) ?? '')?.[0]
      expect(target, 'โจทย์บนหน้าจอไม่มีค่าเป้าหมาย').toBeTruthy()
      targets.push(target!)
      prompts.push((await page.getByTestId('checkpoint-q-cp-1').textContent()) ?? '')
    }

    expect(seen.length, 'ต้องขอ attempt ครบทุกครั้งที่โหลด').toBe(4)
    expect(new Set(seen).size, 'ทุกครั้งต้องได้ใบเดิม').toBe(1)
    // ⚠️ ข้อที่สำคัญกว่า id: **เนื้อโจทย์ต้องเป็นชุดเดิม** — ถ้าตอบด้วยชุดที่เพิ่งสุ่มใหม่
    // ผู้เรียนจะเห็นโจทย์ใหม่คู่กับเฉลยเก่าที่เก็บไว้ใน attempt (mutation จับได้ตรงนี้)
    expect(new Set(targets).size, 'ค่าเป้าหมายต้องไม่เปลี่ยนระหว่าง refresh').toBe(1)
    expect(new Set(prompts).size, 'ตัวเลือกของ MCQ ต้องไม่สลับระหว่าง refresh').toBe(1)
  })

  test('🔴 reload คืนคำตอบและสถานะจำลองของ attempt เดิม แล้วล้าง draft หลังผ่าน', async ({ page }) => {
    await page.goto(LESSON_URL)
    const sim = page.getByTestId('checkpoint-sim-sim-1')
    await expect(sim).toBeVisible()

    const firstChoice = page.getByTestId('checkpoint-q-cp-1').locator('input').first()
    await firstChoice.check()
    await sim.getByTestId('sim-mode-static').check()
    await sim.getByTestId('sim-ipv4').fill('198.51.100.25')
    await sim.getByTestId('sim-subnet').fill('255.255.255.0')
    await sim.getByTestId('sim-gateway').fill('198.51.100.1')
    await sim.getByTestId('sim-apply').click()

    const draftKeys = await page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('academy.checkpoint-draft:v1:')))
    expect(draftKeys).toHaveLength(1)

    await page.reload()
    const restored = page.getByTestId('checkpoint-sim-sim-1')
    await expect(restored).toBeVisible()
    await expect(firstChoice).toBeChecked()
    await expect(restored.getByTestId('sim-mode-static')).toBeChecked()
    await expect(restored.getByTestId('sim-ipv4')).toHaveValue('198.51.100.25')
    await expect(restored.getByTestId('sim-status')).toHaveText('Settings applied')

    const target = /192\.168\.10\.\d+/.exec((await restored.textContent()) ?? '')?.[0]
    expect(target).toBeTruthy()
    await answerOnPage(page, COURSE, CAPSTONE)
    await restored.getByTestId('sim-ipv4').fill(target!)
    await restored.getByTestId('sim-subnet').fill('255.255.255.0')
    await restored.getByTestId('sim-gateway').fill('192.168.10.1')
    await restored.getByTestId('sim-apply').click()
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-continue')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => Object.keys(window.localStorage).filter((key) => key.startsWith('academy.checkpoint-draft:v1:'))))
      .toHaveLength(0)
  })
})
