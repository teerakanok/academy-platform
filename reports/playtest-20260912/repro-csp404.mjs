// Pinpoint CSP violation source on 404 page via SecurityPolicyViolationEvent.
import { chromium } from '/Users/teerakanok/Dev/continuations/academy-security-recovery-20260912-523a1d40/academy-web/node_modules/playwright/index.mjs'

const BASE = 'https://academy.cyberskills.co.th'
const browser = await chromium.launch()
for (const path of ['/courses/no-such-course', '/courses/assembly/xx', '/']) {
  for (let i = 0; i < 2; i++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()
    await page.addInitScript(() => {
      window.__cspViolations = []
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push({
          directive: e.directive,
          sourceFile: e.sourceFile,
          lineNumber: e.lineNumber,
          sample: e.sample?.slice(0, 120),
          disposition: e.disposition,
          blockedURI: e.blockedURI?.slice(0, 120),
          statusCode: e.statusCode,
        })
      })
    })
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 45000 })
    await page.waitForTimeout(1200)
    const violations = await page.evaluate(() => window.__cspViolations)
    console.log(`${path} #${i + 1}: ${JSON.stringify(violations)}`)
    await context.close()
  }
}
await browser.close()
