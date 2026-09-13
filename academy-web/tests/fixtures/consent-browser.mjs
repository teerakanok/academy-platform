import { chromium, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { writeFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
const output = process.argv[2]
if (!output || !isAbsolute(output)) throw new Error('Owned absolute evidence directory required')
const browser = await chromium.launch({ headless: true })
const results = []
const base = 'http://127.0.0.1:4187/tests/fixtures/consent-ui.html'
const entry = (type, status, revision) => ({ type, status, revision, documentVersion: 'v1',
  grantedAt: status === 'not_granted' ? null : '2026-09-13T12:00:00.000Z',
  withdrawnAt: status === 'withdrawn' ? '2026-09-13T13:00:00.000Z' : null })
try {
  for (const lang of ['th', 'en']) for (const theme of ['light', 'dark']) for (const width of [390, 1365]) {
    const key = `${lang}-${theme}-${width}`
    const context = await browser.newContext({ viewport: { width, height: 920 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []; page.on('pageerror', error => errors.push(error.message))
    let mode = 'ready'; let mutations = 0; const requests = []
    let state = { version: 1, consents: [entry('research_statistics', 'granted', '42'), entry('marketing_email', 'not_granted', '0')] }
    await page.route('**/api/account/consents/**', async route => {
      if (mode === 'loading') return
      if (mode === 'error') return route.fulfill({ status: 503, json: { error: 'consent_unavailable' } })
      if (route.request().url().endsWith('/withdraw')) {
        requests.push(route.request().postDataJSON()); mutations++
        if (mutations === 1) return route.abort()
        if (mutations === 2) {
          state = { ...state, consents: [entry('research_statistics', 'granted', '44'), state.consents[1]] }
          return route.fulfill({ status: 409, json: { error: 'consent_revision_conflict', state } })
        }
        state = { ...state, consents: [entry('research_statistics', 'withdrawn', '45'), state.consents[1]] }
      }
      return route.fulfill({ status: 200, json: state })
    })
    await page.goto(`${base}?lang=${lang}&theme=${theme}`)
    await expect(page.getByTestId('consent-status-research_statistics')).toHaveText(lang === 'th' ? 'ยินยอม' : 'Granted')
    await expect(page.getByTestId('consent-status-marketing_email')).toHaveText(lang === 'th' ? 'ยังไม่ได้ยินยอม' : 'Not granted')
    await expect(page.getByRole('link', { name: lang === 'th' ? 'อ่านประกาศความเป็นส่วนตัว' : 'Read the privacy notice' }))
      .toHaveAttribute('href', `https://accounts.cyberskills.co.th/legal/privacy-notice?lang=${lang}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(axe.violations).toEqual([])
    await page.screenshot({ path: join(output, `${key}-ready.png`), fullPage: true })
    await page.getByRole('button', { name: lang === 'th' ? 'ถอนความยินยอม' : 'Withdraw consent', exact: true }).click()
    await page.getByRole('button', { name: lang === 'th' ? 'ยืนยันการถอน' : 'Confirm withdrawal', exact: true }).click()
    await expect(page.getByRole('button', { name: lang === 'th' ? 'ลองคำขอเดิมอีกครั้ง' : 'Retry the same request' })).toBeVisible()
    await expect(page.getByTestId('consent-status-research_statistics')).toHaveText(lang === 'th' ? 'ยังตรวจสอบสถานะไม่ได้' : 'Status not yet verified')
    await page.screenshot({ path: join(output, `${key}-uncertain.png`), fullPage: true })
    await page.getByRole('button', { name: lang === 'th' ? 'ลองคำขอเดิมอีกครั้ง' : 'Retry the same request' }).click()
    await expect(page.getByRole('status')).toContainText(lang === 'th' ? 'สถานะเปลี่ยนไปแล้ว' : 'Your consent changed')
    expect(requests[1]).toEqual(requests[0]); expect(mutations).toBe(2)
    await page.screenshot({ path: join(output, `${key}-conflict.png`), fullPage: true })
    await page.getByRole('button', { name: lang === 'th' ? 'ถอนความยินยอม' : 'Withdraw consent', exact: true }).click()
    await page.getByRole('button', { name: lang === 'th' ? 'ยืนยันการถอน' : 'Confirm withdrawal', exact: true }).click()
    await expect(page.getByTestId('consent-status-research_statistics')).toHaveText(lang === 'th' ? 'ถอนแล้ว' : 'Withdrawn')
    expect(requests[2].expectedRevision).toBe('44'); expect(requests[2].operationId).not.toBe(requests[1].operationId)
    await page.reload()
    await expect(page.getByTestId('consent-status-research_statistics')).toHaveText(lang === 'th' ? 'ถอนแล้ว' : 'Withdrawn')
    await page.screenshot({ path: join(output, `${key}-withdrawn-reload.png`), fullPage: true })
    mode = 'error'; await page.reload()
    await expect(page.getByRole('status')).toContainText(lang === 'th' ? 'ติดต่อระบบความยินยอมไม่ได้' : 'The consent service is unavailable')
    await expect(page.getByTestId('consent-status-marketing_email')).toHaveText(lang === 'th' ? 'ยังตรวจสอบสถานะไม่ได้' : 'Status not yet verified')
    await page.screenshot({ path: join(output, `${key}-unavailable.png`), fullPage: true })
    mode = 'loading'; await page.reload()
    await expect(page.getByRole('status')).toContainText(lang === 'th' ? 'กำลังตรวจสอบความยินยอม' : 'Checking your consent')
    await page.screenshot({ path: join(output, `${key}-loading.png`), fullPage: true })
    expect(errors).toEqual([])
    results.push({ lang, theme, width, axeViolations: 0, overflow: false, stableRetry: true, conflictNotRebased: true, reloadState: true, errorUnknown: true, pageErrors: errors })
    await context.close()
  }
  writeFileSync(join(output, 'browser-results.json'), JSON.stringify({ status: 'PASS', fixture: 'synthetic; no authenticated owner acceptance', results }, null, 2))
  console.log(JSON.stringify({ status: 'PASS', cases: results.length, screenshots: results.length * 6 }))
} finally { await browser.close() }
