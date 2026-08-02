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
