/**
 * Authentication, end to end, in a real browser against a real backend.
 *
 * Expects the production build served by `qa/serve.mjs` with `API_PROXY`
 * pointing at a running backend, so `/api/*` is same-origin exactly as on
 * Vercel and the httpOnly session cookie behaves as it does in production.
 *
 *   API_PROXY=http://localhost:3000 node qa/serve.mjs 4321   (in one shell)
 *   node qa/auth-e2e.mjs http://localhost:4321                (in another)
 *
 * The backend should run with the development echo on and, for the Google
 * cases, with placeholder Google credentials so the button is offered. Google
 * itself is never contacted: the navigation to accounts.google.com is
 * intercepted and inspected, and the return leg is driven by hand.
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = (process.argv[2] ?? 'http://localhost:4321').replace(/\/$/, '');
const OUT = 'qa/screenshots/auth-e2e';
mkdirSync(OUT, { recursive: true });

const results = [];
let group = 'general';
const section = (name) => { group = name; console.log(`\n== ${name} ==`); };
const check = (name, ok, detail = '') => {
  results.push({ group, name, ok: Boolean(ok), detail });
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
};

const unique = () => Math.random().toString(36).slice(2, 10);
const PASSWORD = 'correct-horse-battery-9';

const browser = await chromium.launch();

async function newPage(context, name) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    // The wrong-password step deliberately earns a 401, which Chromium logs as
    // a resource error. That is the server saying no, not a script failing.
    if (/status of 401/.test(text)) return;
    errors.push(text.slice(0, 160));
  });
  page.errors = errors;
  page.shot = (label) => page.screenshot({ path: `${OUT}/${name}-${label}.png` });
  return page;
}

const headerState = async (page) => {
  if (await page.locator('tt-app-header .user__button').count()) return 'authenticated';
  if (await page.locator('tt-app-header .signin').count()) return 'anonymous';
  if (await page.locator('tt-app-header .pending').count()) return 'checking';
  return 'none';
};

const waitForAuthKnown = async (page) => {
  await page.waitForFunction(() => !document.querySelector('tt-app-header .pending'), null, { timeout: 20000 });
};

const fillSignIn = async (page, email, password) => {
  await page.fill('#acc-email', email);
  await page.fill('#acc-password', password);
};

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, locale: 'he-IL' });
  const page = await newPage(context, viewport.name);
  const isMobile = viewport.name === 'mobile';

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: logged-out state`);
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  const state0 = await headerState(page);
  if (isMobile) {
    await page.click('button[aria-controls="tt-mobile-nav"]');
    await page.waitForTimeout(400);
    check('drawer offers sign-in and sign-up', (await page.locator('#tt-mobile-nav .who__out a').count()) === 2);
    await page.shot('drawer-out');
    await page.keyboard.press('Escape');
  } else {
    check('header shows a sign-in link, no user', state0 === 'anonymous');
  }
  check('no user menu while signed out', (await page.locator('tt-app-header .user__button').count()) === 0);

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: sign-up`);
  const email = `e2e-${unique()}@example.com`;
  await page.goto(`${BASE}/account?mode=register`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  check('register mode opens from the query', (await page.locator('h1').innerText()).includes('פתיחת חשבון'));

  // Client-side validation first: nothing reaches the server.
  await page.fill('#acc-email', 'not-an-email');
  await page.fill('#acc-password', 'short');
  await page.click('form button[type="submit"]');
  check('invalid input is caught before submit', (await page.locator('.tt-error').count()) >= 1);

  await page.fill('#acc-name', 'דנה');
  await fillSignIn(page, email, PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/register'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  await page.waitForFunction(() => document.querySelector('tt-app-header .user__button'), null, { timeout: 20000 }).catch(() => {});
  check('sign-up signs the customer in', (await headerState(page)) === 'authenticated');
  check('header shows the customer', (await page.locator('tt-app-header .avatar').first().innerText()).trim().length > 0);
  await page.shot('signed-up');

  await page.reload({ waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  check('refresh keeps the session (cookie, not memory)', (await headerState(page)) === 'authenticated');
  check('account page shows the dashboard after refresh', (await page.locator('h1').innerText()).startsWith('שלום'));
  const stored = await page.evaluate(() => JSON.stringify(Object.keys(localStorage)) + JSON.stringify(Object.keys(sessionStorage)));
  check('no token or session material in web storage', !/token|session|password|jwt/i.test(stored), stored);

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: duplicate sign-up`);
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  // Sign out first so the form is reachable.
  if (isMobile) {
    await page.click('button[aria-controls="tt-mobile-nav"]');
    await page.waitForTimeout(400);
    await page.click('#tt-mobile-nav .signout');
  } else {
    await page.click('tt-app-header .user__button');
    await page.click('tt-app-header .menu__out');
  }
  await page.waitForFunction(() => document.querySelector('tt-app-header .signin, #tt-mobile-nav .who__out'), null, { timeout: 20000 }).catch(() => {});
  await page.goto(`${BASE}/account?mode=register`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  await fillSignIn(page, email, PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/me') && r.request().method() === 'GET', { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  await page.waitForTimeout(800);
  const dupText = await page.locator('.tt-alert--danger').first().innerText().catch(() => '');
  check('an existing address does not sign in and gets a neutral message', (await headerState(page)) === 'anonymous' && dupText.includes('לא הצלחנו'), dupText);
  check('the message does not confirm the address exists', !/קיים|registered|already/i.test(dupText));

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: wrong password`);
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  await fillSignIn(page, email, 'definitely-wrong-1');
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  await page.waitForTimeout(500);
  const wrongText = await page.locator('.tt-alert--danger').first().innerText().catch(() => '');
  check('wrong password reads as a wrong password', wrongText.includes('האימייל או הסיסמה שגויים'), wrongText);
  check('still signed out', (await headerState(page)) === 'anonymous');

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: protected route → sign-in → back`);
  await page.goto(`${BASE}/account/security`, { waitUntil: 'networkidle' });
  await page.waitForURL(/\/account\?returnTo=/, { timeout: 20000 }).catch(() => {});
  check('a guest is redirected to sign in with returnTo', page.url().includes('returnTo=%2Faccount%2Fsecurity') || page.url().includes('returnTo=/account/security'), page.url());
  await waitForAuthKnown(page);
  await fillSignIn(page, email, PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  await page.waitForURL(/\/account\/security$/, { timeout: 20000 }).catch(() => {});
  check('sign-in returns to the protected page', page.url().endsWith('/account/security'), page.url());
  check('header shows the user after sign-in', (await headerState(page)) === 'authenticated');
  await page.shot('security');

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: new tab sees the same session`);
  const tab = await newPage(context, `${viewport.name}-tab`);
  await tab.goto(`${BASE}/store`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(tab);
  check('a second tab is signed in', (await headerState(tab)) === 'authenticated');

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: logout`);
  if (isMobile) {
    await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
    await waitForAuthKnown(page);
    await page.click('button[aria-controls="tt-mobile-nav"]');
    await page.waitForTimeout(400);
    await page.shot('drawer-in');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/auth/logout'), { timeout: 30000 }),
      page.click('#tt-mobile-nav .signout'),
    ]);
  } else {
    await page.click('tt-app-header .user__button');
    check('the user menu opens', (await page.locator('#tt-user-menu').count()) === 1);
    await page.shot('user-menu');
    await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/v1/auth/logout'), { timeout: 30000 }),
      page.click('tt-app-header .menu__out'),
    ]);
  }
  await page.waitForTimeout(600);
  check('header returns to signed-out at once', (await headerState(page)) !== 'authenticated');
  check('leaving the protected page after sign-out', !page.url().endsWith('/account/security'), page.url());
  await page.reload({ waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  check('refresh after logout stays signed out', (await headerState(page)) !== 'authenticated');
  const meAfter = await page.evaluate(async () => (await (await fetch('/api/v1/me', { credentials: 'include' })).json()).authenticated);
  check('the server no longer recognises the session', meAfter === false);
  await tab.bringToFront();
  await tab.reload({ waitUntil: 'networkidle' });
  await waitForAuthKnown(tab);
  check('the other tab is signed out too', (await headerState(tab)) !== 'authenticated');
  await tab.close();

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: sign-in again`);
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  await fillSignIn(page, email, PASSWORD);
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login'), { timeout: 30000 }),
    page.click('form button[type="submit"]'),
  ]);
  await page.waitForFunction(() => document.querySelector('tt-app-header .user__button'), null, { timeout: 20000 }).catch(() => {});
  check('signing in again works', (await headerState(page)) === 'authenticated');
  await page.goto(`${BASE}/account/orders`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  check('orders page opens for the customer', (await page.locator('h1').innerText()).includes('ההזמנות'));

  // ---------------------------------------------------------------------------
  section(`${viewport.name}: Google`);
  const methods = await page.evaluate(async () => (await fetch('/api/v1/auth/methods')).json());
  // Sign out so the sign-in screen is reachable.
  await page.evaluate(async () => { await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }); });
  await page.goto(`${BASE}/account`, { waitUntil: 'networkidle' });
  await waitForAuthKnown(page);
  const googleButton = page.locator('a.google');
  if (!methods.google) {
    check('Google button hidden when the server has no credentials', (await googleButton.count()) === 0);
  } else {
    check('Google button offered when configured', (await googleButton.count()) === 1);
    const href = await googleButton.getAttribute('href');
    check('the button is a full navigation to the backend start endpoint', /\/api\/v1\/auth\/google\?returnTo=/.test(href ?? ''), href ?? '');

    // Never actually leave for Google: request the start endpoint with
    // redirects disabled (same cookie jar as the page) and read where the
    // backend would have sent the browser.
    const start = await page.request.get(new URL(href, BASE).toString(), { maxRedirects: 0 });
    const location = start.headers()['location'] ?? '';
    const parsed = location ? new URL(location) : null;
    check('the backend redirects to Google with our redirect_uri and scope',
      start.status() === 302 && parsed?.origin === 'https://accounts.google.com'
        && parsed.searchParams.get('redirect_uri')?.endsWith('/api/v1/auth/google/callback')
        && parsed.searchParams.get('scope') === 'openid email profile',
      `${start.status()} ${location.slice(0, 120)}`);
    const cookies = await context.cookies(BASE);
    const stateCookie = cookies.find((c) => c.name === 'tt_oauth_state');
    check('a one-time state cookie was set, httpOnly', Boolean(stateCookie) && stateCookie.httpOnly);
    const state = parsed?.searchParams.get('state') ?? '';

    // The customer pressed "cancel" at Google.
    await page.goto(`${BASE}/api/v1/auth/google/callback?state=${encodeURIComponent(state)}&error=access_denied`, { waitUntil: 'networkidle' });
    await waitForAuthKnown(page);
    check('cancelling at Google lands on the account screen as a cancellation', page.url().includes('auth=cancelled') && (await page.locator('.panel .tt-alert--warning').innerText()).includes('בוטלה'), page.url());
    check('still signed out after cancelling', (await headerState(page)) === 'anonymous');

    // A forged or expired return.
    await page.goto(`${BASE}/api/v1/auth/google/callback?state=forged.c3RhdGU&code=abc`, { waitUntil: 'networkidle' });
    await waitForAuthKnown(page);
    check('a forged callback fails safely', page.url().includes('auth=failed') && (await page.locator('.panel .tt-alert--warning').innerText()).includes('לא הושלמה'), page.url());
    check('no session from a forged callback', (await headerState(page)) === 'anonymous');
    await page.shot('google-failed');
  }

  check(`${viewport.name}: no page or console errors across the run`, page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('FAILED:'); failed.forEach((f) => console.log(` - [${f.group}] ${f.name} ${f.detail}`));
}
process.exit(failed.length ? 1 : 0);
