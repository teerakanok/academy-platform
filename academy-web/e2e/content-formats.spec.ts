import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// ตรวจพฤติกรรมของชนิดเนื้อหาตามหลักที่ล็อกไว้:
// อ่าน = เป็นเนื้อหาของเราเอง · ดู/ลงมือ = ฝัง + ขยายเต็มจอ · ของคนอื่น = ลิงก์ออก

const COURSE = '/courses/content-formats-demo'
const ARTIFACT_DIR = join(__dirname, '..', '..', 'artifacts', 'oneshot-2026-07-31', 'course')

test.describe('content formats', () => {
  test('ภาพ: อยู่ในหน้า คลิกขยายเต็มจอ แล้ว Escape กลับที่เดิม', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/formats-reading`)
    await expect(page.getByTestId('image-block')).toBeVisible()
    await expect(page.getByTestId('image-lightbox')).toHaveCount(0)

    await page.getByTestId('image-expand').click()
    await expect(page.getByTestId('image-lightbox')).toBeVisible()

    mkdirSync(ARTIFACT_DIR, { recursive: true })
    await page.screenshot({ path: join(ARTIFACT_DIR, 'image-lightbox-desktop-1440.png'), animations: 'disabled' })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('image-lightbox')).toHaveCount(0)
    // ยังอยู่หน้าเดิม ไม่ได้ถูกพาไปไหน
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Written material')
  })

  test('บทความแสดงที่มาโดยไม่ต้องฝัง iframe ใดๆ ในหน้า', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/formats-reading`)
    await expect(page.getByText('Adapted from a note written in Crux')).toBeVisible()
    // หลักการสำคัญ: ทั้งหน้าต้องไม่มี iframe เลย
    expect(await page.locator('iframe').count()).toBe(0)
  })

  test('PDF และลิงก์นอก: เปิดแท็บใหม่ + บอกผู้เรียนว่ากำลังออกไปไหน', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/formats-references`)

    const attachment = page.getByTestId('attachment-block')
    await expect(attachment).toBeVisible()
    await expect(attachment).toHaveAttribute('href', '/media/sample-handout.pdf')
    await expect(attachment).toHaveAttribute('target', '_blank')
    await expect(attachment).toContainText('Opens in a new tab')

    const external = page.getByTestId('external-link-block')
    await expect(external).toBeVisible()
    await expect(external).toHaveAttribute('target', '_blank')
    // rel ต้องมี noopener — กันหน้าปลายทางเข้าถึง window.opener ของเรา
    await expect(external).toHaveAttribute('rel', /noopener/)
    await expect(external).toContainText('Leaves Academy')
    await expect(external).toContainText('man7.org')

    expect(await page.locator('iframe').count()).toBe(0)
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'handouts-and-links-desktop-1440.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })

  test('ไฟล์ PDF ตัวอย่างเสิร์ฟได้จริงและเป็น PDF จริง', async ({ request }) => {
    const res = await request.get('/media/sample-handout.pdf')
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('pdf')
    const body = await res.body()
    expect(body.subarray(0, 5).toString()).toBe('%PDF-')
  })

  test('Lab ขยายได้ทั้งสองขนาด แต่คนละท่า: inline = กล่องใหญ่ · full = เต็มจอ', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/formats-hands-on`)
    const viewport = page.viewportSize()!

    const inline = page.locator('[data-testid="lab-block"][data-scale="inline"]')
    const full = page.locator('[data-testid="lab-block"][data-scale="full"]')
    await expect(inline).toBeVisible()
    await expect(full).toBeVisible()
    await expect(page.getByTestId('lab-fullscreen')).toHaveCount(0)

    // แบบฝึกสั้น: ตั้งต้นอยู่ในสายการอ่าน แต่ต้องขยายได้ถ้าจอเล็กหรือทำไม่ถนัด
    await inline.getByTestId('lab-expand').click()
    const dialog = page.getByTestId('lab-fullscreen')
    await expect(dialog).toHaveAttribute('data-mode', 'dialog')
    // ตั้งใจให้ไม่เต็มจอ — ยังเห็นหน้าบทเรียนอยู่ข้างหลัง = ยังไม่ได้ออกจากบทเรียน
    const panel = dialog.locator('> div')
    const dialogBox = (await panel.boundingBox())!
    expect(dialogBox.width).toBeLessThan(viewport.width)
    expect(dialogBox.height).toBeLessThan(viewport.height)
    expect(dialogBox.width).toBeGreaterThan(600)
    await page.screenshot({ path: join(ARTIFACT_DIR, 'lab-inline-dialog-desktop-1440.png'), animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('lab-fullscreen')).toHaveCount(0)

    // สถานการณ์เต็ม: เข้าโหมดทำงาน กินทั้งหน้าจอจริง
    await full.getByTestId('lab-expand').click()
    const overlay = page.getByTestId('lab-fullscreen')
    await expect(overlay).toHaveAttribute('data-mode', 'fullscreen')
    const box = (await overlay.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(box.height).toBeGreaterThanOrEqual(viewport.height - 1)

    mkdirSync(ARTIFACT_DIR, { recursive: true })
    await page.screenshot({ path: join(ARTIFACT_DIR, 'lab-fullscreen-desktop-1440.png'), animations: 'disabled' })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('lab-fullscreen')).toHaveCount(0)
    await expect(full).toBeVisible()
  })

  test('ก่อนตัดสินว่า "รู้แล้ว" ต้องเปิดดูสาระของบทได้', async ({ page }) => {
    // ชื่อบทกับหนึ่งประโยคไม่พอให้ใครตัดสินว่าตัวเองรู้แล้วจริงไหม
    await page.goto('/courses/basic-os-linux/lessons/linux-and-distros')
    await expect(page.getByTestId('key-ideas-peek')).toHaveCount(0)
    await page.getByTestId('peek-key-ideas').click()
    const peek = page.getByTestId('key-ideas-peek')
    await expect(peek).toBeVisible()
    await expect(peek.locator('li')).not.toHaveCount(0)

    // ติ๊กเองต้องไม่ใช่ประตู — ติ๊กครบแล้วต้องยังไม่มีอะไรถูกปลดล็อกหรือถูกกั้น
    // (การบอกเองไม่เคยขยับสถานะ มีแต่ checkpoint ที่ขยับ · ส่วนหลักฐานที่
    //  ใบรับรองอ้างถึงคือด่านบังคับเท่านั้น — W0-3)
    const items = peek.getByTestId('self-check-item')
    const total = await items.count()
    for (let i = 0; i < total; i++) await items.nth(i).click()
    // "พิสูจน์แล้วข้าม" ถูกปิดทั้งคอร์สจนกว่าจะมีคลังข้อแยกสำหรับโหมดวัดผล
    // (assessment-policy.ts) — ข้อความสรุปจึงต้องไม่ชี้ไปที่ปุ่มนั้น และปุ่มต้องไม่มี
    await expect(page.getByTestId('peek-verdict')).toContainText('checkpoint at the end')
    await expect(page.getByTestId('test-out')).toHaveCount(0)
    await expect(page.getByTestId('skip-lesson')).toBeEnabled()

    // กล่องสรุปท้ายบทต้องนับให้เห็น และ quiz ต้องเข้าถึงได้โดยไม่ต้องติ๊กครบก่อน
    await expect(page.getByTestId('takeaway-count')).toContainText(`0 / ${total}`)
    await expect(page.getByTestId('checkpoint')).toBeVisible()
    await page.getByTestId('key-takeaway-list').getByTestId('self-check-item').first().click()
    await expect(page.getByTestId('takeaway-count')).toContainText(`1 / ${total}`)
    // capstone ข้ามไม่ได้ จึงไม่มีแถบนี้เลย
    await page.goto(`${COURSE}/lessons/formats-hands-on`)
    await expect(page.getByTestId('peek-key-ideas')).toHaveCount(0)
  })

  test('คอร์ส demo ปรากฏบน dashboard ร่วมกับคอร์สจริง', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page.getByTestId('course-card-basic-os-linux')).toBeVisible()
    await expect(page.getByTestId('course-card-content-formats-demo')).toBeVisible()
    await page.screenshot({
      path: join(ARTIFACT_DIR, 'dashboard-two-courses-desktop-1440.png'),
      fullPage: true,
      animations: 'disabled',
    })
  })
})
