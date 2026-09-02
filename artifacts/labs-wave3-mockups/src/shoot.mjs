// Render mockup HTMLs to PNG with the real Academy look (light theme, cs- tokens)
// Usage: node artifacts/labs-wave3-mockups/src/shoot.mjs   (playwright resolved from academy-web)
import { createRequire } from 'node:module'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire('/Users/teerakanok/Dev/cyberskills-director/products/cyberskills/academy-platform/academy-web/package.json')
const { chromium } = require('playwright')

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..')
const files = readdirSync(here).filter((f) => f.startsWith('mockup-') && f.endsWith('.html'))

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
for (const f of files) {
  await page.goto('file://' + join(here, f))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(500)
  const png = join(outDir, f.replace('.html', '.png'))
  await page.screenshot({ path: png, fullPage: true })
  console.log('rendered', png)
}
await browser.close()
