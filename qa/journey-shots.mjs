/**
 * Walks the whole customer journey and photographs every screen at one width.
 *
 * Screens that only exist part-way through a purchase (checkout, payment states,
 * order success) cannot be reached by a URL, so the harness drives the UI to get
 * there. Overflow is measured on every stop, because horizontal scroll is the
 * failure that a screenshot alone hides.
 *
 * Run: node qa/journey-shots.mjs [width] [label]
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { startServer } from './serve.mjs';

const WIDTH = Number(process.argv[2] ?? 1440);
const LABEL = process.argv[3] ?? `w${WIDTH}`;
const PORT = 4396;
const OUT = `qa/screenshots/journey-${LABEL}`;
mkdirSync(OUT, { recursive: true });

const server = await startServer(PORT);
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: WIDTH, height: WIDTH < 600 ? 800 : 950 },
  locale: 'he-IL',
});
const page = await context.newPage();

const problems = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });

let step = 0;
async function shot(name) {
  step += 1;
  await page.waitForTimeout(450);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  if (overflow > 1) problems.push(`${name}: overflows by ${overflow}px`);
  await page.screenshot({
    path: `${OUT}/${String(step).padStart(2, '0')}-${name}.png`,
    fullPage: true,
  });
  console.log(`  ${String(step).padStart(2, '0')} ${name}${overflow > 1 ? `  OVERFLOW ${overflow}px` : ''}`);
}

const go = async (path) => {
  await page.goto(`http://localhost:${PORT}${path}`, { waitUntil: 'networkidle' });
};

console.log(`Journey at ${WIDTH}px:`);

// --- Browse ----------------------------------------------------------------
await go('/'); await shot('home');
await go('/store'); await shot('store');
await go('/store?search=zzzznothing'); await shot('store-empty');
await go('/games'); await shot('games');
await go('/products/fc27-coins'); await shot('product');

// --- Empty cart before anything is added ------------------------------------
await go('/cart'); await shot('cart-empty');

// --- Buy -------------------------------------------------------------------
await go('/products/fc27-coins');
await page.locator('button', { hasText: 'הוספה לעגלה' }).first().click();
await page.waitForTimeout(900);
await go('/cart'); await shot('cart-filled');

await go('/checkout'); await shot('checkout-empty-form');

// Fill every required field, then submit to reach the payment step.
// Scoped to the page body: the header's search input is also a form field,
// and it is hidden below 560px, which made an unscoped selector hang.
const inputs = await page.locator('main form input:not([type=checkbox]):not([type=search]), main form textarea').all();
for (const input of inputs) {
  const type = await input.getAttribute('type');
  if (type === 'email') await input.fill('buyer@example.com');
  else if (type === 'tel') await input.fill('0501234567');
  else await input.fill('ישראל ישראלי');
}
for (const box of await page.locator('main form input[type=checkbox]').all()) {
  await box.check().catch(() => {});
}
await shot('checkout-filled');

const submit = page.locator('main button', { hasText: /המשך|לתשלום|אישור/ }).first();
if (await submit.count()) {
  await submit.click();
  await page.waitForTimeout(1200);
  await shot('payment-choose');

  // The simulator's approved scenario.
  const approve = page.locator('button, label', { hasText: /מאושר/ }).first();
  if (await approve.count()) {
    await approve.click();
    await page.waitForTimeout(400);
    const pay = page.locator('button', { hasText: /שלם|אישור תשלום|לתשלום/ }).first();
    if (await pay.count()) {
      await pay.click();
      await page.waitForTimeout(2500);
      await shot('order-success');
    }
  }
}

// --- Account and order states ----------------------------------------------
await go('/account'); await shot('account');
await go('/account/orders'); await shot('account-orders');

// --- Failure and edge screens ----------------------------------------------
await go('/orders/ord_does_not_exist'); await shot('order-not-found');
await go('/definitely-not-a-route'); await shot('404');
await go('/support'); await shot('support');
await go('/deals'); await shot('deals');
await go('/faq'); await shot('faq');
await go('/terms'); await shot('legal');

await browser.close();
server.close();

console.log(problems.length ? `\nPROBLEMS:\n${problems.join('\n')}` : '\nNo overflow and no console errors.');
