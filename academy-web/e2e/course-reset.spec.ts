import { expect, test } from '@playwright/test'
import { prepareNodeAccess } from './support/access'

const COURSE = 'content-formats-demo'
const FIRST_NODE = 'formats-reading'
const COURSE_URL = `/courses/${COURSE}`

test.describe('reset course progress', () => {
  test.beforeEach(async ({ request }) => {
    await prepareNodeAccess(COURSE, FIRST_NODE)
    const skipped = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: FIRST_NODE, action: 'skip' },
    })
    expect(skipped.ok()).toBe(true)
  })

  test.afterEach(async ({ request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}&operationId=${crypto.randomUUID()}`)
  })

  test('ต้องยืนยันก่อน และ Cancel ไม่เปลี่ยน learning record', async ({ page }) => {
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()

    const dialog = page.getByRole('dialog', { name: 'Reset course progress?' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(/checkpoint attempts/i)
    await expect(page.getByTestId('reset-cancel')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByTestId('reset-confirm')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('reset-cancel')).toBeFocused()
    await page.screenshot({
      path: 'test-results/reset-dialog-desktop.png',
      animations: 'disabled',
    })
    await page.getByTestId('reset-cancel').click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByTestId('reset-course')).toBeFocused()

    const record = (await (await page.request.get(`/api/progress?slug=${COURSE}`)).json()).record
    expect(record.skipped).toContain(FIRST_NODE)
  })

  test('confirmation ใช้งานได้บน mobile โดยไม่ล้นจอและปุ่มกดสูงพอ', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()

    const dialog = page.getByRole('dialog', { name: 'Reset course progress?' })
    const box = await dialog.boundingBox()
    const cancel = await page.getByTestId('reset-cancel').boundingBox()
    const confirm = await page.getByTestId('reset-confirm').boundingBox()
    expect(box?.x).toBeGreaterThanOrEqual(0)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
    expect(cancel?.height).toBeGreaterThanOrEqual(44)
    expect(confirm?.height).toBeGreaterThanOrEqual(44)
    await page.screenshot({
      path: 'test-results/reset-dialog-mobile.png',
      animations: 'disabled',
    })
    await page.getByTestId('reset-cancel').click()
  })

  test('server ปฏิเสธและไม่มี receipt → คงผลเป็น unknown โดยไม่เสนอ reset ซ้ำ', async ({ page }) => {
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: 'reset failed' }),
      })
    })
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()

    await expect(page.getByTestId('reset-result')).toContainText('could not confirm')
    await expect(page.getByTestId('reset-confirm')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Check reset status' })).toBeEnabled()
    await expect(page.getByTestId('reset-course')).toBeVisible()

    // ผลลัพธ์เป็น focus target ที่ไม่อยู่ใน tab order: Shift+Tab ต้องวนไปปุ่มสุดท้าย
    // ภายใน dialog ไม่ใช่หลุดไป BODY
    await page.getByTestId('reset-result').focus()
    await page.keyboard.press('Shift+Tab')
    await expect(page.getByTestId('reset-check')).toBeFocused()
    await page.getByTestId('reset-close').click()
    await expect(page.getByTestId('reset-course')).toBeFocused()

    // เปิดซ้ำหลัง unknown ต้อง commit phase confirm ก่อน show/focus dialog
    await page.getByTestId('reset-course').click()
    await expect(page.getByTestId('reset-cancel')).toBeFocused()
    await expect(page.getByTestId('reset-confirm')).toBeVisible()
    await page.getByTestId('reset-cancel').click()
    const record = (await (await page.request.get(`/api/progress?slug=${COURSE}`)).json()).record
    expect(record.skipped).toContain(FIRST_NODE)
  })

  test('ระหว่างรอ reset focus อยู่กับ status และ Escape ปิด dialog ไม่ได้', async ({ page }) => {
    let releaseRequest: (() => void) | undefined
    const requestReleased = new Promise<void>((resolve) => {
      releaseRequest = resolve
    })
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await requestReleased
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })

    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    const dialog = page.getByRole('dialog', { name: 'Reset course progress?' })
    const status = page.getByTestId('reset-result')
    await expect(status).toContainText('Resetting')
    await expect(status).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(status).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeVisible()

    releaseRequest?.()
    await expect(status).toContainText('could not confirm')
  })

  test('server commit แล้ว response หาย → receipt ยืนยันและแสดง success', async ({ page }) => {
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const committed = await route.fetch()
      expect(committed.ok()).toBe(true)
      await route.abort('failed')
    })
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()

    await expect(page.getByTestId('reset-result')).toContainText('Progress reset')
    await page.getByTestId('reset-done').click()
    await expect(page.getByTestId('reset-course')).toHaveCount(0)
    await expect(page.getByTestId('course-title')).toBeFocused()
    const record = (await (await page.request.get(`/api/progress?slug=${COURSE}`)).json()).record
    expect(record.skipped).toEqual([])
  })

  test('ยังยืนยันผลไม่ได้ → Check this reset อ่าน receipt และไม่ส่ง reset ซ้ำ', async ({ page }) => {
    await page.goto(COURSE_URL)
    await expect(page.getByTestId('reset-course')).toBeVisible()
    let resetRequests = 0
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() === 'POST') {
        resetRequests += 1
        await route.abort('failed')
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, completed: false }),
      })
    })

    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('reset-result')).toContainText('could not confirm')

    await page.getByTestId('reset-check').click()
    await expect(page.getByTestId('reset-result')).toContainText('could not confirm')
    expect(resetRequests).toBe(1)
  })

  test('reset สำเร็จแล้วอีกแท็บเริ่มงานใหม่ → receipt ยืนยัน reset และรักษา record รอบใหม่', async ({ page }) => {
    let resetRequests = 0
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      resetRequests += 1
      const committed = await route.fetch()
      expect(committed.ok()).toBe(true)
      const opened = await page.request.post('/api/progress', {
        data: { slug: COURSE, nodeId: FIRST_NODE, action: 'open' },
      })
      expect(opened.ok()).toBe(true)
      await route.abort('failed')
    })

    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('reset-result')).toContainText('Progress reset')
    await expect(page.getByTestId('reset-result')).not.toContainText('Nothing has been cleared')
    await page.getByTestId('reset-done').click()
    await expect(page.getByTestId('reset-course')).toBeVisible()
    expect(resetRequests).toBe(1)
  })

  test('response 200 มาช้า หลังอีกแท็บเริ่มงานใหม่ → อ่าน receipt แล้วรักษา record รอบใหม่', async ({ page }) => {
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      const response = await route.fetch()
      expect(response.ok()).toBe(true)
      const opened = await page.request.post('/api/progress', {
        data: { slug: COURSE, nodeId: FIRST_NODE, action: 'open' },
      })
      expect(opened.ok()).toBe(true)
      await route.fulfill({ response })
    })

    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('reset-result')).toContainText('Progress reset')
    await page.getByTestId('reset-done').click()
    await expect(page.getByTestId('reset-course')).toBeVisible()
  })

  test('POST 403 → รับทราบแล้วซ่อน stale roadmap และ reset trigger', async ({ page }) => {
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      await route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      })
    })
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('reset-result')).toContainText('access changed')
    await page.getByTestId('reset-done').click()
    await expect(page.getByTestId('course-access-lost')).toBeVisible()
    await expect(page.getByTestId('course-title')).toBeFocused()
    await expect(page.getByTestId('course-progress-content')).toHaveCount(0)
    await expect(page.getByTestId('reset-course')).toHaveCount(0)
  })

  test('POST 200 แต่โหลด record ล่าสุดไม่ได้ → บอกว่า reset สำเร็จและให้ refresh โดยไม่อ้างว่า unchanged', async ({
    page,
  }) => {
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() === 'POST') return route.continue()
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('reset-result')).toContainText('reset completed')
    await page.getByTestId('reset-done').click()

    const alert = page.getByTestId('course-access-lost')
    await expect(alert).toContainText('Your reset completed')
    await expect(alert).not.toContainText('unchanged')
    await expect(page.getByTestId('course-progress-content')).toHaveCount(0)
    await page.getByTestId('course-access-retry').click()
    await expect(page.getByTestId('course-progress-content')).toBeVisible()
  })

  test('unknown แล้วตรวจซ้ำเจอ 401 → ยังไม่อ้างว่า progress ไม่ถูก reset', async ({ page }) => {
    await page.route('**/api/progress/reset?**', async (route) => {
      if (route.request().method() === 'POST') return route.abort('failed')
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      })
    })
    await page.goto(COURSE_URL)
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await page.getByTestId('reset-check').click()
    await expect(page.getByTestId('reset-result')).toContainText('could not confirm')
    await expect(page.getByTestId('reset-result')).not.toContainText('was not reset')
  })

  test('record ที่มีเฉพาะ in-progress ก็แสดง reset และล้างได้', async ({ page, request }) => {
    await request.post(`/api/progress/reset?slug=${encodeURIComponent(COURSE)}&operationId=${crypto.randomUUID()}`)
    const opened = await request.post('/api/progress', {
      data: { slug: COURSE, nodeId: FIRST_NODE, action: 'open' },
    })
    expect(opened.ok()).toBe(true)

    await page.goto(COURSE_URL)
    await expect(page.getByTestId('reset-course')).toBeVisible()
    await page.getByTestId('reset-course').click()
    await page.getByTestId('reset-confirm').click()
    await expect(page.getByTestId('reset-result')).toContainText('Progress reset')
  })
})
