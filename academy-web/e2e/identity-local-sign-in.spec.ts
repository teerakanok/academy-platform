import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const ARTIFACT_DIRECTORY = join(process.cwd(), 'artifacts', 'identity-local-browser-flow-2026-08-11')

test.beforeAll(() => mkdirSync(ARTIFACT_DIRECTORY, { recursive: true }))

test('Academy sign-in returns from Account Center to an honest empty dashboard', async ({ page }, testInfo) => {
  const viewport = testInfo.project.name
  const consoleErrors: string[] = []
  const failedRequests: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('requestfailed', (request) => {
    failedRequests.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
  })

  await page.goto('/sign-in?next=%2Fdashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'One CYBERSKILLS account' })).toBeVisible()
  await expect(page.getByTestId('identity-control-sign-in')).toBeVisible()
  await page.screenshot({
    path: join(ARTIFACT_DIRECTORY, `academy-sign-in-${viewport}.png`),
    fullPage: true,
    animations: 'disabled',
  })

  await page.getByTestId('identity-control-continue').click()
  await expect(page).toHaveURL(/^http:\/\/localhost:5173\/sign-in\?/)
  await expect(page.getByRole('heading', { level: 1, name: 'CYBERSKILLS Account' })).toBeVisible()
  await expect(page.getByText('CyberSkills Academy', { exact: true })).toBeVisible()
  await expect(page.getByText('After verifying your email, you will return to CyberSkills Academy.')).toBeVisible()
  await page.screenshot({
    path: join(ARTIFACT_DIRECTORY, `account-center-email-${viewport}.png`),
    fullPage: true,
    animations: 'disabled',
  })

  await page.getByLabel('Email address').fill('learner@example.com')
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await expect(page.getByLabel('6-digit code')).toBeVisible()
  await expect(page.getByLabel('6-digit code')).toBeFocused()
  await page.getByRole('button', { name: 'Use a different email' }).click()
  await expect(page.getByLabel('Email address')).toBeFocused()
  await page.getByRole('button', { name: 'Email me a sign-in code' }).click()
  await expect(page.getByLabel('6-digit code')).toBeFocused()
  await page.screenshot({
    path: join(ARTIFACT_DIRECTORY, `account-center-code-${viewport}.png`),
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByLabel('6-digit code').fill('123456')
  await page.getByRole('button', { name: 'Continue', exact: true }).click()

  await expect(page).toHaveURL('http://localhost:3000/dashboard')
  await expect(page.getByRole('heading', { level: 1, name: 'Start something today' })).toBeVisible()
  await expect(page.getByTestId('dashboard-no-courses')).toHaveText(
    'No courses are included in your current enrollment.',
  )
  await expect(page.getByRole('link', { name: 'Browse available courses' })).toHaveAttribute('href', '/courses')
  await page.screenshot({
    path: join(ARTIFACT_DIRECTORY, `academy-dashboard-${viewport}.png`),
    fullPage: true,
    animations: 'disabled',
  })

  const account = await page.request.get('http://localhost:3000/api/auth/me')
  await expect(account.json()).resolves.toEqual({ signedIn: true, email: 'learner@example.com' })
  expect(consoleErrors).toEqual([])
  expect(failedRequests).toEqual([])
})

test('Account Center refuses a malformed Academy authorization instead of downgrading to fixture sign-in', async ({ page }) => {
  await page.goto(
    'http://localhost:5173/sign-in?client_id=academy-web-local&client_id=duplicate&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fcallback',
  )

  await expect(page.getByRole('alert')).toContainText('Sign-in is temporarily unavailable')
  await expect(page.getByLabel('Email address')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Start again' })).toHaveAttribute('href', '/sign-in')
})
