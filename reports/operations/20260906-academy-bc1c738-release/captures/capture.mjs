import { chromium } from '/private/tmp/identity-ui-ports-cde63a58/node_modules/@playwright/test/index.mjs';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = '/private/tmp/academy-bc1c738-production-captures-cde63a58';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [product, origin] of [['academy','https://academy.cyberskills.co.th']]) {
    for (const [size, viewport] of [['desktop',{width:1440,height:900}],['mobile',{width:390,height:844}]]) {
      const context = await browser.newContext({ viewport, colorScheme: 'light' });
      const page = await context.newPage();
      try {
        const response = await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 20_000 });
        await page.waitForTimeout(1200);
        const screenshot = `${product}-${size}.png`;
        const bytes = await page.screenshot({ path: `${root}/${screenshot}`, fullPage: false });
        const url = new URL(page.url());
        // No cookies, headers, query strings, storage or credential-bearing console output.
        const record = { product, viewport, httpStatus: response?.status(), finalOrigin:url.origin,
          finalPath:url.pathname, screenshot, sha256:createHash('sha256').update(bytes).digest('hex'),
          layout:await page.evaluate(() => ({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth })) };
        results.push(record); console.log(JSON.stringify(record));
      } catch { results.push({product,viewport,status:'CAPTURE_FAILED'}); }
      finally { await context.close(); }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${root}/receipt.json`, JSON.stringify({observedAt:new Date().toISOString(),mode:'isolated-public-no-auth-no-mutations',results},null,2));
}
