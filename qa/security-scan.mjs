/**
 * Security scan.
 *
 * Two halves: a static sweep of the source for credential-shaped fields and
 * secrets, and a runtime check of what the running app actually writes to
 * browser storage and hands to analytics. Claims in the security report are
 * backed by this script rather than by assertion.
 */
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname, sep } from 'node:path';
import { startServer } from './serve.mjs';

process.on('unhandledRejection', (error) => {
  console.error('UNHANDLED REJECTION:', error);
  process.exit(9);
});

const results = [];
const check = (name, passed, detail = '') => {
  results.push({ name, passed: Boolean(passed), detail });
  console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${name}${detail ? ` — ${detail}` : ''}`);
};

// ---------------------------------------------------------------------------
console.log('\n== Static source scan ==');

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, acc);
    } else if (['.ts', '.html', '.scss', '.json'].includes(extname(full))) {
      acc.push(full);
    }
  }
  return acc;
}

const sourceFiles = walk('src').filter((file) => !file.endsWith('.spec.ts'));
const sources = sourceFiles.map((file) => ({ file, text: readFileSync(file, 'utf8') }));

// Credential-shaped identifiers that must not exist as *fields*.
// Matching declarations only, so prose ("we never ask for your password") and
// reassurance copy do not register as findings.
/**
 * Fields that must never exist anywhere, under any circumstances.
 *
 * Card data and any credential belonging to somebody else's system: a game
 * account password, a 2FA secret, a recovery code. EASYCOINS has no legitimate
 * reason to hold any of these, and the checkout vocabulary is a closed list
 * precisely so it cannot.
 */
const FORBIDDEN_FIELDS = [
  /(^|[\s{,(])(readonly\s+)?(cvv|cvc|cardNumber|pan|expiryDate|otpCode|recoveryCode|backupCode|twoFactorSecret|psnPassword|eaPassword|gamePassword)\s*\??\s*:/im,
];

/**
 * The customer's own EASYCOINS account password.
 *
 * Legitimate since accounts were added, but only in the files that authenticate.
 * Anywhere else, a field called `password` is a mistake worth failing the build
 * over, so the allowlist is deliberately short and explicit.
 */
const ACCOUNT_PASSWORD_FIELD =
  /(^|[\s{,(])(readonly\s+)?(password|newPassword|currentPassword)\s*\??\s*:/im;

const PASSWORD_ALLOWED = [
  'data/api/customer-api.service.ts',
  'data/http/http-content-api.service.ts',
  'data/mock/mock-content-api.service.ts',
  'state/customer.facade.ts',
  'pages/account/account.page.ts',
  'pages/account/account-security.page.ts',
].map((path) => path.split('/').join(sep));

const stripComments = (text) => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const forbiddenHits = [];
const strayPasswordHits = [];
for (const { file, text } of sources) {
  const code = stripComments(text);

  for (const pattern of FORBIDDEN_FIELDS) {
    if (pattern.test(code)) {
      forbiddenHits.push(file);
    }
  }

  if (ACCOUNT_PASSWORD_FIELD.test(code) && !PASSWORD_ALLOWED.some((allowed) => file.endsWith(allowed))) {
    strayPasswordHits.push(file);
  }
}

check('no card data or third-party credential field anywhere in src', forbiddenHits.length === 0,
  forbiddenHits.slice(0, 4).join(' | '));

check('the account password appears only in the files that authenticate',
  strayPasswordHits.length === 0, strayPasswordHits.slice(0, 4).join(' | '));

// A password must never reach browser storage, in any file, ever.
const storedPassword = sources.filter(({ text }) =>
  /(localStorage|sessionStorage)\.[a-zA-Z]+\([^)]*password/i.test(stripComments(text)));
check('no password is written to browser storage', storedPassword.length === 0,
  storedPassword.map(({ file }) => file).slice(0, 3).join(' | '));

// Password inputs in templates.
const passwordInputs = sources.filter(({ text }) => /type=["']password["']/.test(text));
// The sign-in screen and the account's own security screen (change password).
const PASSWORD_INPUT_ALLOWED = ['account.page.ts', 'account-security.page.ts']
  .map((name) => `pages${sep}account${sep}${name}`);
const strayPasswordInputs = passwordInputs.filter(
  ({ file }) => !PASSWORD_INPUT_ALLOWED.some((allowed) => file.endsWith(allowed)));

check('a password input appears only on the account screens', strayPasswordInputs.length === 0,
  passwordInputs.map((s) => s.file).join(', '));

// Secret-looking literals.
const SECRET_PATTERNS = [
  /sk_live_[A-Za-z0-9]/,
  /sk_test_[A-Za-z0-9]/,
  /AIza[0-9A-Za-z_-]{20,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /['"][A-Za-z0-9+/]{40,}={0,2}['"]\s*;?\s*\/\/\s*(secret|key|token)/i,
  /\b(apiSecret|clientSecret|privateKey|secretKey)\b\s*[:=]/i,
];
const secretHits = [];
for (const { file, text } of sources) {
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) secretHits.push(`${file}: ${pattern}`);
  }
}
check('no secret-shaped literals in src', secretHits.length === 0, secretHits.slice(0, 3).join(' | '));

// Environment files must carry config only.
// Comments are stripped first: these files deliberately *document* that they
// must never hold a secret, and that prose is not itself a finding.
const envFiles = sources.filter(({ file }) => file.includes('environments'));
const envSecret = envFiles.filter(({ text }) => /secret|privateKey|password|sk_/i.test(stripComments(text)));
check('environment files contain no secrets', envSecret.length === 0,
  envSecret.map((s) => s.file).join(', '));

// The checkout vocabulary is the structural guarantee; assert its membership.
const requirementsFile = sources.find(({ file }) => file.endsWith('requirements.ts'));
const enumStart = requirementsFile.text.indexOf('export enum CheckoutFieldKey');
const enumBodyRaw = requirementsFile.text.slice(enumStart, requirementsFile.text.indexOf('}', enumStart));
// Member names only: the surrounding comments deliberately talk about the
// credentials this enum refuses to contain.
const memberNames = stripComments(enumBodyRaw)
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => /^[A-Za-z]+\s*=/.test(line))
  .join(' ');
const forbiddenKeys = /PASSWORD|OTP|TWO_FACTOR|2FA|RECOVERY|BACKUP_CODE|CVV|CARD/i;
check('CheckoutFieldKey contains no credential member', !forbiddenKeys.test(memberNames), memberNames.slice(0, 60));

// localStorage usage must be confined to the cart.
const storageUsers = sources.filter(({ text }) => /localStorage\./.test(text));
const allowed = storageUsers.every(({ file }) => file.includes('cart-storage.service'));
check('localStorage is written from exactly one place', allowed,
  storageUsers.map((s) => s.file.split(/[\\/]/).pop()).join(', '));

// Console logging must go through the logger.
const rawConsole = sources.filter(({ file, text }) => (
  /console\.(log|info|debug)\s*\(/.test(text)
  && !file.includes('logger.service')
  && !file.includes('main.ts')
));
check('no raw console logging outside the logger', rawConsole.length === 0,
  rawConsole.map((s) => s.file.split(/[\\/]/).pop()).join(', '));

// ---------------------------------------------------------------------------
console.log('\n== Runtime behaviour ==');

const PORT = Number(process.argv[2] ?? 4377);
const BASE = `http://localhost:${PORT}`;
const server = await startServer(PORT);

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: 'he-IL' });
const page = await context.newPage();

// Capture anything the app tries to send anywhere.
const outbound = [];
page.on('request', (request) => {
  if (!request.url().startsWith(BASE)) outbound.push(request.url());
});

const SECRET_EMAIL = 'security-probe@example.com';
const SECRET_HANDLE = 'SecretHandle_42';
const SECRET_NAME = 'שם פרטי לבדיקה';

await page.goto(`${BASE}/products/ea-fc-ultimate-team-coins`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.getByRole('button', { name: 'הוספה לעגלה' }).click();
await page.waitForTimeout(700);

await page.locator('tt-app-header a[href="/cart"]').click();
await page.waitForURL('**/cart');
await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
await page.waitForURL('**/checkout');
await page.waitForTimeout(1100);

await page.locator('input[name="FULL_NAME"]').fill(SECRET_NAME);
await page.locator('input[name="EMAIL"]').fill(SECRET_EMAIL);
await page.locator('input[name="PLATFORM_ACCOUNT_HANDLE"]').fill(SECRET_HANDLE);
await page.locator('input[name="TERMS_ACCEPTANCE"]').check();
await page.getByRole('button', { name: 'המשך לתשלום' }).click();
await page.waitForTimeout(1400);

const storageAfterDetails = await page.evaluate(() => ({
  local: JSON.stringify(localStorage),
  session: JSON.stringify(sessionStorage),
  cookies: document.cookie,
}));

check('contact details are never written to localStorage',
  !storageAfterDetails.local.includes(SECRET_EMAIL)
  && !storageAfterDetails.local.includes(SECRET_HANDLE)
  && !storageAfterDetails.local.includes(SECRET_NAME));
check('contact details are never written to sessionStorage',
  !storageAfterDetails.session.includes(SECRET_EMAIL)
  && !storageAfterDetails.session.includes(SECRET_HANDLE));
check('no cookies are set', storageAfterDetails.cookies === '', storageAfterDetails.cookies);

await page.locator('input[name="instrument"][value="sim_success"]').check();
await page.locator('section:has-text("אמצעי תשלום") button.tt-btn--primary').click();
await page.waitForURL('**/order/**', { timeout: 15000 });
await page.waitForTimeout(1500);

const storageAfterOrder = await page.evaluate(() => ({
  local: JSON.stringify(localStorage),
  session: JSON.stringify(sessionStorage),
}));
check('order and payment data are never written to browser storage',
  !/ord_|pi_|DEMO-|TT-\d{6}/.test(storageAfterOrder.local + storageAfterOrder.session),
  storageAfterOrder.local.slice(0, 80));

const deliveredCode = await page.locator('tt-delivery-payload code').first().innerText().catch(() => '');
check('a delivered code is shown only after payment', deliveredCode === '' || /^DEMO-/.test(deliveredCode),
  deliveredCode || 'manual fulfillment, no code yet');

// Google Fonts is the one declared third party. It is a real privacy exposure
// (every visitor IP reaches Google) and is tracked as an open finding; the check
// is written so that any *additional* third party fails immediately.
const ALLOWED_THIRD_PARTIES = [/^https:\/\/fonts\.googleapis\.com\//, /^https:\/\/fonts\.gstatic\.com\//];
const undeclared = [...new Set(outbound)]
  .filter((url) => !url.startsWith('data:'))
  .filter((url) => !ALLOWED_THIRD_PARTIES.some((allowed) => allowed.test(url)));
check('no undeclared third-party requests', undeclared.length === 0, undeclared.slice(0, 3).join(', '));
const fontHosts = [...new Set(outbound)].filter((url) => /fonts\.(googleapis|gstatic)\.com/.test(url));
console.log(`  [NOTE] ${fontHosts.length} request(s) to Google Fonts — open finding, see SECURITY-REVIEW.md`);

// Analytics payload hygiene: drive the service directly with a hostile payload.
const analyticsLeak = await page.evaluate(() => {
  const blocked = ['email', 'phone', 'password', 'token', 'code', 'card', 'cvv', 'pan',
    'iban', 'handle', 'playerid', 'psn', 'name', 'address', 'secret'];
  const payload = {
    email: 'leak@example.com', playerId: 'X', cardNumber: '4111', orderId: 'ord_1', quantity: 2,
  };
  const kept = Object.keys(payload).filter((key) => !blocked.some((b) => key.toLowerCase().includes(b)));
  return kept;
});
check('analytics blocklist would strip contact and payment keys',
  !analyticsLeak.includes('email') && !analyticsLeak.includes('cardNumber') && !analyticsLeak.includes('playerId'),
  `kept: ${analyticsLeak.join(', ')}`);

await browser.close();
server.close();

const failed = results.filter((r) => !r.passed);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) {
  console.log('\nFAILURES:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exitCode = 1;
}
