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

  test('Lab: ขยายเต็มจอได้ และ Escape กลับมาที่เดิม', async ({ page }) => {
    await page.goto(`${COURSE}/lessons/formats-hands-on`)
    await expect(page.getByTestId('lab-block')).toBeVisible()
    await expect(page.getByTestId('lab-fullscreen')).toHaveCount(0)

    await page.getByTestId('lab-expand').click()
    const overlay = page.getByTestId('lab-fullscreen')
    await expect(overlay).toBeVisible()

    // ต้องกินเต็มหน้าจอจริง ไม่ใช่แค่กล่องที่ใหญ่ขึ้น
    const box = await overlay.boundingBox()
    const viewport = page.viewportSize()!
    expect(box!.width).toBeGreaterThanOrEqual(viewport.width - 1)
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 1)

    await page.screenshot({ path: join(ARTIFACT_DIR, 'lab-fullscreen-desktop-1440.png'), animations: 'disabled' })

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('lab-fullscreen')).toHaveCount(0)
    await expect(page.getByTestId('lab-block')).toBeVisible()
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
