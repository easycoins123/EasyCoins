/**
 * Visual audit: the screens that sell, at every width the brief names.
 *
 * For each viewport it photographs the first screen (what a customer actually
 * sees before scrolling) and the full page, and for phone widths it also opens
 * the navigation drawer and the store's filter sheet, because those two
 * surfaces are where a mobile storefront most often falls apart.
 *
 * Alongside the pictures it records the mechanical failures a screenshot can
 * hide: horizontal overflow, console errors, failed requests and broken images.
 *
 * Run: node qa/visual-audit.mjs [widths, comma separated] [label]
 *   node qa/visual-audit.mjs                 # all nine widths
 *   node qa/visual-audit.mjs 360,1440 quick  # a subset
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

const WIDTHS = (process.argv[2] ?? '320,360,375,390,414,430,768,1024,1280,1440,1600,1920')
  .split(',').map((value) => Number(value.trim())).filter(Boolean);
const LABEL = process.argv[3] ?? 'audit';
const PORT = 4397;
const OUT = `qa/screenshots/${LABEL}`;
mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: 'home', path: '/' },
  { name: 'store', path: '/store' },
  { name: 'product', path: '/products/ea-fc-ultimate-team-coins' },
  { name: 'cart-empty', path: '/cart' },
  { name: 'support', path: '/support' },
];

const IGNORED = [/Angular is running in development mode/i, /favicon\.ico/i];

const server = await startServer(PORT);
const browser = await chromium.launch();
const findings = [];

for (const width of WIDTHS) {
  const height = width < 600 ? 800 : width < 1100 ? 1024 : 900;
  const context = await browser.newContext({ viewport: { width, height }, locale: 'he-IL' });
  const page = await context.newPage();
  const dir = `${OUT}/${width}`;
  mkdirSync(dir, { recursive: true });

  let current = '';
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    if (IGNORED.some((re) => re.test(msg.text()))) return;
    findings.push(`${width} ${current}: console ${msg.text().slice(0, 160)}`);
  });
  page.on('pageerror', (error) => findings.push(`${width} ${current}: pageerror ${error.message}`));
  page.on('requestfailed', (request) => findings.push(`${width} ${current}: failed ${request.url()}`));

  const measure = async (name) => {
    const result = await page.evaluate(() => {
      const doc = document.documentElement;
      const overflow = doc.scrollWidth - doc.clientWidth;
      const broken = [...document.images]
        .filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute('src'))
        .map((img) => img.getAttribute('src'));
      // Elements wider than the viewport, named so they can be found.
      const wide = [...document.querySelectorAll('body *')]
        .filter((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && (rect.right > doc.clientWidth + 1 || rect.left < -1);
        })
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`);
      return { overflow, broken, wide };
    });
    if (result.overflow > 1) findings.push(`${width} ${name}: overflow ${result.overflow}px (${result.wide.join(', ')})`);
    for (const src of result.broken) findings.push(`${width} ${name}: broken image ${src}`);
  };

  for (const target of PAGES) {
    current = target.name;
    await page.goto(`http://localhost:${PORT}${target.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600);
    await measure(target.name);
    await page.screenshot({ path: `${dir}/${target.name}-fold.png`, fullPage: false });
    await page.screenshot({ path: `${dir}/${target.name}-full.png`, fullPage: true });
  }

  // Phone-only surfaces.
  if (width <= 1000) {
    current = 'menu';
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
    const toggle = page.locator('button[aria-controls="tt-mobile-nav"]');
    if (await toggle.count()) {
      await toggle.click();
      await page.waitForTimeout(1100);
      await measure('menu-open');
      await page.screenshot({ path: `${dir}/menu-open.png`, fullPage: false });
      await page.keyboard.press('Escape');
    } else {
      findings.push(`${width}: no menu toggle found`);
    }

    current = 'filters';
    await page.goto(`http://localhost:${PORT}/store`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const open = page.locator('tt-filter-bar button', { hasText: 'סינון' }).first();
    if (await open.count() && await open.isVisible()) {
      await open.scrollIntoViewIfNeeded();
      await open.click();
      await page.waitForTimeout(500);
      await measure('filters-open');
      await page.screenshot({ path: `${dir}/filters-open.png`, fullPage: false });
    }
  }

  await context.close();
  console.log(`  ${width}px done`);
}

await browser.close();
server.close();

writeFileSync(`${OUT}/findings.json`, JSON.stringify(findings, null, 2));
console.log(findings.length ? `\nFINDINGS (${findings.length}):\n${findings.join('\n')}` : '\nNo overflow, console errors, failed requests or broken images.');
