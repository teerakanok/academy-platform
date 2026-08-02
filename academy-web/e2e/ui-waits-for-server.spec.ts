import { test, expect } from '@playwright/test'

// W0-2 (F4) — หน้าจอต้องเชื่อเซิร์ฟเวอร์ ไม่ใช่เชื่อตัวเอง
//
// 🔴 เกณฑ์ของงานนี้ **ห้ามวัดด้วย "reload แล้วยังไม่ผ่าน"** — RIL รอบ 6 ของแผนชี้ว่า
// เกณฑ์นั้นเขียวบนโค้ดที่ยังไม่แก้: เมื่อเซิร์ฟเวอร์ตอบ passed:false ฝั่ง DB ก็ไม่เคย
// บันทึกว่าผ่านอยู่แล้ว reload จึงเขียวเสมอ ทั้งที่ UI ยังประกาศผลเองล่วงหน้า
//
// จึงวัด **บนหน้าจอ ก่อน reload** โดย intercept ที่ระดับ API:
//   1. หน่วง response ไว้ → ระหว่างรอต้องเห็น "กำลังตรวจ" และต้องยังไม่มีสถานะผ่าน
//   2. ให้ตอบ passed:false → หลังได้คำตอบต้องไม่มีสถานะผ่านปรากฏเลย
//
// ทำผ่านฝั่ง client ไม่ได้ เพราะ CheckpointQuiz ไม่มีเฉลยแล้ว — ผลทุกอย่างมาจาก API

const COURSE = 'content-formats-demo'
const NODE = 'formats-reading'

test.describe('UI รอผลจากเซิร์ฟเวอร์ก่อนประกาศว่าผ่าน', () => {
  // เทสแรกทำให้บทนี้ผ่านจริง — คืนสภาพให้ spec อื่นที่ใช้บัญชีเดียวกัน
  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}`)
  })

  test('ระหว่างรอ: แสดง "กำลังตรวจ" และยังไม่มีสถานะผ่านบนหน้าจอ', async ({ page }) => {
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })

    await page.route('**/api/progress', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON() as { action?: string }
      if (body?.action !== 'checkpoint') return route.continue()
      await held // ค้าง response ไว้จนกว่าเทสจะปล่อย
      await route.continue()
    })

    await page.goto(`/courses/${COURSE}/lessons/${NODE}`)
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-submit').click()

    // ระหว่างที่เซิร์ฟเวอร์ยังไม่ตอบ
    await expect(page.getByTestId('checkpoint-grading')).toBeVisible()
    await expect(page.getByTestId('lesson-status')).toHaveCount(0)
    await expect(page.getByTestId('checkpoint-continue')).toHaveCount(0)
    await expect(page.getByTestId('lesson-complete')).toHaveCount(0)

    release()
    // ตอบถูกจริง → หลังได้คำตอบจึงค่อยมีปุ่มไปต่อ
    await expect(page.getByTestId('checkpoint-continue')).toBeVisible()
  })

  test('เซิร์ฟเวอร์ตอบว่าไม่ผ่าน → ไม่มีสถานะผ่านโผล่บนหน้าจอเลย', async ({ page }) => {
    await page.route('**/api/progress', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON() as { action?: string }
      if (body?.action !== 'checkpoint') return route.continue()
      // เซิร์ฟเวอร์ปฏิเสธ ทั้งที่คำตอบที่ส่งไปถูก — UI ต้องเชื่อเซิร์ฟเวอร์
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, passed: false }),
      })
    })

    await page.goto(`/courses/${COURSE}/lessons/${NODE}`)
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-submit').click()

    await expect(page.getByTestId('checkpoint-not-passed')).toBeVisible()
    await expect(page.getByTestId('lesson-status')).toHaveCount(0)
    await expect(page.getByTestId('checkpoint-continue')).toHaveCount(0)
    await expect(page.getByTestId('lesson-complete')).toHaveCount(0)
    await expect(page.getByTestId('cheatsheet')).toHaveCount(0)
  })

  test('ตรวจไม่สำเร็จ (เซิร์ฟเวอร์ error) → บอกตรงๆ ไม่ใช่แกล้งว่าผ่าน', async ({ page }) => {
    await page.route('**/api/progress', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const body = route.request().postDataJSON() as { action?: string }
      if (body?.action !== 'checkpoint') return route.continue()
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'บันทึกความคืบหน้าไม่สำเร็จ' }),
      })
    })

    await page.goto(`/courses/${COURSE}/lessons/${NODE}`)
    await page.getByTestId('checkpoint-q-cp-1').locator('input[value="B"]').check()
    await page.getByTestId('checkpoint-submit').click()

    await expect(page.getByTestId('checkpoint-grade-failed')).toBeVisible()
    await expect(page.getByTestId('lesson-status')).toHaveCount(0)
    await expect(page.getByTestId('checkpoint-continue')).toHaveCount(0)
  })
})
