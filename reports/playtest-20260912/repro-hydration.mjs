// Bounded repro: does React #418 pageerror reproduce consistently per page/viewport?
import { chromium } from '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/academy-web/node_modules/playwright/index.mjs'

const BASE = 'https://academy.cyberskills.co.th'
const PAGES = ['/courses', '/privacy', '/sign-in?notice=identity-unavailable', '/', '/unsubscribe']
const VPS = [
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
  { name: 'mobile-390', width: 390, height: 844, mobile: true },
]

const browser = await chromium.launch()
for (const vp of VPS) {
  for (const path of PAGES) {
    const results = []
    for (let i = 0; i < 3; i++) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.mobile ? 2 : 1,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
      })
      const page = await context.newPage()
      const errs = []
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 90)))
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 })
      await page.waitForTimeout(1500)
      results.push(errs.length ? `ERR(${errs.map((e) => e.replace('Error: Minified React error #', '#').split(';')[0]).join(',')})` : 'clean')
      await context.close()
    }
    console.log(`${vp.name} ${path}: ${results.join(' | ')}`)
  }
}
await browser.close()
