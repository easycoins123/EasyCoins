/** Visual inspection: renders key screens at real widths and saves PNGs. */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const PORT = Number(process.argv[2] ?? 4399);
const OUT = 'qa/screenshots/easycoins';
mkdirSync(OUT, { recursive: true });

const server = await startServer(PORT);
const browser = await chromium.launch();

const WIDTHS = [
  { name: 'mobile-360', width: 360, height: 780 },
  { name: 'desktop-1440', width: 1440, height: 960 },
];

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'store', path: '/store' },
  { name: 'product', path: '/products/fc27-coins' },
  { name: 'deals', path: '/deals' },
  { name: 'support', path: '/support' },
];

const issues = [];

for (const vp of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: 'he-IL' });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => issues.push(`${vp.name} pageerror: ${e.message}`));

  for (const target of PAGES) {
    await page.goto(`http://localhost:${PORT}${target.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    // Horizontal overflow is the classic responsive failure; measure it.
    const overflow = await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) issues.push(`${target.name} @ ${vp.name}: overflows by ${overflow}px`);

    await page.screenshot({ path: `${OUT}/${target.name}-${vp.name}.png`, fullPage: true });
  }
  await ctx.close();
}

await browser.close();
server.close();

console.log(issues.length ? 'ISSUES:\n' + issues.join('\n') : 'No overflow or page errors at any width.');
