import { test, expect } from '@playwright/test'

// Academy เป็นปลายทางที่คนเปิดจากลิงก์บนมือถือได้ตรงๆ — หน้าแรกที่เห็นคือหน้าที่
// ตัดสินว่าเขาจะอยู่ต่อไหม การเลื่อนซ้ายขวาได้คือสัญญาณ "เว็บพัง" ที่คนอ่านออกทันที
// โดยไม่ต้องรู้เรื่องเทคนิค
//
// เคยหลุดมาแล้วจริง: header ที่ 390px ใส่ logo + ชื่อเต็ม + สองลิงก์ + ปุ่มธีม ไม่พอ
// จนล้น 31px ทั้งเว็บเลื่อนได้ และมันลาก overlay ที่เป็น fixed ให้เขยิบตามไปด้วย
// จน lab เต็มจอมีปุ่มปิดโผล่พ้นขอบจอ — เทสเดิมทุกตัวเขียวหมดเพราะไม่มีใครวัดที่ 390px

// ระบุค่าเองแทน devices['iPhone 13'] เพราะ preset นั้นพ่วง defaultBrowserType:'webkit'
// มาด้วย ทำให้ทั้งไฟล์เด้งไปขอ WebKit ที่ไม่ได้ติดตั้ง — ที่ต้องการจริงคือ "ขนาดจอ
// กับนิ้ว" ไม่ใช่ "เบราว์เซอร์อื่น"
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })

const PAGES = [
  ['/dashboard', 'หน้า My learning'],
  ['/courses', 'หน้ารายการคอร์สสาธารณะ'],
  ['/courses/basic-os-linux', 'หน้าคอร์ส + roadmap'],
  ['/courses/basic-os-linux/lessons/permissions', 'บทเรียนที่มี lab แทรก'],
  ['/courses/content-formats-demo/lessons/formats-hands-on', 'บทเรียนที่มี lab สองขนาด'],
] as const

for (const [path, label] of PAGES) {
  test(`${label} ไม่เลื่อนซ้ายขวาบนมือถือ`, async ({ page }) => {
    await page.goto(path)
    const { scrollWidth, clientWidth, culprits } = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth
      const culprits: string[] = []
      // หาเฉพาะตัวที่ล้นออกนอกจอจริงๆ และไม่ได้อยู่ในกล่องที่ตั้งใจให้เลื่อนเอง
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.right <= vw + 1) continue
        let scrollable = false
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (getComputedStyle(p).overflowX !== 'visible') {
            scrollable = true
            break
          }
        }
        if (!scrollable) culprits.push(`${el.tagName}.${String(el.className).slice(0, 50)} → ${Math.round(r.right)}px`)
      }
      return { scrollWidth: document.documentElement.scrollWidth, clientWidth: vw, culprits: culprits.slice(0, 5) }
    })
    expect(scrollWidth, `ล้นขอบจอ: ${culprits.join(' | ')}`).toBeLessThanOrEqual(clientWidth + 1)
  })
}

test('เนื้อหาใน lab แบบ inline ต้องอยู่ในกล่อง ไม่ล้นไปทับย่อหน้าข้างบน', async ({ page }) => {
  // ความสูงตายตัวบวกข้อความที่ยาวขึ้นบนจอแคบ = ตัวหนังสือไหลออกนอกกรอบไปทับ
  // ย่อหน้าก่อนหน้า อ่านไม่ออกทั้งคู่ และ scrollWidth ไม่จับเพราะมันล้นแนวตั้ง
  await page.goto('/courses/basic-os-linux/lessons/permissions')
  const panel = page.locator('[data-scale="inline"] .relative')
  const text = panel.locator('p').first()
  const outer = (await panel.boundingBox())!
  const inner = (await text.boundingBox())!
  expect(inner.y).toBeGreaterThanOrEqual(outer.y - 1)
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height + 1)
})

test('ทางลัดคีย์บอร์ดไม่ถูกเขียนบอกคนที่ไม่มีคีย์บอร์ด', async ({ page }) => {
  // "(Esc)" บนมือถือคือคำสั่งที่ทำตามไม่ได้ ทางออกต้องเป็นปุ่มที่กดเห็นๆ
  await page.goto('/courses/content-formats-demo/lessons/formats-hands-on')
  await page.locator('[data-scale="full"] [data-testid="lab-expand"]').click()
  const close = page.getByTestId('lab-fullscreen-close')
  await expect(close).toBeVisible()
  // ต้องอ่านด้วย innerText ไม่ใช่ textContent — ป้ายทั้งสองแบบอยู่ใน DOM พร้อมกัน
  // แล้วซ่อนด้วย CSS ตามขนาดจอ ถ้าวัดด้วย textContent จะเห็นทั้งคู่และเทสไม่มีความหมาย
  const label = await close.evaluate((el) => (el as HTMLElement).innerText.trim())
  expect(label).toBe('Done')

  // ปุ่มปิดต้องอยู่ในจอ ไม่ใช่โผล่พ้นขอบขวา
  const box = (await close.boundingBox())!
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width)

  await close.click()
  await expect(page.getByTestId('lab-fullscreen')).toHaveCount(0)
})
