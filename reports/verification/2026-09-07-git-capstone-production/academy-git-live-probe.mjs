import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { publicCoursePagePaths } from '/private/tmp/academy-course-route-cde63a58/academy-web/scripts/public-course-page-paths.mjs';
const require = createRequire('/private/tmp/academy-course-route-cde63a58/academy-web/package.json');
const { chromium } = require('@playwright/test');
const mode = process.argv[2];
if (!['candidate', 'production'].includes(mode)) throw new Error('MODE_INVALID');
const root = '/private/tmp/cyberskills-prod-cde63a58/records';
const origin = 'https://academy.cyberskills.co.th';
const result = { checked_at: new Date().toISOString(), version_override: mode === 'candidate', checks: [], captures: [] };
let browser;
try {
  const credential = execFileSync('/opt/homebrew/bin/cloudflared', ['access', 'token', '--app', origin], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  if (!credential) throw new Error('ACCESS_UNAVAILABLE');
  const override = mode === 'candidate' ? { 'Cloudflare-Workers-Version-Overrides': 'cyberskills-academy="772b75a6-e06b-404b-a268-5dbb4ec24e86"' } : {};
  const paths = [['/', 200], ['/sign-in', 200], ['/robots.txt', 200], ...publicCoursePagePaths().map(p => [p, 200]), ['/courses/git-essentials/learn', 307], ['/courses/comptia-security-plus/en', 404]];
  for (const [path, expected] of paths) {
    const response = await fetch(origin + path, { headers: { ...override, Cookie: `CF_Authorization=${credential}` }, redirect: 'manual', signal: AbortSignal.timeout(20000) });
    result.checks.push({ path, status: response.status, pass: response.status === expected });
    await response.arrayBuffer();
  }
  const raw = await fetch('https://cyberskills-academy.songpon-te.workers.dev/', { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  result.checks.push({ surface: 'raw-host', status: raw.status, pass: raw.status === 404 });
  await raw.arrayBuffer();
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const [name, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport, extraHTTPHeaders: override });
    try {
      await context.addCookies([{ name: 'CF_Authorization', value: credential, url: origin, secure: true, httpOnly: true, sameSite: 'Lax' }]);
      const page = await context.newPage();
      const response = await page.goto(origin + '/courses/git-essentials/th', { waitUntil: 'networkidle', timeout: 60000 });
      const h1 = await page.locator('h1').innerText();
      const url = page.url();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      const pass = response?.status() === 200 && url === origin + '/courses/git-essentials/th' && h1.includes('Git') && !overflow;
      if (pass) await page.screenshot({ path: `${root}/academy-git-${mode}-${name}.png` });
      result.captures.push({ name, viewport, url, h1, status: response?.status(), overflow, pass });
    } finally { await context.close(); }
  }
} catch {
  result.failure = 'PROBE_FAILED';
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  result.pass = !result.failure && result.checks.length === 22 && result.captures.length === 2 && [...result.checks, ...result.captures].every(x => x.pass);
  if (!result.pass) process.exitCode = 1;
  writeFileSync(`${root}/academy-git-${mode}.json`, JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
