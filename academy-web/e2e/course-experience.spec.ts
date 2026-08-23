import { expect, test } from '@playwright/test'

const LEGACY_COURSE_PATH = '/courses/basic-os-linux'
const COURSE_PATH = `${LEGACY_COURSE_PATH}/en`
const CATALOG_PATH = '/courses'

function coursePath(locale: 'en' | 'th') {
  return `${LEGACY_COURSE_PATH}/${locale}`
}
const EMPTY_RECORD = {
  version: 'v1',
  slug: 'basic-os-linux',
  completed: [],
  skipped: [],
  testedOut: [],
  inProgress: [],
  checkpointResults: {},
  videoCueResults: {},
  simulationEvidence: {},
  lastNodeId: null,
  updatedAt: 0,
}

test.describe('public-to-learner course transition', () => {
  test('the English-only root ignores a stored Thai preference', async ({ page, context }) => {
    await context.addCookies([{
      name: 'academy.lang',
      value: 'th',
      url: 'http://127.0.0.1:61001',
    }])
    await page.goto('/')
    await page.waitForTimeout(200)

    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Stop relearning')
    await expect(page.getByRole('banner').getByRole('link', { name: 'My learning' })).toBeVisible()
  })

  test('choosing Thai from the root enters the translated course catalogue', async ({ page }) => {
    await page.goto('/')
    const buttons = page.getByTestId('lang-th')
    let visibleButton = -1
    for (let index = 0; index < await buttons.count(); index += 1) {
      if (await buttons.nth(index).isVisible()) {
        visibleButton = index
        break
      }
    }
    expect(visibleButton).toBeGreaterThanOrEqual(0)
    await buttons.nth(visibleButton).focus()
    await page.keyboard.press('Enter')

    await expect(page).toHaveURL(/\/courses\?lang=th(?:&|$)/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ตัวอย่างคอร์ส')
    await expect(page.getByRole('heading', { level: 1, name: /Stop relearning/ })).toHaveCount(0)
  })

  test('a canonical Thai course declares Thai before JavaScript runs', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false })
    const page = await context.newPage()
    await page.goto(coursePath('th'))
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('พื้นฐานระบบปฏิบัติการ')
    await context.close()
  })

  test('signed-out visitors inspect the syllabus without requesting progress', async ({ page }) => {
    let authRequests = 0
    let progressRequests = 0
    let skillMapRequests = 0
    await page.route('**/api/auth/me', async (route) => {
      authRequests += 1
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ signedIn: false }) })
    })
    await page.route('**/api/progress?**', async (route) => {
      progressRequests += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })
    await page.route('**/api/courses/**/skill-map?**', async (route) => {
      skillMapRequests += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })

    await page.goto(COURSE_PATH)
    await expect(page.getByTestId('public-course-syllabus')).toBeVisible()
    // Header และ CourseExperience ต่างตรวจ account state ได้; contract ของหน้านี้
    // คือไม่มี request อื่นไปยัง progress ก่อนมี signedIn:true ไม่ใช่จำนวน auth call.
    await expect.poll(() => authRequests).toBeGreaterThan(0)
    await page.waitForTimeout(150)
    expect(progressRequests).toBe(0)
    expect(skillMapRequests).toBe(0)
  })

  test('an auth transport failure stays on the public syllabus and never requests progress', async ({ page }) => {
    let progressRequests = 0
    let skillMapRequests = 0
    await page.route('**/api/auth/me', (route) => route.abort('failed'))
    await page.route('**/api/progress?**', async (route) => {
      progressRequests += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })
    await page.route('**/api/courses/**/skill-map?**', async (route) => {
      skillMapRequests += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })

    await page.goto(COURSE_PATH)
    await expect(page.getByTestId('public-course-syllabus')).toBeVisible()
    await page.waitForTimeout(150)
    expect(progressRequests).toBe(0)
    expect(skillMapRequests).toBe(0)
  })

  test('a signed-in learner loads the existing overview before requesting progress', async ({ page }) => {
    let authSettled = false
    let progressRequests = 0
    let skillMapRequests = 0
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ signedIn: true, email: 'learner@example.test' }),
      })
      authSettled = true
    })
    await page.route('**/api/progress?**', async (route) => {
      progressRequests += 1
      expect(authSettled).toBe(true)
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, record: EMPTY_RECORD }) })
    })
    await page.route('**/api/courses/**/skill-map?**', async (route) => {
      skillMapRequests += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })

    await page.goto(COURSE_PATH)
    await expect(page.getByTestId('course-progress-content')).toBeVisible()
    expect(progressRequests).toBe(1)
    expect(skillMapRequests).toBe(0)
    await page.locator('a[data-testid="lang-th"]').click()
    await expect(page).toHaveURL(/\/courses\/basic-os-linux\/th$/)
  })

  test('a signed-in Thai learner keeps the overview, roadmap, and reset flow in Thai', async ({ page }) => {
    await page.route('**/api/auth/me', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ signedIn: true, email: 'learner@example.test' }),
      })
    })
    await page.route('**/api/progress?**', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          record: {
            ...EMPTY_RECORD,
            completed: ['os-what-it-does'],
            updatedAt: 1,
          },
        }),
      })
    })
    await page.route('**/api/courses/**/skill-map?**', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false }),
      })
    })

    await page.goto(coursePath('th'))
    await expect(page.getByTestId('course-progress-content')).toBeVisible()
    await expect(page.getByTestId('start-or-continue')).toHaveText('เรียนต่อ')
    await expect(page.getByRole('heading', { name: 'เส้นทางการเรียนของคุณ' })).toBeVisible()
    await expect(page.getByTestId('node-os-what-it-does')).toContainText('เรียนจบ')
    await expect.poll(() => page.getByTestId('roadmap-graph').evaluate((graph) => {
      const scroller = graph.parentElement
      return Boolean(scroller && scroller.scrollWidth <= scroller.clientWidth)
    })).toBe(true)

    await page.getByTestId('reset-course').click()
    await expect(page.getByRole('dialog')).toContainText('เริ่มความคืบหน้าคอร์สใหม่?')
    await expect(page.getByTestId('reset-cancel')).toHaveText('เก็บความคืบหน้าไว้')
    await expect(page.getByTestId('reset-confirm')).toHaveText('ล้างความคืบหน้าคอร์ส')
    await expect(page.getByRole('dialog')).not.toContainText('Reset course progress')
  })

  test('the course locale keeps the chrome and language toggle on the same route', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'academy.lang',
        value: 'en',
        url: 'http://127.0.0.1:61001',
      },
    ])
    await page.goto(`${coursePath('th')}?utm_source=locale-test#roadmap-heading`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('banner').getByRole('link', { name: 'คอร์สของฉัน' })).toBeVisible()
    await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('เปลี่ยนเป็นโหมดมืด')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('พื้นฐานระบบปฏิบัติการ')

    await page.locator('[data-testid="lang-en"]:visible').click()
    await expect(page).toHaveURL(/\/courses\/basic-os-linux\/en\?utm_source=locale-test#roadmap-heading$/)
    await expect(page.getByRole('banner').getByRole('link', { name: 'My learning' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Basic OS & Linux')
  })

  test('the saved dark theme survives reload and route navigation', async ({ page }) => {
    await page.goto(COURSE_PATH)
    await page.getByTestId('theme-toggle').click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to light theme')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByTestId('theme-toggle')).toHaveAccessibleName('Switch to light theme')

    await page.goto(`${CATALOG_PATH}?lang=en`)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })

  test('the Thai syllabus action stays in the localized course journey', async ({ page }) => {
    await page.goto(coursePath('th'))
    const action = page.getByRole('link', { name: 'ดูตัวอย่างคอร์สทั้งหมด' })
    await expect(action).toHaveAttribute('href', '/courses?lang=th')
    await action.click()

    await expect(page).toHaveURL(/\/courses\?lang=th$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ตัวอย่างคอร์ส')
  })

  test('a syllabus language link also updates the shared chrome', async ({ page }) => {
    await page.goto(`${COURSE_PATH}?utm_source=syllabus-test#roadmap-heading`)
    await page.getByRole('link', { name: 'View this syllabus in Thai' }).click()

    await expect(page).toHaveURL(/\/courses\/basic-os-linux\/th\?utm_source=syllabus-test#roadmap-heading$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('banner').getByRole('link', { name: 'คอร์สของฉัน' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('พื้นฐานระบบปฏิบัติการ')
  })

  test('a legacy course URL redirects to its default canonical locale regardless of saved UI state', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'academy.lang',
        value: 'th',
        url: 'http://127.0.0.1:61001',
      },
    ])
    await page.goto(LEGACY_COURSE_PATH)

    await expect(page).toHaveURL(/\/courses\/basic-os-linux\/en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('banner').getByRole('link', { name: 'My learning' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Basic OS & Linux')
  })

  test('legacy locale URLs redirect to the served path while preserving tracking query and anchor', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'academy.lang',
        value: 'th',
        url: 'http://127.0.0.1:61001',
      },
    ])
    const legacy = `${LEGACY_COURSE_PATH}?lang=th&utm_source=locale-test#roadmap-heading`
    const response = await page.request.get(legacy, { maxRedirects: 0 })
    expect(response.status()).toBe(308)
    expect(response.headers().location).toBe(`${coursePath('th')}?utm_source=locale-test`)
    await page.goto(legacy)

    await expect(page).toHaveURL(/\/courses\/basic-os-linux\/th\?utm_source=locale-test#roadmap-heading$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('banner').getByRole('link', { name: 'คอร์สของฉัน' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('พื้นฐานระบบปฏิบัติการ')
  })

  test('localized metadata points to a public static PNG for the served course locale', async ({ page }) => {
    await page.goto(coursePath('th'))
    const imageUrl = await page.locator('meta[property="og:image"]').getAttribute('content')
    expect(imageUrl).toContain(`${LEGACY_COURSE_PATH}/share/th`)
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', expect.stringContaining(coursePath('th')))

    const thaiImage = await page.request.get(`${LEGACY_COURSE_PATH}/share/th`)
    const englishImage = await page.request.get(`${LEGACY_COURSE_PATH}/share/en`)
    expect(thaiImage.status()).toBe(200)
    expect(thaiImage.headers()['content-type']).toContain('image/png')
    expect(englishImage.status()).toBe(200)
    expect(englishImage.headers()['content-type']).toContain('image/png')

    const [thaiBody, englishBody] = await Promise.all([thaiImage.body(), englishImage.body()])
    expect(thaiBody.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(englishBody.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(thaiBody.equals(englishBody)).toBe(false)

    const unsupportedImage = await page.request.get(`${LEGACY_COURSE_PATH}/share/de`, { maxRedirects: 0 })
    expect(unsupportedImage.status()).toBe(404)
    const unsupportedLocale = await page.request.get(`${LEGACY_COURSE_PATH}/de`, { maxRedirects: 0 })
    expect(unsupportedLocale.status()).toBe(404)
    const learnerOverview = await page.request.get(`${LEGACY_COURSE_PATH}/learn?lang=th`, { maxRedirects: 0 })
    expect(learnerOverview.status()).toBe(307)
    expect(learnerOverview.headers().location).toBe('/sign-in')
  })

  test('the Thai catalog keeps its locale when a visitor opens the public course', async ({ page, context }) => {
    let progressRequests = 0
    await context.addCookies([
      {
        name: 'academy.lang',
        value: 'en',
        url: 'http://127.0.0.1:61001',
      },
    ])
    await page.route('**/api/progress?**', async (route) => {
      progressRequests += 1
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ ok: false }) })
    })

    await page.goto(`${CATALOG_PATH}?lang=th`)
    await expect(page.locator('html')).toHaveAttribute('lang', 'th')
    await expect(page.getByRole('navigation', { name: 'เมนูหลัก' })).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('ตัวอย่างคอร์ส')
    const card = page.getByTestId('catalogue-card-basic-os-linux')
    await expect(card).toHaveAttribute('href', coursePath('th'))
    await expect(card).toContainText('พื้นฐานระบบปฏิบัติการ')
    await page.waitForTimeout(150)
    expect(progressRequests).toBe(0)

    await card.click()
    await expect(page).toHaveURL(/\/courses\/basic-os-linux\/th$/)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('พื้นฐานระบบปฏิบัติการ')
  })

  test('catalog visitors can search and filter courses from accessible controls', async ({ page }) => {
    await page.goto(`${CATALOG_PATH}?lang=en`)
    const filters = page.getByRole('region', { name: 'Search courses' })
    const search = filters.getByLabel('Search courses')
    const allLevels = filters.getByRole('radio', { name: 'All levels' })
    const beginner = filters.getByRole('radio', { name: 'Beginner' })
    const intermediate = filters.getByRole('radio', { name: 'Intermediate' })
    const intermediateControl = filters.getByText('Intermediate', { exact: true })
    const resultCount = filters.getByRole('status')
    const card = page.getByTestId('catalogue-card-basic-os-linux')

    await expect(allLevels).toBeChecked()
    await allLevels.focus()
    await page.keyboard.press('ArrowDown')
    await expect(beginner).toBeChecked()
    await search.fill('  Linux  ')
    await expect(resultCount).toHaveText('1 course')
    await expect(card).toBeVisible()

    await intermediateControl.click()
    await expect(intermediate).toBeChecked()
    await expect(resultCount).toHaveText('0 courses')
    await expect(card).toBeHidden()
    await expect(page.getByRole('heading', { name: 'No matching courses' })).toBeVisible()
    await page.getByRole('button', { name: 'Clear search and level filters' }).click()

    await expect(search).toHaveValue('')
    await expect(allLevels).toBeChecked()
    await expect(card).toBeVisible()
    await expect(resultCount).not.toHaveText('0 courses')
  })

  test('catalog controls remain usable and stable on responsive layouts', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'The layout check is specific to the mobile profile')
    await page.setViewportSize({ width: 412, height: 892 })
    await page.goto(`${CATALOG_PATH}?lang=en`)
    const filters = page.getByRole('region', { name: 'Search courses' })
    const levelControlGroup = page.getByTestId('level-filter-controls')
    const levelControls = levelControlGroup.locator('label')
    const levelControlButtons = levelControls.locator('span')
    const languageToggleSlot = page.getByTestId('catalog-language-toggle-slot')
    const languageToggle = languageToggleSlot.getByTestId('language-toggle')

    await expect(filters.getByLabel('Search courses')).toBeVisible()
    await expect(filters.getByRole('radio', { name: 'All levels' })).toBeVisible()
    await expect(filters.getByRole('radio', { name: 'Beginner' })).toBeVisible()
    await expect(levelControls).toHaveCount(4)

    const mobileLevelBoxes = await levelControls.evaluateAll((controls) =>
      controls.map((control) => {
        const box = control.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width }
      }),
    )
    const [allLevels, beginner, intermediate, advanced] = mobileLevelBoxes
    expect(await levelControlGroup.evaluate((element) => getComputedStyle(element).display)).toBe('grid')
    expect(Math.max(...mobileLevelBoxes.map((box) => box.width)) - Math.min(...mobileLevelBoxes.map((box) => box.width))).toBeLessThanOrEqual(1)
    const mobileLevelButtonBoxes = await levelControlButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().width),
    )
    expect(Math.max(...mobileLevelButtonBoxes) - Math.min(...mobileLevelButtonBoxes)).toBeLessThanOrEqual(1)
    expect(mobileLevelBoxes.every((box, index) => Math.abs(box.width - mobileLevelButtonBoxes[index]) <= 1)).toBe(true)
    expect(beginner.y - allLevels.y).toBeLessThanOrEqual(1)
    expect(intermediate.x - allLevels.x).toBeLessThanOrEqual(1)
    expect(intermediate.y - allLevels.y).toBeGreaterThan(1)
    expect(advanced.x - beginner.x).toBeLessThanOrEqual(1)
    expect(advanced.y - intermediate.y).toBeLessThanOrEqual(1)

    await expect(languageToggle).toBeVisible()
    expect(await languageToggle.evaluate((element) => getComputedStyle(element).display)).toBe('inline-flex')
    const languageToggleSlotBox = await languageToggleSlot.boundingBox()
    const languageToggleButtonBox = await languageToggle.boundingBox()
    expect(languageToggleButtonBox?.width ?? 0).toBeLessThan((languageToggleSlotBox?.width ?? 0) - 20)
    expect((languageToggleButtonBox?.x ?? 0) + (languageToggleButtonBox?.width ?? 0)).toBeLessThan(
      (languageToggleSlotBox?.x ?? 0) + (languageToggleSlotBox?.width ?? 0) - 20,
    )

    await filters.getByLabel('Search courses').fill('Linux')
    await filters.getByText('Beginner', { exact: true }).click()
    await expect(filters.getByRole('radio', { name: 'Beginner' })).toBeChecked()
    await expect(page.getByTestId('catalogue-card-basic-os-linux')).toBeVisible()
    await expect(filters.getByRole('status')).toHaveText('1 course')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await page.setViewportSize({ width: 700, height: 840 })
    const compactLevelBoxes = await levelControls.evaluateAll((controls) =>
      controls.map((control) => {
        const box = control.getBoundingClientRect()
        return { x: box.x, y: box.y }
      }),
    )
    expect(await levelControlGroup.evaluate((element) => getComputedStyle(element).display)).toBe('flex')
    expect(Math.max(...compactLevelBoxes.map((box) => box.y)) - Math.min(...compactLevelBoxes.map((box) => box.y))).toBeLessThanOrEqual(1)

    await page.setViewportSize({ width: 412, height: 892 })
    await page.goto(`${CATALOG_PATH}?lang=th`)
    await expect(levelControls).toHaveCount(4)
    expect(await levelControlGroup.evaluate((element) => getComputedStyle(element).display)).toBe('grid')
    expect(
      await levelControls.evaluateAll((controls) =>
        Math.max(...controls.map((control) => control.scrollWidth - control.clientWidth)),
      ),
    ).toBeLessThanOrEqual(1)
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  })

  test('the catalog language control preserves query and anchor state', async ({ page }) => {
    await page.goto(`${CATALOG_PATH}?lang=th&utm_source=locale-test#main`)
    await page.locator('[data-testid="lang-en"]:visible').first().click()

    await expect(page).toHaveURL(/\/courses\?lang=en&utm_source=locale-test#main$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Course previews')
    await expect(page.getByTestId('catalogue-card-basic-os-linux')).toHaveAttribute('href', coursePath('en'))
  })

  test('an unsupported or duplicate catalog locale normalizes instead of inheriting a saved locale', async ({ page, context }) => {
    await context.addCookies([
      {
        name: 'academy.lang',
        value: 'th',
        url: 'http://127.0.0.1:61001',
      },
    ])
    await page.goto(`${CATALOG_PATH}?lang=th&lang=de`)

    await expect(page).toHaveURL(/\/courses\?lang=en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Course previews')
  })
})
