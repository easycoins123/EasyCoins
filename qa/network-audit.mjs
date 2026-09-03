/**
 * Network audit.
 *
 * Loads every customer route in a real browser at a phone and a desktop width
 * and records each request the page makes. Every request must be same-origin
 * or to an allow-listed host (the two Google Fonts hosts). Anything else is a
 * failure: an asset we do not own, a tracker, or a leak. Prohibited FC/FUT and
 * EA hosts are reported by name so the failure is unambiguous.
 *
 * Also reports the image weight loaded for the home page's first screen, against
 * the 150 KB target in the design brief.
 *
 *   node qa/network-audit.mjs [port]
 */
import { chromium } from '@playwright/test';
import { startServer } from './serve.mjs';

const PORT = Number(process.argv[2] ?? 4366);
const BASE = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const ROUTES = [
  '/', '/store', '/products/ea-fc-ultimate-team-coins', '/cart', '/checkout', '/account',
  '/account/orders', '/support', '/faq', '/deals', '/delivery', '/about', '/terms',
];
const WIDTHS = [390, 1440];
const ALLOWED_HOSTS = new Set([`localhost:${PORT}`, 'fonts.googleapis.com', 'fonts.gstatic.com']);
const PROHIBITED = [/fut\.gg/i, /futbin/i, /futwiz/i, /sofifa/i, /easports\.com/i, /\bea\.com/i, /futdb\.app/i];

const browser = await chromium.launch();
const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''));
};

for (const width of WIDTHS) {
  console.log(`\n== ${width}px ==`);
  const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 } });
  for (const route of ROUTES) {
    const page = await context.newPage();
    const requests = [];
    const imageBytes = [];
    page.on('request', (request) => requests.push(request));
    page.on('response', async (response) => {
      if (response.request().resourceType() !== 'image') return;
      try {
        const body = await response.body();
        imageBytes.push({ url: response.url(), bytes: body.length });
      } catch { /* aborted or from cache */ }
    });
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);

    const foreign = requests
      .map((request) => new URL(request.url()))
      .filter((url) => !ALLOWED_HOSTS.has(url.host) && url.protocol !== 'data:' && url.protocol !== 'blob:')
      .map((url) => url.host);
    const prohibited = requests
      .map((request) => request.url())
      .filter((url) => PROHIBITED.some((pattern) => pattern.test(url)));
    const images = requests.filter((request) => request.resourceType() === 'image');
    const foreignImages = images.filter((request) => !ALLOWED_HOSTS.has(new URL(request.url()).host));

    check(`${route}: every request stays on the origin or an allow-listed font host`, foreign.length === 0,
      foreign.length ? [...new Set(foreign)].join(', ') : `${requests.length} requests`);
    check(`${route}: no request to a prohibited asset host`, prohibited.length === 0, prohibited.join(', '));
    check(`${route}: every image is a same-origin EasyCoins asset`, foreignImages.length === 0,
      `${images.length} image request${images.length === 1 ? '' : 's'}`);

    if (route === '/' ) {
      const total = imageBytes.reduce((sum, entry) => sum + entry.bytes, 0);
      check(`home: image weight loaded stays under 150 KB`, total <= 150 * 1024, `${(total / 1024).toFixed(1)} KB`);
    }
    await page.close();
  }
  await context.close();
}

await browser.close();
server.close();

console.log(`\n${checks - failures.length}/${checks} checks passed`);
if (failures.length > 0) {
  console.log('Failures:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exit(1);
}
