/**
 * Functional flow harness.
 *
 * Drives the real UI in Chromium through the buying flow, the cart behaviours,
 * the dynamic checkout requirements, region safety and every payment branch.
 * Each check reports PASS/FAIL with what it actually observed.
 *
 * Run: node qa/flows.mjs [port]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(9);
});

const PORT = Number(process.argv[2] ?? 4322);
const BASE = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const results = [];
let currentGroup = 'general';

const group = (name) => { currentGroup = name; };
const check = (name, passed, detail = '') => {
  results.push({ group: currentGroup, name, passed: Boolean(passed), detail });
  const mark = passed ? 'PASS' : 'FAIL';
  console.log(`  [${mark}] ${name}${detail ? ` — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
};

// ---------------------------------------------------------------------------
group('purchase flow');
console.log('\n== Purchase flow: home → store → game → product → cart → checkout → payment → order ==');

await go('/');
check('home renders hero', (await page.locator('h1').first().innerText()).length > 5);

await page.locator('a[href="/store"]').first().click();
await page.waitForURL('**/store');
await page.waitForTimeout(500);
check('store lists products', (await page.locator('tt-product-card').count()) > 0,
  `${await page.locator('tt-product-card').count()} cards`);

await go('/games');
await page.locator('a[href="/games/ea-sports-fc"]').first().click();
await page.waitForURL('**/games/ea-sports-fc');
await page.waitForTimeout(500);
const eaProducts = await page.locator('tt-product-card').count();
check('EA FC game page lists its products', eaProducts >= 3, `${eaProducts} products`);

await page.locator('a[href="/products/ea-fc-ultimate-team-coins"]').first().click();
await page.waitForURL('**/products/ea-fc-ultimate-team-coins');
await page.waitForTimeout(600);

const variantChips = page.locator('.chooser').first().locator('.chip');
const variantCount = await variantChips.count();
check('product exposes variants', variantCount >= 5, `${variantCount} variants`);

// Select the 500K variant, then a platform, then read the resolved offer price.
await variantChips.filter({ hasText: '500K' }).first().click(); // by label: the ladder has eleven sizes
await page.waitForTimeout(250);
const priceAfterVariant = await page.locator('.tt-price').first().innerText();
check('variant selection changes price', priceAfterVariant.includes('39'), `price=${priceAfterVariant}`); // 500K on the launch ladder

const platformChips = page.locator('.chooser').nth(1).locator('.chip');
const platformCount = await platformChips.count();
check('product exposes platforms', platformCount >= 2, `${platformCount} platforms`);
await platformChips.nth(1).click();
await page.waitForTimeout(250);

const regionChips = page.locator('.chooser').nth(2).locator('.chip');
check('product exposes region choice', (await regionChips.count()) >= 1,
  `${await regionChips.count()} regions`);

const deliveryText = await page.locator('.delivery').first().innerText();
check('delivery method is stated on the product', deliveryText.length > 20, deliveryText.slice(0, 50));

await page.getByRole('button', { name: 'הוספה לעגלה' }).click();
await page.waitForTimeout(700);
const badgeCount = await page.locator('tt-app-header .count').innerText().catch(() => '0');
check('add to cart updates header badge', badgeCount === '1', `badge=${badgeCount}`);

await go('/cart');
check('cart shows the added line', (await page.locator('.line').count()) === 1);
const cartRegion = await page.locator('.line tt-region-badge').first().innerText();
check('cart line shows region', cartRegion.trim().length > 0, cartRegion.trim());
const cartFulfil = await page.locator('.line tt-fulfillment-badge').first().innerText();
check('cart line shows delivery method', cartFulfil.trim().length > 0, cartFulfil.trim());

await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
await page.waitForURL('**/checkout');
await page.waitForTimeout(900);

// ---------------------------------------------------------------------------
group('checkout requirements');
console.log('\n== Dynamic checkout requirements ==');

const coinFields = await page.locator('.fields label').allInnerTexts();
const coinFieldText = coinFields.join(' | ');
check('coin offer asks for a public account handle',
  /שם המשתמש שלכם בפלטפורמה/.test(coinFieldText), 'handle field present');
check('coin offer never asks for a password',
  !/סיסמה|password|קוד אימות|2fa|cvv/i.test(coinFieldText.replace(/לעולם לא נבקש סיסמה/g, '')),
  'no credential field');
const passwordInputs = await page.locator('input[type="password"]').count();
check('no password input exists anywhere in checkout', passwordInputs === 0, `${passwordInputs} found`);

// Submit empty to exercise validation.
await page.getByRole('button', { name: 'המשך לתשלום' }).click();
await page.waitForTimeout(700);
const errorCount = await page.locator('.tt-error').count();
check('empty submit produces field errors', errorCount > 0, `${errorCount} errors`);
const orderCreatedTooEarly = await page.locator('text=אמצעי תשלום').count();
check('invalid submit does not create an order', orderCreatedTooEarly === 0);

// Fill it properly.
await page.locator('input[name="FULL_NAME"]').fill('בודק אוטומטי');
await page.locator('input[name="EMAIL"]').fill('qa@example.com');
await page.locator('input[name="PLATFORM_ACCOUNT_HANDLE"]').fill('TopGamer_IL');
await page.locator('input[name="TERMS_ACCEPTANCE"]').check();
await page.getByRole('button', { name: 'המשך לתשלום' }).click();
await page.waitForTimeout(900);
check('valid submit advances to payment', (await page.locator('text=אמצעי תשלום').count()) > 0);

// ---------------------------------------------------------------------------
group('payment: declined');
console.log('\n== Payment branches ==');

const pickInstrument = async (token) => {
  await page.locator(`input[name="instrument"][value="${token}"]`).check();
};
const payButton = () => page.locator('section:has-text("אמצעי תשלום") button.tt-btn--primary');

await pickInstrument('sim_declined');
await payButton().click();
await page.waitForTimeout(2200);
const declineText = await page.locator('.tt-alert--danger').innerText().catch(() => '');
check('declined payment shows a safe failure message', /נדחה/.test(declineText), declineText.slice(0, 60));
check('declined payment stays on checkout', page.url().includes('/checkout'));
check('declined payment offers a retry',
  (await page.getByRole('button', { name: 'ניסיון תשלום נוסף' }).count()) > 0);

group('payment: retry then success');
await pickInstrument('sim_success');
await page.getByRole('button', { name: 'ניסיון תשלום נוסף' }).click();
await page.waitForURL('**/order/**/success', { timeout: 15000 });
check('retry after decline succeeds and lands on the order page', page.url().includes('/success'));

await page.waitForTimeout(900);
const orderRef = await page.locator('.tt-eyebrow').first().innerText();
check('order page shows an order reference', /EC-\d+/.test(orderRef), orderRef);
const timelineSteps = await page.locator('tt-order-status-timeline li').count();
check('order status timeline renders', timelineSteps >= 5, `${timelineSteps} steps`);

group('order lifecycle');
const headingNow = await page.locator('h1').first().innerText();
check('manual-fulfillment order starts in processing', /בהכנה|סופקה/.test(headingNow), headingNow);
// The mock completes manual fulfillment after ~6s; polling should show it.
await page.waitForTimeout(8000);
const headingLater = await page.locator('h1').first().innerText();
check('order progresses to delivered without a reload', /סופקה/.test(headingLater), headingLater);

const cartBadgeAfterOrder = await page.locator('tt-app-header .count').count();
check('cart is emptied after a successful order', cartBadgeAfterOrder === 0);

const orderUrl = page.url();

group('idempotency');
console.log('\n== Idempotency and duplicate protection ==');

// Navigate in-app: the mock backend lives in memory, so a full page load would
// legitimately lose the order. Real users reach these pages by clicking too.
// The header holds two routes to the account now, the bar action and the
// drawer row, so this picks the first exactly as the next line does.
await page.locator('tt-app-header a[href="/account"]').first().click();
await page.waitForURL('**/account');
await page.locator('a[href="/account/orders"]').first().click();
await page.waitForURL('**/account/orders');
await page.waitForTimeout(800);
const orderRows = await page.locator('.list li').count();
check('exactly one order was created by the flow', orderRows === 1, `${orderRows} orders`);

// A hard reload is a known limitation of the memory-only mock; it must degrade
// into an explanation, never a blank page or a raw error.
await page.goto(orderUrl.replace('/success', ''), { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
const missingHeading = await page.locator('h1').first().innerText();
check('hard-reloading an order URL explains the dev-build limitation',
  /אינה זמינה/.test(missingHeading), missingHeading);

// ---------------------------------------------------------------------------
group('cart behaviour');
console.log('\n== Cart behaviour ==');

await go('/products/playstation-store-gift-card');
await page.getByRole('button', { name: 'הוספה לעגלה' }).click();
await page.waitForTimeout(700);
await page.getByRole('button', { name: 'הוספה לעגלה' }).click();
await page.waitForTimeout(700);
await go('/cart');
const lines = await page.locator('.line').count();
const qtyText = await page.locator('.line .value').first().innerText();
check('adding the same offer twice merges into one line', lines === 1, `${lines} lines`);
check('merged line has quantity 2', qtyText.trim() === '2', `qty=${qtyText.trim()}`);

const totalBefore = await page.locator('.row.total span').nth(1).innerText();
await page.locator('.line button[aria-label="הוספת כמות"]').click();
await page.waitForTimeout(400);
const totalAfter = await page.locator('.row.total span').nth(1).innerText();
check('quantity change updates the total', totalBefore !== totalAfter, `${totalBefore} → ${totalAfter}`);

// Currency must be integer minor units, never float artefacts.
check('totals show no floating-point artefacts', !/\.\d{3,}|\d+\.9999|\d+\.0000/.test(totalAfter), totalAfter);

group('cart persistence');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('cart survives a reload', (await page.locator('.line').count()) === 1);

const stored = await page.evaluate(() => localStorage.getItem('top-token.cart.v2'));
check('cart storage holds no contact details',
  stored !== null && !/qa@example\.com|בודק אוטומטי|TopGamer_IL/.test(stored));
check('cart storage holds no order or payment data',
  stored !== null && !/"ord_|"pi_|sim_success|DEMO-/.test(stored));

group('cart hostile storage');
await page.evaluate(() => localStorage.setItem('top-token.cart.v2', '{ this is not json'));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check('corrupted cart JSON does not break the page',
  (await page.locator('tt-empty-state, .line').count()) > 0 && consoleErrors.length === 0);

await page.evaluate(() => localStorage.setItem('top-token.cart.v2', JSON.stringify([
  { id: 'x', offerId: 'nope', quantity: 'lots' },
  { totallyWrong: true },
  null,
])));
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const afterHostile = await page.locator('.line').count();
check('malformed cart entries are discarded, not rendered', afterHostile === 0, `${afterHostile} lines`);

await page.evaluate(() => localStorage.setItem('top-token.cart.v2', JSON.stringify([{
  id: 'tampered', offerId: 'offer__prod-ps-gift-card__50__plat-ps5__reg-il',
  productId: 'prod-ps-gift-card', variantId: 'prod-ps-gift-card__50',
  platformId: 'plat-ps5', regionId: 'reg-il', quantity: 1,
  unitPrice: { amountMinor: 1, currency: 'ILS' },
  totalPrice: { amountMinor: 1, currency: 'ILS' },
  fulfillmentMethod: 'DIGITAL_CODE',
  displayName: { he: 'זול' }, displayVariantName: { he: '50' },
  addedAt: '2026-01-01T00:00:00.000Z',
}])));
await go('/cart');
const tamperedShown = await page.locator('.row.total span').nth(1).innerText();
await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
await page.waitForURL('**/checkout');
await page.waitForTimeout(1200);
const repricedTotal = await page.locator('aside .row.total span').nth(1).innerText();
check('server re-pricing overrides a tampered localStorage price',
  !repricedTotal.includes('0.01') && repricedTotal !== tamperedShown,
  `stored=${tamperedShown} → validated=${repricedTotal}`);

group('empty cart protection');
await page.evaluate(() => localStorage.removeItem('top-token.cart.v2'));
await go('/checkout');
check('checkout with an empty cart redirects to the store', page.url().includes('/store'), page.url());

// ---------------------------------------------------------------------------
group('region safety');
console.log('\n== Region safety ==');

await go('/products/playstation-store-gift-card');
const regionAlert = await page.locator('.tt-alert').first().innerText();
check('region-locked product shows its region prominently', /אזור/.test(regionAlert), regionAlert.slice(0, 60));
check('region restriction is spelled out', /ניתן למימוש רק/.test(regionAlert));

const regionButtons = page.locator('.chooser').nth(2).locator('.chip');
const regionLabels = await regionButtons.allInnerTexts();
check('both store regions are selectable', regionLabels.length === 2, regionLabels.join(' / '));

await regionButtons.nth(1).click();
await page.waitForTimeout(350);
const alertAfterSwitch = await page.locator('.tt-alert').first().innerText();
check('switching region updates the displayed region',
  alertAfterSwitch !== regionAlert, alertAfterSwitch.slice(0, 50));

await page.getByRole('button', { name: 'הוספה לעגלה' }).click();
await page.waitForTimeout(700);
await go('/cart');
const cartRegionText = await page.locator('.line tt-region-badge').first().innerText();
check('the chosen region is carried into the cart', /ארצות הברית|US/i.test(cartRegionText), cartRegionText);

await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
await page.waitForURL('**/checkout');
await page.waitForTimeout(1000);
const checkoutText = await page.locator('.layout').innerText();
check('region is visible at checkout', /ארצות הברית|US/i.test(checkoutText));
const confirmField = await page.locator('input[name="REGION_CONFIRMATION"]').count();
check('region-locked offer requires explicit confirmation', confirmField === 1);

const giftFields = (await page.locator('.fields label').allInnerTexts()).join(' | ');
check('gift card does NOT ask for a player handle',
  !/שם המשתמש שלכם בפלטפורמה|מזהה השחקן/.test(giftFields));
check('requirements differ between coin and gift-card offers',
  !giftFields.includes('שם המשתמש שלכם בפלטפורמה'));

// Region confirmation must actually be enforced.
await page.locator('input[name="FULL_NAME"]').fill('בודק');
await page.locator('input[name="EMAIL"]').fill('qa2@example.com');
await page.locator('input[name="TERMS_ACCEPTANCE"]').check();
await page.getByRole('button', { name: 'המשך לתשלום' }).click();
await page.waitForTimeout(800);
check('unconfirmed region blocks the order',
  (await page.locator('text=אמצעי תשלום').count()) === 0 && (await page.locator('.tt-error').count()) > 0);

await page.locator('input[name="REGION_CONFIRMATION"]').check();
await page.getByRole('button', { name: 'המשך לתשלום' }).click();
await page.waitForTimeout(1000);
check('confirming the region allows the order', (await page.locator('text=אמצעי תשלום').count()) > 0);

group('payment: cancelled');
await pickInstrument('sim_cancelled');
await payButton().click();
await page.waitForTimeout(2000);
const cancelText = await page.locator('.tt-alert--danger').innerText().catch(() => '');
check('cancelled payment reports cancellation', /בוטל/.test(cancelText), cancelText.slice(0, 50));

group('payment: gateway error');
await pickInstrument('sim_error');
await page.getByRole('button', { name: 'ניסיון תשלום נוסף' }).click();
await page.waitForTimeout(2200);
const errorText = await page.locator('.tt-alert--danger').innerText().catch(() => '');
check('gateway error reports a retryable failure', /לא זמין|נסות שוב/.test(errorText), errorText.slice(0, 60));

group('payment: pending/timeout');
await pickInstrument('sim_timeout');
await page.getByRole('button', { name: 'ניסיון תשלום נוסף' }).click();
await page.waitForTimeout(2600);
const pendingText = await page.locator('.tt-alert--danger').innerText().catch(() => '');
check('timeout leaves the payment pending with a do-not-retry warning',
  /בעיבוד/.test(pendingText), pendingText.slice(0, 70));
const payDisabled = await payButton().isDisabled();
check('pay button is disabled while a payment is pending', payDisabled);

group('payment: double click');
// A fresh page load resets the memory-only backend, so this session starts from
// zero orders and any duplicate would be unmistakable.
await page.evaluate(() => localStorage.removeItem('top-token.cart.v2'));
await go('/products/fortnite-v-bucks');
await page.getByRole('button', { name: 'הוספה לעגלה' }).click();
await page.waitForTimeout(700);
await page.locator('tt-app-header a[href="/cart"]').click();
await page.waitForURL('**/cart');
await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
await page.waitForURL('**/checkout');
await page.waitForTimeout(1200);
await page.locator('input[name="FULL_NAME"]').fill('בודק');
await page.locator('input[name="EMAIL"]').fill('qa3@example.com');
await page.locator('input[name="TERMS_ACCEPTANCE"]').check();
const submit = page.getByRole('button', { name: 'המשך לתשלום' });
await Promise.all([submit.click(), submit.click().catch(() => {})]);
await page.waitForTimeout(1800);
await pickInstrument('sim_success');
const pay = payButton();
await Promise.all([pay.click(), pay.click().catch(() => {})]);
await page.waitForURL('**/order/**', { timeout: 15000 });
await page.waitForTimeout(1500);
// The header holds two routes to the account now, the bar action and the
// drawer row, so this picks the first exactly as the next line does.
await page.locator('tt-app-header a[href="/account"]').first().click();
await page.waitForURL('**/account');
await page.locator('a[href="/account/orders"]').first().click();
await page.waitForURL('**/account/orders');
await page.waitForTimeout(800);
const finalOrders = await page.locator('.list li').count();
check('double-clicking submit and pay creates exactly one order',
  finalOrders === 1, `${finalOrders} orders in this session`);

// ---------------------------------------------------------------------------
group('console hygiene');
check('no console errors during the whole flow', consoleErrors.length === 0,
  consoleErrors.slice(0, 3).join(' | '));

mkdirSync('qa/out', { recursive: true });
writeFileSync('qa/out/flows.json', JSON.stringify({ results, consoleErrors }, null, 2));

await browser.close();
server.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  - [${f.group}] ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
}
