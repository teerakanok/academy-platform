import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { prepareNodeAccess } from './support/access'

const ORIGIN = 'http://127.0.0.1:3000'
const COURSE = 'content-formats-demo'
const NODE = 'formats-reading'

function serviceDb() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('E2E ต้องมี local Supabase env ตาม .env.example')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'academy' },
  })
}

async function learnerId(): Promise<string> {
  const email = readFileSync(join(__dirname, '..', 'test-results', '.auth', 'learner-email.txt'), 'utf8').trim()
  const account = await serviceDb().from('users').select('id').eq('email', email).single()
  if (account.error || !account.data) throw new Error('ไม่พบบัญชี E2E learner')
  return account.data.id as string
}

async function securitySnapshot(db: ReturnType<typeof serviceDb>, userId: string) {
  const progress = await db
    .from('node_progress')
    .select('*')
    .eq('user_id', userId)
    .eq('course_slug', COURSE)
    .order('node_id')
  const attempts = await db
    .from('attempt')
    .select('*')
    .eq('user_id', userId)
    .eq('course_slug', COURSE)
    .order('attempt_id')
  if (progress.error || attempts.error) throw new Error('อ่าน security snapshot ไม่สำเร็จ')
  return { progress: progress.data, attempts: attempts.data }
}

test.describe('security boundaries', () => {
  test('sibling origin เปลี่ยน progress ไม่ได้', async ({ request }) => {
    const before = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    const forged = await request.post('/api/progress', {
      headers: { origin: 'http://evil.cyberskills.co.th' },
      data: { slug: COURSE, nodeId: NODE, action: 'open' },
    })
    expect(forged.status()).toBe(403)

    const after = await (await request.get(`/api/progress?slug=${COURSE}`)).json()
    expect(after.record).toEqual(before.record)
  })

  test('simple content type ใช้ข้าม JSON boundary ไม่ได้', async ({ request }) => {
    const res = await request.post('/api/attempts', {
      headers: { origin: ORIGIN, 'content-type': 'text/plain' },
      data: JSON.stringify({ slug: COURSE, nodeId: 'formats-hands-on' }),
    })
    expect(res.status()).toBe(415)
  })

  test('revoked entitlement ปิดทั้ง API และหน้า lesson แล้วคืนสิทธิ์หลังจบ test', async ({ request, page }) => {
    const userId = await learnerId()
    const db = serviceDb()
    await prepareNodeAccess(COURSE, 'formats-references')
    await page.goto(`/courses/${COURSE}/lessons/formats-references`)
    const mediaOpenUrl = await page.getByTestId('attachment-block').getAttribute('href')
    expect(mediaOpenUrl).toMatch(/^\/api\/media\/open\?token=/)
    const revoked = await db
      .from('course_entitlement')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('course_slug', COURSE)
    if (revoked.error) throw new Error('revoke entitlement สำหรับ E2E ไม่สำเร็จ')

    try {
      const before = await securitySnapshot(db, userId)

      const denied = await Promise.all([
        request.get(`/api/progress?slug=${COURSE}`),
        request.post('/api/attempts', {
          data: { slug: COURSE, nodeId: 'formats-hands-on' },
        }),
        request.post('/api/progress', {
          data: { slug: COURSE, nodeId: NODE, action: 'open' },
        }),
        request.post(`/api/progress/reset?slug=${COURSE}&operationId=${crypto.randomUUID()}`),
        request.get(`/api/explanations?slug=${COURSE}&nodeId=${NODE}`),
        request.post('/api/practice/simulation', {
          data: {
            slug: COURSE,
            nodeId: 'formats-simulation',
            challengeId: 'static-print-server',
            state: {},
          },
        }),
      ])
      expect(denied.map((response) => response.status())).toEqual([403, 403, 403, 403, 403, 403])
      const deniedMedia = await request.get(mediaOpenUrl!, { maxRedirects: 0 })
      expect(deniedMedia.status()).toBe(403)

      const all = await request.get('/api/progress')
      expect(all.status()).toBe(200)
      const allBody = (await all.json()) as {
        records?: Record<string, unknown>
        accessibleCourseSlugs?: string[]
      }
      expect(allBody.records?.[COURSE]).toBeUndefined()
      expect(allBody.accessibleCourseSlugs).not.toContain(COURSE)

      await page.goto(`/courses/${COURSE}/lessons/${NODE}`)
      await expect(page).toHaveURL(/\/access-required\?/)
      await expect(page.getByTestId('course-access-required')).toBeVisible()

      await page.goto('/dashboard')
      await expect(page.getByTestId(`course-card-${COURSE}`)).toHaveCount(0)
      await expect(page.getByTestId('course-card-basic-os-linux')).toBeVisible()

      expect(await securitySnapshot(db, userId)).toEqual(before)
    } finally {
      const restored = await db
        .from('course_entitlement')
        .update({ revoked_at: null })
        .eq('user_id', userId)
        .eq('course_slug', COURSE)
      if (restored.error) throw new Error('คืน entitlement หลัง E2E ไม่สำเร็จ')
    }
  })

  test('suspended activation ปิดทุก read/write path โดยไม่เปลี่ยน DB', async ({ request }) => {
    const userId = await learnerId()
    const db = serviceDb()
    const before = await securitySnapshot(db, userId)
    const suspended = await db.from('service_activation').update({ status: 'suspended' }).eq('user_id', userId)
    if (suspended.error) throw new Error('suspend activation สำหรับ E2E ไม่สำเร็จ')

    try {
      const denied = await Promise.all([
        request.get('/api/progress'),
        request.get(`/api/progress?slug=${COURSE}`),
        request.post('/api/attempts', {
          data: { slug: COURSE, nodeId: 'formats-hands-on' },
        }),
        request.post('/api/progress', {
          data: { slug: COURSE, nodeId: NODE, action: 'open' },
        }),
        request.post(`/api/progress/reset?slug=${COURSE}&operationId=${crypto.randomUUID()}`),
        request.get(`/api/explanations?slug=${COURSE}&nodeId=${NODE}`),
        request.post('/api/practice/simulation', {
          data: {
            slug: COURSE,
            nodeId: 'formats-simulation',
            challengeId: 'static-print-server',
            state: {},
          },
        }),
      ])
      expect(denied.map((response) => response.status())).toEqual([403, 403, 403, 403, 403, 403, 403])
      expect(await securitySnapshot(db, userId)).toEqual(before)
    } finally {
      const restored = await db.from('service_activation').update({ status: 'active' }).eq('user_id', userId)
      if (restored.error) throw new Error('คืน activation หลัง E2E ไม่สำเร็จ')
    }
  })

  test('revoke ระหว่างเปิดบทหยุด mutation และแสดง access-lost state', async ({ page }) => {
    await prepareNodeAccess(COURSE, NODE)
    const opened = page.waitForResponse((response) => {
      if (!response.url().endsWith('/api/progress') || response.request().method() !== 'POST') return false
      return (response.request().postDataJSON() as { action?: string }).action === 'open'
    })
    await page.goto(`/courses/${COURSE}/lessons/${NODE}`)
    expect((await opened).status()).toBe(200)

    const userId = await learnerId()
    const db = serviceDb()
    const before = await securitySnapshot(db, userId)
    const revoked = await db
      .from('course_entitlement')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('course_slug', COURSE)
    if (revoked.error) throw new Error('revoke entitlement กลางบทไม่สำเร็จ')

    try {
      const denied = page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/progress') &&
          response.request().method() === 'POST' &&
          response.status() === 403,
      )
      await page.getByTestId('skip-lesson').click()
      await denied
      await expect(page.getByTestId('lesson-access-lost')).toBeVisible()
      expect(await securitySnapshot(db, userId)).toEqual(before)
    } finally {
      const restored = await db
        .from('course_entitlement')
        .update({ revoked_at: null })
        .eq('user_id', userId)
        .eq('course_slug', COURSE)
      if (restored.error) throw new Error('คืน entitlement หลัง mid-session test ไม่สำเร็จ')
    }
  })

  test('dashboard แยก session หมดจาก inactive enrollment', async ({ page }) => {
    await page.route('**/api/progress', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      }),
    )
    await page.goto('/dashboard')
    await expect(page.getByTestId('dashboard-signed-out')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Sign in to continue')
    await expect(page.getByTestId('dashboard-access-inactive')).toHaveCount(0)
  })

  test('course access 503 มี retry แล้วกลับมาใช้งานได้', async ({ page }) => {
    let first = true
    await page.route(`**/api/progress?slug=${COURSE}`, async (route) => {
      if (first) {
        first = false
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ ok: false }),
        })
        return
      }
      await route.continue()
    })
    await page.goto(`/courses/${COURSE}`)
    await expect(page.getByTestId('course-access-lost')).toBeVisible()
    await expect(page.getByTestId('course-progress-unconfirmed')).toBeVisible()
    await expect(page.getByTestId('course-progress-content')).toHaveCount(0)
    await expect(page.getByTestId('course-summary')).toHaveCount(0)
    await expect(page.getByTestId('certificate-status')).toHaveCount(0)
    await expect(page.getByTestId('course-radar')).toHaveCount(0)
    await page.getByTestId('course-access-retry').click()
    await expect(page.getByTestId('start-or-continue')).toBeVisible()
    await expect(page.getByTestId('course-progress-content')).toBeVisible()
    await expect(page.getByTestId('course-access-lost')).toHaveCount(0)
  })

  test('course progress 401 ซ่อนทุก surface ที่ derive จาก record ว่างปลอม', async ({ page }) => {
    await page.route(`**/api/progress?slug=${COURSE}`, (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      }),
    )
    await page.goto(`/courses/${COURSE}`)
    await expect(page.getByTestId('course-access-lost')).toContainText('Sign in again')
    await expect(page.getByTestId('course-progress-unconfirmed')).toBeVisible()
    await expect(page.getByTestId('start-or-continue')).toHaveCount(0)
    await expect(page.getByTestId('course-progress-content')).toHaveCount(0)
    await expect(page.getByTestId('course-summary')).toHaveCount(0)
    await expect(page.getByTestId('certificate-status')).toHaveCount(0)
    await expect(page.getByTestId('course-radar')).toHaveCount(0)
  })

  test('access-required derive สิทธิ์จริงและรักษา locale', async ({ page }) => {
    await page.goto(`/access-required?course=${COURSE}`)
    await expect(page).toHaveURL(new RegExp(`/courses/${COURSE}$`))

    await prepareNodeAccess('basic-os-linux', 'os-what-it-does')
    await page.goto('/courses/basic-os-linux/lessons/linux-and-distros?lang=th')
    await expect(page).toHaveURL(/\/access-required\?/)
    await expect(page.getByText('This lesson is not unlocked yet')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Return to the course roadmap' })).toHaveAttribute(
      'href',
      '/courses/basic-os-linux?lang=th',
    )
  })

  test('sign-out failure ไม่ redirect และแจ้งผู้ใช้', async ({ page }) => {
    await page.route('**/api/auth/sign-out', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      }),
    )
    await page.goto('/dashboard')
    await page.getByTestId('header-sign-out').click()
    await expect(page.getByTestId('sign-out-error')).toBeVisible()
    await expect(page.getByTestId('sign-out-error')).toHaveText(/Could not sign out/)
    await expect(page).toHaveURL(/\/dashboard$/)
    await expect(page.getByTestId('header-sign-out')).toBeEnabled()
  })

  test('sign-out fallback พาออกจากหน้าส่วนตัวและแจ้ง local-only อย่างมองเห็นได้', async ({ page }) => {
    await page.route('**/api/auth/sign-out', async (route) => {
      // route จริง expire auth cookies ก่อนคืน not-confirmed; fixture ต้องจำลองผลนั้นด้วย
      await page.context().clearCookies()
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          scope: 'local',
          revocation: 'not-confirmed',
        }),
      })
    })
    await page.goto('/dashboard')
    await page.getByTestId('header-sign-out').click()
    await expect(page).toHaveURL(/\/sign-in\?notice=local-only$/)
    await expect(page.getByRole('status')).toBeVisible()
    await expect(page.getByRole('status')).toContainText('Signed out of this browser')
  })
})
