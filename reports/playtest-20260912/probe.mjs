// Production playtest probe 2026-09-12 — Academy recovery candidate 73ac223 / worker 73cc26e6.
// READ-ONLY: GET navigation + clicks on links only. No form submissions, no POSTs.
// Run from academy-web so playwright resolves from its node_modules.
import { chromium } from '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/academy-web/node_modules/playwright/index.mjs'
import fs from 'node:fs'

const BASE = 'https://academy.cyberskills.co.th'
const OUT = '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/reports/playtest-20260912'
const SHOTS = `${OUT}/screenshots`
fs.mkdirSync(SHOTS, { recursive: true })

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'mobile-390', width: 390, height: 844 },
]

const report = { pages: [], interactions: [], consoleIssues: [] }

async function newPage(browser, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.width === 390 ? 2 : 1,
    isMobile: viewport.width === 390,
    hasTouch: viewport.width === 390,
  })
  const page = await context.newPage()
  const issues = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') issues.push({ kind: 'console.error', text: msg.text().slice(0, 300) })
  })
  page.on('pageerror', (err) => issues.push({ kind: 'pageerror', text: String(err).slice(0, 300) }))
  page.on('requestfailed', (req) => {
    issues.push({ kind: 'requestfailed', url: req.url().slice(0, 200), error: String(req.failure()?.errorText) })
  })
  return { context, page, issues }
}

async function probePage(browser, viewport, cell) {
  const { context, page, issues } = await newPage(browser, viewport)
  const started = Date.now()
  const response = await page.goto(`${BASE}${cell.path}`, { waitUntil: 'networkidle', timeout: 45000 })
  let ready = null
  if (cell.ready) ready = await cell.ready(page)
  const shot = `${SHOTS}/${cell.name}--${viewport.name}.png`
  await page.screenshot({ path: shot, fullPage: cell.fullPage !== false })
  const entry = {
    cell: cell.name,
    viewport: viewport.name,
    path: cell.path,
    status: response?.status(),
    finalUrl: page.url(),
    title: await page.title(),
    htmlLang: await page.getAttribute('html', 'lang'),
    h1: (await page.locator('h1').allInnerTexts()).map((t) => t.trim().replace(/\s+/g, ' ')).slice(0, 3),
    ready: ready ?? '(none)',
    screenshot: shot,
    loadMs: Date.now() - started,
    issues: issues.slice(0, 10),
  }
  report.pages.push(entry)
  if (issues.length) report.consoleIssues.push({ cell: cell.name, viewport: viewport.name, issues: issues.slice(0, 10) })
  await context.close()
  return entry
}

const h1Visible = async (page) => {
  await page.locator('h1').first().waitFor({ state: 'visible', timeout: 15000 })
  return 'h1 visible'
}

const CELLS = [
  { name: '01-home', path: '/', ready: h1Visible },
  { name: '02-courses', path: '/courses', ready: h1Visible },
  { name: '03-course-assembly-en', path: '/courses/assembly/en', ready: async (page) => {
    await page.getByTestId('public-course-syllabus').waitFor({ state: 'visible', timeout: 15000 })
    return 'syllabus visible'
  } },
  { name: '04-course-assembly-th', path: '/courses/assembly/th', ready: async (page) => {
    await page.getByTestId('public-course-syllabus').waitFor({ state: 'visible', timeout: 15000 })
    return 'syllabus visible'
  } },
  { name: '05-course-linux-en', path: '/courses/basic-os-linux/en', ready: h1Visible },
  { name: '06-course-linux-th', path: '/courses/basic-os-linux/th', ready: h1Visible },
  { name: '07-sign-in', path: '/sign-in', ready: async (page) => {
    const email = page.locator('input[type="email"], input[name="email"]').first()
    await email.waitFor({ state: 'visible', timeout: 15000 })
    return `email input visible; submit buttons: ${await page.locator('button[type="submit"]').count()}`
  } },
  { name: '08-sign-in-notice', path: '/sign-in?notice=identity-unavailable', ready: async (page) => {
    await page.locator('[role="alert"]').first().waitFor({ state: 'visible', timeout: 15000 })
    return (await page.locator('[role="alert"]').first().innerText()).trim().slice(0, 120)
  } },
  { name: '09-privacy', path: '/privacy', ready: h1Visible },
  { name: '10-unsubscribe', path: '/unsubscribe', ready: h1Visible },
  { name: '11-app-404', path: '/courses/no-such-course', ready: async (page) => {
    const body = (await page.locator('body').innerText()).trim()
    return `body text: ${body.slice(0, 160) || '(EMPTY)'}`
  } },
  { name: '12-mw-404', path: '/courses/assembly/xx', ready: async (page) => {
    const body = (await page.locator('body').innerText()).trim()
    return `body text: ${body.slice(0, 160) || '(EMPTY)'}`
  } },
]

const browser = await chromium.launch()

// --- visual matrix: every cell x both viewports
for (const viewport of VIEWPORTS) {
  for (const cell of CELLS) {
    try {
      const e = await probePage(browser, viewport, cell)
      console.log(`[${viewport.name}] ${cell.name}: status=${e.status} title="${e.title}" h1=${JSON.stringify(e.h1)} ready="${e.ready}" issues=${e.issues.length}`)
    } catch (err) {
      report.pages.push({ cell: cell.name, viewport: viewport.name, path: cell.path, error: String(err).slice(0, 300) })
      console.log(`[${viewport.name}] ${cell.name}: ERROR ${String(err).slice(0, 200)}`)
    }
  }
}

// --- interactions (desktop + mobile): link clicks only
async function interaction(name, viewport, fn) {
  const { context, page, issues } = await newPage(browser, viewport)
  try {
    const result = await fn(page)
    report.interactions.push({ name, viewport, result, issues: issues.slice(0, 6) })
    console.log(`[interaction:${viewport.name}] ${name}: ${result}`)
  } catch (err) {
    report.interactions.push({ name, viewport, error: String(err).slice(0, 300) })
    console.log(`[interaction:${viewport.name}] ${name}: ERROR ${String(err).slice(0, 200)}`)
  }
  await context.close()
}

// I1: home -> courses via nav link
for (const v of VIEWPORTS) {
  await interaction('nav-home-to-courses', v, async (page) => {
    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
    const link = page.locator('a[href="/courses"]').first()
    await link.click()
    await page.waitForURL('**/courses', { timeout: 20000 })
    await page.locator('h1').first().waitFor({ state: 'visible' })
    await page.screenshot({ path: `${SHOTS}/I1-nav-courses--${v.name}.png` })
    const cards = await page.locator('a[href^="/courses/"]').count()
    return `landed=${page.url()} courseLinksOnPage=${cards}`
  })
}

// I2: course EN -> TH via language switch
await interaction('course-lang-en-to-th', VIEWPORTS[0], async (page) => {
  await page.goto(`${BASE}/courses/assembly/en`, { waitUntil: 'networkidle' })
  const thLink = page.locator('a[href="/courses/assembly/th"]').first()
  await thLink.click()
  await page.waitForURL('**/courses/assembly/th', { timeout: 20000 })
  await page.getByTestId('public-course-syllabus').waitFor({ state: 'visible' })
  await page.screenshot({ path: `${SHOTS}/I2-lang-switch-th--desktop-1440.png` })
  const htmlLang = await page.getAttribute('html', 'lang')
  const h1 = (await page.locator('h1').first().innerText()).trim()
  return `finalUrl=${page.url()} htmlLang=${htmlLang} h1="${h1.slice(0, 80)}"`
})

// I3: mobile hamburger menu open (find toggle button on home at 390)
await interaction('mobile-menu-toggle', VIEWPORTS[1], async (page) => {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  const button = page.locator('button[aria-label], button[aria-expanded]').first()
  const before = await button.getAttribute('aria-expanded')
  if (!before) return 'no menu toggle button found (nav may be always visible)'
  await button.click()
  await page.waitForTimeout(400)
  const after = await button.getAttribute('aria-expanded')
  await page.screenshot({ path: `${SHOTS}/I3-mobile-menu--mobile-390.png` })
  const coursesVisible = await page.locator('a[href="/courses"]').first().isVisible()
  return `aria-expanded ${before} -> ${after}; courses link visible after: ${coursesVisible}`
})

// I4: locale-less course URL redirects to /en default
await interaction('course-locale-default-redirect', VIEWPORTS[0], async (page) => {
  await page.goto(`${BASE}/courses/assembly`, { waitUntil: 'networkidle' })
  return `finalUrl=${page.url()}`
})

// I5: app 404 page has a way back home
await interaction('app-404-recovery-link', VIEWPORTS[0], async (page) => {
  await page.goto(`${BASE}/courses/no-such-course`, { waitUntil: 'networkidle' })
  const home = page.locator('a[href="/"]').first()
  return `home link present=${await home.count() > 0} visible=${home.count() ? await home.first().isVisible() : false}`
})

// I6: sign-in form never submits during playtest — verify button present + disabled state contract
await interaction('sign-in-form-shape', VIEWPORTS[0], async (page) => {
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle' })
  const email = page.locator('input[type="email"], input[name="email"]').first()
  const emailVisible = await email.isVisible()
  const submits = await page.locator('button[type="submit"]').count()
  const forms = await page.locator('form').count()
  return `emailVisible=${emailVisible} forms=${forms} submitButtons=${submits} (no submission performed)`
})

// I7: private route from cold browser lands on sign-in with next param preserved
await interaction('private-route-redirect', VIEWPORTS[0], async (page) => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'networkidle' })
  await page.locator('h1').first().waitFor({ state: 'visible' })
  await page.screenshot({ path: `${SHOTS}/I7-dashboard-redirect--desktop-1440.png` })
  return `finalUrl=${page.url()}`
})

await browser.close()
fs.writeFileSync(`${OUT}/probe-results.json`, JSON.stringify(report, null, 2))
console.log(`\nwrote ${OUT}/probe-results.json; screenshots in ${SHOTS}`)
