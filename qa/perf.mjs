/**
 * Performance probe.
 *
 * Measures what can be measured honestly on a local static server: bytes
 * transferred per route, largest-contentful-paint, layout shift, lazy-chunk
 * behaviour and duplicate requests for the same asset.
 *
 * Network timings here are not field data — they say nothing about a real
 * customer on 4G. They are useful for catching regressions in payload size and
 * for spotting duplicated work.
 */
import { chromium } from '@playwright/test';
import { readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './serve.mjs';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(9);
});

const PORT = Number(process.argv[2] ?? 4355);
const BASE = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const DIST = join(process.cwd(), 'dist', 'top-token');

console.log('== Build output ==');
const files = readdirSync(DIST).filter((name) => /\.(js|css)$/.test(name));
const totals = files.reduce((sum, name) => sum + statSync(join(DIST, name)).size, 0);
const initial = files
  .filter((name) => /^(main|polyfills|runtime|vendor|styles)\./.test(name))
  .map((name) => ({ name, size: statSync(join(DIST, name)).size }));
console.log(`  ${files.length} js/css files, ${(totals / 1024).toFixed(0)} kB total`);
for (const file of initial.sort((a, b) => b.size - a.size)) {
  console.log(`  initial: ${file.name} ${(file.size / 1024).toFixed(1)} kB`);
}
const assets = readdirSync(join(DIST, 'assets', 'products'));
const assetBytes = assets.reduce((sum, name) => sum + statSync(join(DIST, 'assets', 'products', name)).size, 0);
console.log(`  product art: ${assets.length} files, ${(assetBytes / 1024).toFixed(1)} kB total`);

const browser = await chromium.launch();
const routes = ['/', '/store', '/products/fc27-coins', '/cart', '/faq'];
const measurements = [];

console.log('\n== Per-route load ==');
for (const route of routes) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const requests = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.startsWith(BASE)) {
      requests.push({ url: url.replace(BASE, ''), status: response.status() });
    }
  });

  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);

  const metrics = await page.evaluate(() => new Promise((resolve) => {
    let lcp = 0;
    let cls = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) lcp = Math.max(lcp, entry.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) cls += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    } catch { /* not all entry types exist everywhere */ }

    setTimeout(() => {
      const resources = performance.getEntriesByType('resource');
      const bytes = resources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
      const paint = performance.getEntriesByName('first-contentful-paint')[0];
      resolve({
        lcpMs: Math.round(lcp),
        fcpMs: Math.round(paint?.startTime ?? 0),
        cls: Number(cls.toFixed(4)),
        transferKb: Math.round(bytes / 1024),
        resourceCount: resources.length,
      });
    }, 500);
  }));

  const duplicates = requests
    .map((r) => r.url)
    .filter((url, index, all) => all.indexOf(url) !== index);

  measurements.push({ route, ...metrics, duplicates: [...new Set(duplicates)] });
  console.log(`  ${route.padEnd(38)} FCP ${String(metrics.fcpMs).padStart(4)}ms  LCP ${String(metrics.lcpMs).padStart(4)}ms  CLS ${metrics.cls}  ${metrics.transferKb} kB  ${metrics.resourceCount} requests`);
  if (duplicates.length) {
    console.log(`    duplicate requests: ${[...new Set(duplicates)].join(', ')}`);
  }

  await context.close();
}

// Lazy loading: a deep route must not pull every page chunk.
console.log('\n== Lazy loading ==');
const context = await browser.newContext();
const page = await context.newPage();
const chunkUrls = [];
page.on('response', (response) => {
  if (/\.js$/.test(response.url())) chunkUrls.push(response.url().split('/').pop());
});
await page.goto(`${BASE}/faq`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const beforePreload = chunkUrls.length;
await page.waitForTimeout(2500); // PreloadAllModules pulls the rest in the background
console.log(`  /faq loaded ${beforePreload} js chunks on first paint, ${chunkUrls.length} after background preloading`);
await context.close();

await browser.close();
server.close();

mkdirSync('qa/out', { recursive: true });
writeFileSync('qa/out/perf.json', JSON.stringify({ initial, measurements }, null, 2));
