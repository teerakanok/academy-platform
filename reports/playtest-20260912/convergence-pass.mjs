// Convergence pass after redeploy 4386a120 — visual + console sweep on public cells.
import { chromium } from '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/academy-web/node_modules/playwright/index.mjs'

const BASE = 'https://academy.cyberskills.co.th'
const SHOTS = '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/reports/playtest-20260912/screenshots'
const CELLS = [
  { name: 'conv-home', path: '/', ready: (p) => p.locator('h1').first().waitFor({ timeout: 15000 }) },
  { name: 'conv-courses', path: '/courses', ready: (p) => p.locator('h1').first().waitFor({ timeout: 15000 }) },
  { name: 'conv-course-en', path: '/courses/assembly/en', ready: (p) => p.getByTestId('public-course-syllabus').waitFor({ timeout: 15000 }) },
  { name: 'conv-course-th', path: '/courses/assembly/th', ready: (p) => p.getByTestId('public-course-syllabus').waitFor({ timeout: 15000 }) },
  { name: 'conv-sign-in', path: '/sign-in', ready: (p) => p.getByTestId('identity-control-sign-in').waitFor({ timeout: 15000 }) },
  { name: 'conv-privacy', path: '/privacy', ready: (p) => p.locator('h1').first().waitFor({ timeout: 15000 }) },
]

const browser = await chromium.launch()
let newFindings = 0
for (const vp of [
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
]) {
  for (const cell of CELLS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
    })
    const page = await context.newPage()
    const issues = []
    page.on('pageerror', (e) => issues.push('pageerror:' + String(e).slice(0, 60)))
    page.on('console', (m) => { if (m.type() === 'error') issues.push('console:' + m.text().slice(0, 80)) })
    try {
      const response = await page.goto(`${BASE}${cell.path}`, { waitUntil: 'networkidle', timeout: 45000 })
      await cell.ready(page)
      // favicon wiring: icon link must resolve (fixed-cell regression guard)
      if (cell.name === 'conv-home') {
        const iconHref = await page.locator('link[rel="icon"]').first().getAttribute('href')
        const iconResp = await page.request.get(`${BASE}${iconHref}`)
        if (iconResp.status() !== 200) { issues.push(`icon ${iconHref} -> ${iconResp.status()}`); newFindings++ }
        else console.log(`favicon: ${iconHref} -> ${iconResp.status()} ${iconResp.headers()['content-type']}`)
      }
      await page.screenshot({ path: `${SHOTS}/${cell.name}--${vp.name}.png`, fullPage: true })
      const flagged = issues.filter((i) => !i.startsWith('pageerror:Error: Minified React error #418')) // known flake D4, deferred
      if (flagged.length) newFindings++
      console.log(`${vp.name} ${cell.name}: status=${response.status()} issues=${issues.length ? issues.join(' | ') : 0}`)
    } catch (err) {
      newFindings++
      console.log(`${vp.name} ${cell.name}: ERROR ${String(err).slice(0, 160)}`)
    }
    await context.close()
  }
}
await browser.close()
console.log(`NEW_FINDINGS(excluding deferred D4 flake)=${newFindings}`)
