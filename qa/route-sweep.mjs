/**
 * Route sweep — the browser QA harness.
 *
 * Loads every route in a real Chromium at several viewports and reports, per
 * route: console errors, failed network requests, blank screens, broken images,
 * horizontal overflow, document direction and unlabelled controls.
 *
 * Run with the dev server up:  node qa/route-sweep.mjs [baseUrl]
 */
import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(9);
});

const PORT = Number(process.argv[2] ?? 4321);
const BASE = `http://localhost:${PORT}`;
const server = await startServer(PORT);

/** Routes with the ids the seed data actually produces. */
const ROUTES = [
  ['/', 'home'],
  ['/store', 'store'],
  ['/games', 'games'],
  ['/games/ea-sports-fc', 'game-detail'],
  ['/games/playstation', 'game-detail-ps'],
  ['/products/fc27-coins', 'product-coins'],
  ['/products/playstation-store-gift-card', 'product-giftcard'],
  ['/products/playstation-plus', 'product-plus'],
  ['/products/fc27-coins/prod-fc27-coins__500k', 'product-variant-deeplink'],
  ['/cart', 'cart'],
  ['/checkout', 'checkout-empty-guard'],
  ['/account', 'account'],
  ['/account/orders', 'account-orders'],
  ['/support', 'support'],
  ['/contact', 'contact'],
  ['/faq', 'faq'],
  ['/reviews', 'reviews'],
  ['/deals', 'deals'],
  ['/about', 'about'],
  ['/terms', 'terms'],
  ['/privacy', 'privacy'],
  ['/refund-policy', 'refund-policy'],
  ['/accessibility', 'accessibility'],
  ['/this-route-does-not-exist', '404'],
];

const VIEWPORTS = [
  { name: 'mobile-375', width: 375, height: 812 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'laptop-1024', width: 1024, height: 768 },
  { name: 'desktop-1440', width: 1440, height: 900 },
];

/** Console noise that is expected and not a defect. */
const IGNORED_CONSOLE = [
  /Angular is running in development mode/i,
  /favicon\.ico/i,
];

async function auditPage(page, path) {
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  const onConsole = (msg) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if (IGNORED_CONSOLE.some((re) => re.test(text))) return;
    consoleErrors.push(`${msg.type()}: ${text}`);
  };
  const onPageError = (error) => pageErrors.push(String(error.message ?? error));
  const onRequestFailed = (request) => failedRequests.push(`${request.method()} ${request.url()}`);
  const onResponse = (response) => {
    if (response.status() >= 400 && !response.url().includes('favicon')) {
      failedRequests.push(`${response.status()} ${response.url()}`);
    }
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  page.on('response', onResponse);

  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  // Mock latency is ~220ms; give async content time to land.
  await page.waitForTimeout(700);

  const metrics = await page.evaluate(() => {
    const main = document.querySelector('main');
    const text = (main?.innerText ?? '').trim();
    const images = [...document.querySelectorAll('img')];
    const broken = images
      .filter((img) => img.complete && img.naturalWidth === 0)
      .map((img) => img.getAttribute('src') ?? '(no src)');
    const tiny = images
      .filter((img) => img.complete && img.naturalWidth > 0 && img.naturalWidth <= 2)
      .map((img) => img.getAttribute('src') ?? '(no src)');
    const noAlt = images.filter((img) => !img.hasAttribute('alt')).length;

    // Which element, if any, is wider than the viewport.
    const overflowing = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().width > window.innerWidth + 1)
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className?.toString().slice(0, 40)}`);

    const unlabelledControls = [...document.querySelectorAll('button, a, input, select, textarea')]
      .filter((el) => {
        const hasText = (el.innerText ?? '').trim().length > 0;
        const hasLabel = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
        const isLabelWrapped = el.closest('label') !== null;
        const hasLabelFor = el.id !== '' && document.querySelector(`label[for="${el.id}"]`) !== null;
        const hasTitle = el.hasAttribute('title');
        return !hasText && !hasLabel && !isLabelWrapped && !hasLabelFor && !hasTitle;
      })
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}[${el.getAttribute('class')?.slice(0, 30) ?? ''}]`);

    return {
      textLength: text.length,
      firstText: text.slice(0, 90).replace(/\s+/g, ' '),
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      dir: document.documentElement.dir,
      lang: document.documentElement.lang,
      brokenImages: broken,
      tinyImages: tiny,
      imagesWithoutAlt: noAlt,
      overflowing,
      unlabelledControls,
      h1Count: document.querySelectorAll('h1').length,
    };
  });

  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);
  page.off('response', onResponse);

  return { consoleErrors, pageErrors, failedRequests, ...metrics };
}

const results = [];
const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    locale: 'he-IL',
  });
  const page = await context.newPage();

  for (const [path, name] of ROUTES) {
    // Screenshots only at the two viewports that matter most for review.
    const shouldShoot = viewport.name === 'mobile-390' || viewport.name === 'desktop-1440';
    let audit;
    try {
      audit = await auditPage(page, path);
      if (shouldShoot) {
        mkdirSync(`qa/screenshots/${viewport.name}`, { recursive: true });
        await page.screenshot({ path: `qa/screenshots/${viewport.name}/${name}.png`, fullPage: true });
      }
    } catch (error) {
      audit = { fatal: String(error.message ?? error) };
    }
    results.push({ viewport: viewport.name, path, name, ...audit });
  }
  await context.close();
}

await browser.close();
server.close();

mkdirSync('qa/out', { recursive: true });
writeFileSync('qa/out/route-sweep.json', JSON.stringify(results, null, 2));

// --- Console summary -------------------------------------------------------
const problems = [];
for (const r of results) {
  const issues = [];
  if (r.fatal) issues.push(`FATAL ${r.fatal}`);
  if (r.pageErrors?.length) issues.push(`pageerror: ${r.pageErrors.join(' | ')}`);
  if (r.consoleErrors?.length) issues.push(`console: ${r.consoleErrors.join(' | ')}`);
  if (r.failedRequests?.length) issues.push(`net: ${[...new Set(r.failedRequests)].join(' | ')}`);
  if (r.textLength !== undefined && r.textLength < 40) issues.push(`BLANK (text=${r.textLength})`);
  if (r.brokenImages?.length) issues.push(`broken img: ${[...new Set(r.brokenImages)].join(',')}`);
  if (r.tinyImages?.length) issues.push(`1px img: ${[...new Set(r.tinyImages)].join(',')}`);
  if (r.scrollWidth > r.clientWidth + 1) issues.push(`OVERFLOW ${r.scrollWidth}>${r.clientWidth} ${r.overflowing?.join(',')}`);
  if (r.dir !== 'rtl') issues.push(`dir=${r.dir}`);
  if (r.imagesWithoutAlt) issues.push(`${r.imagesWithoutAlt} img w/o alt`);
  if (r.unlabelledControls?.length) issues.push(`unlabelled: ${r.unlabelledControls.join(',')}`);
  if (r.h1Count === 0) issues.push('no h1');
  if (issues.length) problems.push(`[${r.viewport}] ${r.path}\n    ${issues.join('\n    ')}`);
}

console.log(`Swept ${ROUTES.length} routes × ${VIEWPORTS.length} viewports = ${results.length} loads`);
console.log(problems.length ? `\n${problems.length} route/viewport combos with findings:\n` : '\nNo findings.');
console.log(problems.join('\n'));
