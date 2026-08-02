import { test, expect } from '@playwright/test'

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

test.describe('การรอโจทย์ของ attempt', () => {
  // คืนโควตาให้ไฟล์ถัดไป — e2e ทั้งชุดใช้บัญชีเดียว และโควตาคือ 3 ครั้ง/30 นาที
  // ต่อ (user, node) · ไฟล์ที่กิน attempt แล้วไม่คืน จะทำให้ไฟล์ถัดไปแดงแบบไม่มีเหตุผล
  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}`)
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

    // ตอบผิดทั้ง MCQ และด่านจำลอง แล้วกดตรวจ
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="A"]').check()
    await page.getByTestId('checkpoint-q-cp-2').locator('input[value="A"]').check()
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="A"]').check()
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

    // ตอบให้ถูกครบด้วยค่าของโจทย์ชุดใหม่ → ต้องผ่านจริง ไม่ใช่ค้างที่ 409
    const secondTarget = /192\.168\.10\.\d+/.exec((await sim2.textContent()) ?? '')?.[0]
    expect(secondTarget).toBeTruthy()
    expect(firstTarget).toBeTruthy()
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-q-cp-2').locator('input[value="C"]').check()
    await page.getByTestId('checkpoint-q-cp-3').locator('input[value="B"]').check()
    await sim2.getByTestId('sim-mode-static').click()
    await sim2.getByTestId('sim-ipv4').fill(secondTarget!)
    await sim2.getByTestId('sim-subnet').fill('255.255.255.0')
    await sim2.getByTestId('sim-gateway').fill('192.168.10.1')
    await sim2.getByTestId('sim-apply').click()
    await page.getByTestId('checkpoint-submit').click()
    await expect(page.getByTestId('checkpoint-continue')).toBeVisible()
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
