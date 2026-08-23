import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Accessibility baseline ของ public surface — สแกนหกพื้นผิวสาธารณะด้วย axe-core
// ภายใต้ default public suite (`npm run test:e2e:public`) ซึ่งรัน offline ทั้งหมด
// และทำงานในทั้งสอง project: public-chromium (desktop 1280x900) และ public-mobile
// (Pixel 5) — รวม 6 surface x 2 viewport = 12 สแกนต่อการรัน
//
// ใช้แพทเทิร์นเดียวกับ e2e/player.spec.ts (expectNoSeriousViolations) — ห้ามอ่อน
// threshold: ถ้าหน้าไหนมี violation ระดับ critical/serious จริง ให้เก็บรายการ
// (impact:rule → selector + helpUrl) ไว้เป็น backlog จาก red run ไม่ใช่ปิด assertion

type PublicSurface = {
  name: string
  path: string
  ready: (page: Page) => Promise<void>
}

async function h1Visible(page: Page) {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
}

const PUBLIC_SURFACES: readonly PublicSurface[] = [
  { name: 'home', path: '/', ready: h1Visible },
  { name: 'course catalog', path: '/courses', ready: h1Visible },
  // legacy slug ของคอร์สสาธารณะ — 308 ไป canonical `/en` ตอนผู้เยี่ยมยังไม่มีค่ากำหนดภาษา
  {
    name: 'course detail',
    path: '/courses/basic-os-linux',
    ready: async (page) => {
      await expect(page.getByTestId('public-course-syllabus')).toBeVisible()
    },
  },
  { name: 'privacy notice', path: '/privacy', ready: h1Visible },
  { name: 'sign-in', path: '/sign-in', ready: h1Visible },
  { name: 'unsubscribe', path: '/unsubscribe', ready: h1Visible },
]

async function expectNoSeriousViolations(page: Page, testInfo: TestInfo) {
  // ตัด transition/animation ก่อน sample สี — กัน color-contrast flake ตอนอยู่กลาง transition
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' })
  const results = await new AxeBuilder({ page }).analyze()
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious')

  if (serious.length > 0) {
    // ทำให้ red run เป็น backlog ที่ทำงานได้ทันที: ทุก node + helpUrl ของทุก rule
    const backlog = serious.flatMap((violation) => [
      `${violation.impact}:${violation.id} — ${violation.help} (${violation.helpUrl})`,
      ...violation.nodes.map(
        (node) => `  → ${node.target.join(' ')}${node.html ? ` :: ${node.html.slice(0, 120)}` : ''}`,
      ),
    ])
    const report = backlog.join('\n')
    console.error(`[axe] critical/serious violations:\n${report}`)
    await testInfo.attach('axe-serious-violations', {
      body: report,
      contentType: 'text/plain',
    })
  }

  expect(
    serious.map((v) => `${v.impact}:${v.id} → ${v.nodes[0]?.target}`),
    'axe ต้องไม่มี violation ระดับ critical/serious',
  ).toEqual([])
}

async function expectMessageAdjacentToEmail(email: Locator, message: Locator) {
  const emailHandle = await email.elementHandle()
  if (!emailHandle) throw new Error('Waitlist email control must be measurable')
  const { controlBox: emailBox, messageBox } = await message.evaluate((messageElement, emailElement) => {
    const controlBox = emailElement.getBoundingClientRect()
    const feedbackBox = messageElement.getBoundingClientRect()
    return {
      controlBox: { x: controlBox.x, y: controlBox.y, width: controlBox.width, height: controlBox.height },
      messageBox: { x: feedbackBox.x, y: feedbackBox.y, width: feedbackBox.width, height: feedbackBox.height },
    }
  }, emailHandle)
  await emailHandle.dispose()

  expect(messageBox.x).toBeGreaterThanOrEqual(emailBox.x)
  expect(messageBox.x).toBeLessThanOrEqual(emailBox.x + emailBox.width)
  expect(messageBox.y).toBeGreaterThanOrEqual(emailBox.y + emailBox.height)
  expect(messageBox.y - (emailBox.y + emailBox.height)).toBeLessThanOrEqual(16)
}

async function expectMessageAdjacentToConsent(consent: Locator, message: Locator) {
  const consentHandle = await consent.elementHandle()
  if (!consentHandle) throw new Error('Waitlist consent control must be measurable')
  const { controlBox: consentBox, messageBox } = await message.evaluate((messageElement, consentElement) => {
    const controlBox = consentElement.getBoundingClientRect()
    const feedbackBox = messageElement.getBoundingClientRect()
    return {
      controlBox: { x: controlBox.x, y: controlBox.y, width: controlBox.width, height: controlBox.height },
      messageBox: { x: feedbackBox.x, y: feedbackBox.y, width: feedbackBox.width, height: feedbackBox.height },
    }
  }, consentHandle)
  await consentHandle.dispose()

  expect(messageBox.x).toBeGreaterThanOrEqual(consentBox.x)
  expect(messageBox.x - consentBox.x).toBeLessThanOrEqual(16)
  expect(messageBox.y).toBeGreaterThanOrEqual(consentBox.y + consentBox.height)
}

test.describe('public surface accessibility baseline', () => {
  for (const surface of PUBLIC_SURFACES) {
    test(`axe: ${surface.name} (${surface.path}) ไม่มี critical/serious violation`, async (
      { page },
      testInfo,
    ) => {
      const response = await page.goto(surface.path)
      expect(response?.status(), `HTTP status ของ ${surface.path}`).toBeLessThan(400)
      await surface.ready(page)
      await expectNoSeriousViolations(page, testInfo)
    })
  }
})

test.describe('landing responsive course previews', () => {
  test('fits the viewport and preserves course content', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Course previews' })).toBeVisible()

    const documentMetrics = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(documentMetrics.scrollWidth).toBeLessThanOrEqual(documentMetrics.clientWidth)

    const section = page.locator('section[aria-labelledby="catalog-heading"]')
    const sectionBox = await section.boundingBox()
    expect(sectionBox?.x).toBeGreaterThanOrEqual(0)
    expect(sectionBox ? sectionBox.x + sectionBox.width : undefined).toBeLessThanOrEqual(
      documentMetrics.clientWidth,
    )

    const columnCount = await section
      .locator('ul')
      .evaluate((list) => getComputedStyle(list).gridTemplateColumns.split(' ').filter(Boolean).length)
    const expectedColumns = test.info().project.name === 'public-mobile' ? 1 : 2
    expect(columnCount).toBe(expectedColumns)

    const cards = section.getByRole('link')
    expect(await cards.count()).toBeGreaterThan(0)
    const cardBoxes = await cards.evaluateAll((links) =>
      links.map((link) => {
        const card = link.getBoundingClientRect()
        const cover = link.querySelector<HTMLElement>('[aria-hidden="true"]')
        const title = link.querySelector('h3')
        const subtitle = link.querySelector('p')
        if (!cover || !title || !subtitle) {
          throw new Error('Course preview is missing its cover, title, or subtitle')
        }

        return {
          card: card.toJSON(),
          cover: cover.getBoundingClientRect().toJSON(),
          title: title.getBoundingClientRect().toJSON(),
          subtitle: subtitle.getBoundingClientRect().toJSON(),
        }
      }),
    )

    for (const { card, cover, title, subtitle } of cardBoxes) {
      expect(card.left).toBeGreaterThanOrEqual(0)
      expect(card.right).toBeLessThanOrEqual(documentMetrics.clientWidth)
      expect(cover.left).toBeGreaterThanOrEqual(card.left)
      expect(cover.right).toBeLessThanOrEqual(card.right)
      expect(cover.bottom).toBeLessThanOrEqual(title.top)
      expect(title.left).toBeGreaterThanOrEqual(card.left)
      expect(title.right).toBeLessThanOrEqual(card.right)
      expect(subtitle.left).toBeGreaterThanOrEqual(card.left)
      expect(subtitle.right).toBeLessThanOrEqual(card.right)
      expect(subtitle.bottom).toBeLessThanOrEqual(card.bottom)
    }
  })
})

test.describe('public waitlist form validation', () => {
  test('rejects malformed email locally, then submits one normalized valid request', async ({ page }) => {
    const requests: unknown[] = []
    await page.route('**/api/leads', async (route) => {
      requests.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })

    await page.goto('/')
    const email = page.getByRole('textbox', { name: 'Email' })
    await email.fill('not-an-email')
    await page.getByTestId('consent-checkbox').check()
    await page.getByRole('button', { name: 'Notify me' }).click()

    await expect(email).toBeFocused()
    await expect(email).toHaveAttribute('aria-invalid', 'true')
    await expect(email).toHaveAttribute('aria-describedby', 'waitlist-email-error')
    await expect(page.getByTestId('waitlist-email-error')).toContainText(
      'Enter an email address in this format: name@example.com.',
    )
    await expectMessageAdjacentToEmail(email, page.getByTestId('waitlist-email-error'))
    expect(requests).toEqual([])

    await email.fill('  learner@example.com  ')
    await expect(email).toHaveAttribute('aria-invalid', 'false')
    await expect(email).not.toHaveAttribute('aria-describedby', 'waitlist-email-error')
    await page.getByRole('button', { name: 'Notify me' }).click()
    await expect(page.getByTestId('waitlist-success')).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ email: 'learner@example.com', consent: true })
  })

  test('keeps consent mandatory and linked to corrective feedback', async ({ page }) => {
    const requests: unknown[] = []
    await page.route('**/api/leads', async (route) => {
      requests.push(route.request().postDataJSON())
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Email' }).fill('learner@example.com')
    await page.getByRole('button', { name: 'Notify me' }).click()

    const consent = page.getByTestId('consent-checkbox')
    await expect(consent).toBeFocused()
    await expect(consent).toHaveAttribute('aria-invalid', 'true')
    await expect(consent).toHaveAttribute('aria-describedby', 'waitlist-consent-error')
    await expect(page.getByTestId('waitlist-consent-error')).toContainText(
      'Accept the privacy notice to continue.',
    )
    await expectMessageAdjacentToConsent(consent, page.getByTestId('waitlist-consent-error'))
    await expect(consent).toHaveCSS('outline-style', 'solid')
    await expect(consent).toHaveCSS('outline-width', '2px')
    const invalidBorderColor = await consent.evaluate((element) => getComputedStyle(element).borderColor)
    expect(requests).toEqual([])

    await consent.focus()
    await page.keyboard.press('Space')
    await expect(consent).toHaveAttribute('aria-invalid', 'false')
    await expect(page.getByTestId('waitlist-consent-error')).toHaveCount(0)
    expect(await consent.evaluate((element) => getComputedStyle(element).borderColor)).not.toBe(invalidBorderColor)
    await expect(consent).toBeFocused()
    await expect(consent).toHaveCSS('outline-style', 'solid')
    await expect(consent).toHaveCSS('outline-width', '2px')
  })

  test('keeps a resolved-response body-read failure distinct from rejection', async ({ page }) => {
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window)
      const browserWindow = window as typeof window & { __waitlistRequests: unknown[] }
      browserWindow.__waitlistRequests = []
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        const url = new URL(requestUrl, window.location.href)
        if (url.pathname !== '/api/leads') return nativeFetch(input, init)

        browserWindow.__waitlistRequests.push(JSON.parse(String(init?.body)))
        const body = new ReadableStream({
          type: 'bytes',
          pull(controller) {
            controller.error(new Error('response body failed'))
          },
        })
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Email' }).fill('learner@example.com')
    await page.getByTestId('consent-checkbox').check()
    await page.getByRole('button', { name: 'Notify me' }).click()

    await expect(page.getByTestId('waitlist-error')).toContainText('Could not reach the server.')
    await expect(page.getByTestId('waitlist-email-error')).toHaveCount(0)
    const requests = await page.evaluate(() => {
      const browserWindow = window as typeof window & { __waitlistRequests: unknown[] }
      return browserWindow.__waitlistRequests
    })
    expect(requests).toEqual([
      expect.objectContaining({ email: 'learner@example.com', consent: true }),
    ])
  })

  test('keeps offline and rejected request outcomes distinct from local validation', async ({ page }) => {
    let rejected = false
    await page.route('**/api/leads', async (route) => {
      if (!rejected) {
        rejected = true
        await route.abort('failed')
        return
      }
      await route.fulfill({ status: 500, body: 'unexpected' })
    })

    await page.goto('/')
    await page.getByRole('textbox', { name: 'Email' }).fill('learner@example.com')
    await page.getByTestId('consent-checkbox').check()
    await page.getByRole('button', { name: 'Notify me' }).click()
    await expect(page.getByTestId('waitlist-error')).toContainText('Could not reach the server.')
    await expect(page.getByTestId('waitlist-email-error')).toHaveCount(0)

    await page.getByRole('button', { name: 'Notify me' }).click()
    await expect(page.getByTestId('waitlist-error')).toContainText('Could not save that.')
    await expect(page.getByTestId('waitlist-email-error')).toHaveCount(0)
  })
})
