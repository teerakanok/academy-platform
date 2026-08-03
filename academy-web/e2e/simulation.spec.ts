import { test, expect } from '@playwright/test'
import { prepareNodeAccess } from './support/access'

const LESSON = '/courses/content-formats-demo/lessons/formats-simulation'
const ARTIFACTS = 'artifacts/simulation'

test.describe('โจทย์จำลองหน้าจอจริง', () => {
  test.beforeAll(async () => {
    await prepareNodeAccess('content-formats-demo', 'formats-simulation')
  })

  test('หน้าจอเปลี่ยนตามโหมด — เลือกรับอัตโนมัติแล้วช่องกรอกถูกปิด', async ({ page }) => {
    // นี่คือสิ่งที่อ่านสิบบรรทัดก็ไม่ชัดเท่าเห็นกับตา: สองอย่างนี้อยู่ด้วยกันไม่ได้
    await page.goto(LESSON)
    const sim = page.locator('[data-testid="simulation-block"]').first()

    await sim.getByTestId('sim-mode-static').click()
    await expect(sim.getByTestId('sim-ipv4')).toBeEnabled()

    await sim.getByTestId('sim-mode-dhcp').click()
    await expect(sim.getByTestId('sim-ipv4')).toBeDisabled()

    // กด OK ตอนเป็น DHCP แล้วต้องเห็นว่า "ได้ค่ามาจากที่อื่น" จริงๆ
    await sim.getByTestId('sim-apply').click()
    await expect(sim.getByTestId('sim-status')).toContainText('Lease obtained')
    await expect(sim.getByTestId('sim-ipv4')).not.toHaveValue('')
  })

  test('mobile แสดงค่า network เต็มช่องและปุ่มกดมี touch target เพียงพอ', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(LESSON)
    const sim = page.locator('[data-testid="simulation-block"]').first()
    await sim.getByTestId('sim-mode-static').click()

    const input = await sim.getByTestId('sim-ipv4').boundingBox()
    const apply = await sim.getByTestId('sim-apply').boundingBox()
    const cancel = await sim.getByRole('button', { name: 'Cancel' }).boundingBox()
    expect(input?.width).toBeGreaterThan(200)
    expect(apply?.height).toBeGreaterThanOrEqual(44)
    expect(cancel?.height).toBeGreaterThanOrEqual(44)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('ตัดสินจากสถานะสุดท้าย และบอกได้ว่าข้อไหนยังไม่ผ่านโดยไม่เฉลย', async ({ page }) => {
    await page.goto(LESSON)
    const sim = page.locator('[data-testid="simulation-block"]').first()

    // ตอบผิดบางส่วน: ถูกโหมดแต่ยังไม่กรอกอะไร
    await sim.getByTestId('sim-mode-static').click()
    await sim.getByTestId('simulation-check').click()
    const verdict = sim.getByTestId('simulation-verdict')
    await expect(verdict).toHaveAttribute('data-passed', 'false')
    await expect(sim.getByTestId('req-mode')).toHaveAttribute('data-met', 'true')
    await expect(sim.getByTestId('req-ip')).toHaveAttribute('data-met', 'false')
    // ต้องไม่มีเลขคำตอบโผล่ในผลตรวจ
    await expect(verdict).not.toContainText('192.168.10.50')

    // ทำครบแล้วผ่าน
    await sim.getByTestId('sim-ipv4').fill('192.168.10.50')
    await sim.getByTestId('sim-subnet').fill('255.255.255.0')
    await sim.getByTestId('sim-gateway').fill('192.168.10.1')
    await sim.getByTestId('sim-dns1').fill('192.168.10.1')
    await sim.getByTestId('sim-apply').click()
    await expect(sim.getByTestId('sim-status')).toContainText('Settings applied')

    // แก้ค่าหลัง Apply = configuration ปัจจุบันยังไม่ถูกยืนยัน ต้องไม่ค้างป้ายผ่าน
    await sim.getByTestId('sim-dns1').fill('8.8.8.8')
    await expect(sim.getByTestId('sim-status')).toContainText('Not applied yet')
    await sim.getByTestId('sim-dns1').fill('192.168.10.1')
    await sim.getByTestId('sim-apply').click()
    await sim.getByTestId('simulation-check').click()
    await expect(verdict).toHaveAttribute('data-passed', 'true')

    await page.screenshot({ path: `${ARTIFACTS}/network-static-passed.png`, animations: 'disabled' })
  })

  test('หน้าจอเดียวกัน โจทย์คนละแบบ คำตอบตรงข้ามกัน', async ({ page }) => {
    // หัวใจของบทนี้: สอน "ทำไมถึงมีสวิตช์นี้" ไม่ใช่สอนกรอกฟอร์ม
    await page.goto(LESSON)
    const laptop = page.locator('[data-testid="simulation-block"]').nth(1)

    // มาพร้อมค่า static ของออฟฟิศเดิม — ตอบแบบเดิมต้องไม่ผ่าน
    await laptop.getByTestId('simulation-check').click()
    await expect(laptop.getByTestId('simulation-verdict')).toHaveAttribute('data-passed', 'false')

    await laptop.getByTestId('sim-mode-dhcp').click()
    await laptop.getByTestId('sim-apply').click()
    await laptop.getByTestId('simulation-check').click()
    await expect(laptop.getByTestId('simulation-verdict')).toHaveAttribute('data-passed', 'true')
  })

  test('คำใบ้โผล่หลังลองเองสองครั้ง ไม่ใช่ตั้งแต่แรก', async ({ page }) => {
    // ให้เร็วกว่านี้คือชิงคิดแทนผู้เรียน
    await page.goto(LESSON)
    const sim = page.locator('[data-testid="simulation-block"]').first()
    await expect(sim.getByTestId('simulation-hint-toggle')).toHaveCount(0)

    await sim.getByTestId('simulation-check').click()
    await expect(sim.getByTestId('simulation-hint-toggle')).toHaveCount(0)

    await sim.getByTestId('simulation-check').click()
    await expect(sim.getByTestId('simulation-hint-toggle')).toBeVisible()
  })
})
