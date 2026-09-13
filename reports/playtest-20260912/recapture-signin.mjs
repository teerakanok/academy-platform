// Re-capture sign-in cell with the Identity Control selector (SSO control page).
import { chromium } from '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/academy-web/node_modules/playwright/index.mjs'

const BASE = 'https://academy.cyberskills.co.th'
const SHOTS = '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/reports/playtest-20260912/screenshots'
const browser = await chromium.launch()
for (const vp of [
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
]) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
  })
  const page = await context.newPage()
  const issues = []
  page.on('pageerror', (e) => issues.push(String(e).slice(0, 80)))
  await page.goto(`${BASE}/sign-in`, { waitUntil: 'networkidle', timeout: 45000 })
  const control = page.getByTestId('identity-control-sign-in')
  const visible = await control.isVisible().catch(() => false)
  const continueBtn = page.getByTestId('identity-control-continue')
  const btnVisible = await continueBtn.isVisible().catch(() => false)
  const h1 = (await page.locator('h1').allInnerTexts()).join(' | ')
  await page.screenshot({ path: `${SHOTS}/07-sign-in--${vp.name}.png`, fullPage: true })
  console.log(`${vp.name}: identityControl=${visible} continueVisible=${btnVisible} h1="${h1}" pageerrors=${issues.length}`)
  await context.close()
}
await browser.close()
