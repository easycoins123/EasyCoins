// Growth round screenshot walk, mock mode, against dist/top-token.
// Usage: node qa/growth-flow.mjs  (after a development build)
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

const PORT = 4411;
const BASE = `http://localhost:${PORT}`;
const OUT = 'qa/screenshots/growth-flow';
mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch();
const notes = [];
const note = (line) => { notes.push(line); console.log(line); };

for (const width of [390, 1440]) {
  const height = width < 600 ? 844 : 900;
  const context = await browser.newContext({ viewport: { width, height }, locale: 'he-IL' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  const shot = async (name, full = true) => {
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}-${width}.png`, fullPage: full });
  };
  const go = async (path) => { await page.goto(BASE + path, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
  // Mock mode keeps its state in memory, so after sign-up every move is an in-app
  // navigation (as a customer clicking links would make), never a full reload.
  const nav = async (path) => {
    await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
    await page.waitForTimeout(900);
  };

  await go('/'); await shot('01-home');

  // Register (mock: any email/password).
  await go('/account?mode=register');
  await page.locator('#acc-name').fill('דניאל');
  await page.locator('#acc-email').fill(`growth-${width}-${Date.now()}@example.com`);
  await page.locator('#acc-password').fill('Passw0rd!x');
  await page.locator('form button[type="submit"]').click();
  await page.waitForTimeout(1200);
  await shot('02-account-signed-in');

  await nav('/account/club'); await shot('03-club-empty');
  await nav('/deals'); await shot('04-deals');

  await nav('/store');
  await page.locator('#custom-amount').fill('1370000');
  await page.locator('tt-custom-coins .chip').first().click().catch(() => undefined);
  await page.waitForTimeout(1200);
  await page.locator('#goal-target').fill('850K');
  await page.locator('#goal-balance').fill('210K');
  await page.waitForTimeout(400);
  await shot('05-store');
  const customText = await page.locator('tt-custom-coins').innerText().catch(() => '');
  note(`[${width}] custom coins quote text: ${customText.replace(/\s+/g, ' ').slice(0, 220)}`);

  // Buy the first shelf card.
  await page.locator('tt-easycoins-card button.buy').first().click();
  await page.waitForTimeout(800);
  await nav('/cart'); await shot('06-cart-first-order');
  await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
  await page.waitForURL('**/checkout'); await page.waitForTimeout(800);
  await shot('07-checkout');
  await page.locator('input[name="FULL_NAME"]').fill('דניאל בודק');
  await page.locator('input[name="EMAIL"]').fill(`growth-${width}@example.com`);
  await page.locator('input[name="PLATFORM_ACCOUNT_HANDLE"]').fill('EasyGamer_IL');
  await page.locator('input[name="TERMS_ACCEPTANCE"]').check();
  await page.getByRole('button', { name: 'המשך לתשלום' }).click();
  await page.waitForTimeout(900);
  await page.locator('input[name="instrument"][value="sim_success"]').check();
  await page.locator('section:has-text("אמצעי תשלום") button.tt-btn--primary').click();
  await page.waitForURL('**/order/**/success', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot('08-success-drop-closed');
  const cards = page.locator('tt-easydrop-reveal button.card');
  note(`[${width}] easydrop cards: ${await cards.count()}`);
  await cards.nth(1).click();
  await page.waitForTimeout(1800);
  await shot('09-success-drop-open');
  const revealed = await page.locator('tt-easydrop-reveal').innerText().catch(() => '');
  note(`[${width}] reveal: ${revealed.replace(/\s+/g, ' ').slice(0, 200)}`);
  // Leave and come back: the same card must be open (the server-side test covers a hard refresh).
  const orderPath = new URL(page.url()).pathname;
  await nav('/store'); await nav(orderPath); await page.waitForTimeout(1200);
  const again = await page.locator('tt-easydrop-reveal').innerText().catch(() => '');
  note(`[${width}] reveal after leaving and returning identical: ${again.replace(/\s+/g, ' ') === revealed.replace(/\s+/g, ' ')}`);
  await shot('10-success-after-return', false);

  await nav('/account/club'); await shot('11-club-with-reward');

  // Second order: the reward is offered in the cart.
  await nav('/store');
  await page.locator('tt-easycoins-card button.buy').nth(1).click();
  await page.waitForTimeout(800);
  await nav('/cart');
  const pick = page.locator('tt-reward-picker button').first();
  note(`[${width}] reward picker buttons: ${await page.locator('tt-reward-picker button').count()}`);
  if (await pick.count()) { await pick.click(); await page.waitForTimeout(1000); }
  await shot('12-cart-with-reward');
  note(`[${width}] cart benefits: ${(await page.locator('tt-benefits-note').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200)}`);
  await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
  await page.waitForURL('**/checkout'); await page.waitForTimeout(800);
  await shot('13-checkout-with-reward');

  await go('/r/EC000000'); await page.waitForTimeout(800); await shot('14-referral-landing', false);
  await nav('/account'); await shot('15-account');

  note(`[${width}] console/page errors: ${errors.length}${errors.length ? ' :: ' + errors.slice(0, 3).join(' | ') : ''}`);
  await context.close();
}
writeFileSync(`${OUT}/notes.txt`, notes.join('\n'));
await browser.close();
await server.close?.();
process.exit(0);
