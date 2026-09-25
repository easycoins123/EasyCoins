// FC27 production verification (qa/production-smoke.mjs). Read-only except cart lines in anonymous
// sessions and a checkout details step; it never creates an order or pays.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'https://www.easycoins.co.il';
const OUT = 'qa/screenshots/production-fc27';
mkdirSync(OUT, { recursive: true });
const LADDER = { '100k': 8500, '250k': 20500, '500k': 37500, '750k': 54500, '1m': 69900, '1500k': 102900, '2m': 133900, '3m': 195900, '5m': 319900, '10m': 619900 };
const REPRESENTATIVE = ['100k', '500k', '1m', '2m', '5m'];
const shekels = (minor) => `${(minor / 100).toLocaleString('en-US')}`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`); };
const bust = () => `v=${Date.now()}`;

const browser = await chromium.launch();
{
  const ctx = await browser.newContext();
  const r = ctx.request;
  console.log('== API ==');
  const ready = await (await r.get(`${BASE}/api/v1/ready?${bust()}`)).json();
  check('ready', ready.status === 'ready' && ready.checks?.database?.ok === true);
  const sf = await (await r.get(`${BASE}/api/v1/storefront?${bust()}`)).json();
  check('activeEdition fc27', sf.activeEdition === 'fc27', JSON.stringify(sf.editions));
  check('FC26 retired, FC27 active', sf.editions.find((e) => e.id === 'fc26')?.status === 'retired' && sf.editions.find((e) => e.id === 'fc27')?.status === 'active');
  check('FIRST KICK live with 10% / 100K cap / ₪50 min', sf.launch?.live === true && sf.launch.percentBps === 1000 && sf.launch.capCoins === 100000 && sf.launch.minOrderMinor === 5000, JSON.stringify({ live: sf.launch?.live, starts: sf.launch?.startsAt, ends: sf.launch?.endsAt }));
  const fc27 = await r.get(`${BASE}/api/v1/products/fc27-coins?${bust()}`);
  check('FC27 product answers 200', fc27.ok());
  const detail = await fc27.json();
  const offers = detail.offers ?? [];
  const byKey = {};
  for (const offer of offers) {
    const key = offer.variantId?.split('__').pop();
    (byKey[key] ??= []).push(offer);
  }
  let ladderOk = true;
  for (const [key, price] of Object.entries(LADDER)) {
    const rows = byKey[key] ?? [];
    const platforms = new Set(rows.map((o) => o.platformId));
    const prices = new Set(rows.map((o) => o.priceAmountMinor ?? o.price?.current?.amountMinor ?? o.price?.amountMinor));
    const ok = platforms.size === 4 && prices.size === 1 && prices.has(price) && rows.every((o) => o.active !== false);
    if (!ok) ladderOk = false;
    if (!ok) console.log(`     ${key}: platforms=${[...platforms]} prices=${[...prices]}`);
  }
  check('all 10 rungs × 4 platforms at the authorised prices', ladderOk, `${offers.length} offers`);
  check('1M is ₪699 on every platform', (byKey['1m'] ?? []).length === 4 && (byKey['1m'] ?? []).every((o) => (o.priceAmountMinor ?? o.price?.current?.amountMinor ?? o.price?.amountMinor) === 69900));
  const fc26 = await r.get(`${BASE}/api/v1/products/ea-fc-ultimate-team-coins?${bust()}`);
  const fc26Body = fc26.ok() ? await fc26.json() : null;
  check('FC26 product has no live offers', !fc26.ok() || (fc26Body.offers ?? []).length === 0, `status ${fc26.status()}, ${(fc26Body?.offers ?? []).length} offers`);
  const list = await (await r.get(`${BASE}/api/v1/products?gameIds=game-ea-fc&page=1&pageSize=24&${bust()}`)).json();
  const slugs = (list.items ?? []).map((i) => i.slug);
  check('catalog lists FC27 and not FC26', slugs.includes('fc27-coins') && !slugs.includes('ea-fc-ultimate-team-coins'), slugs.join(','));
  const sitemap = await (await r.get(`${BASE}/sitemap.xml?${bust()}`)).text();
  check('sitemap lists fc27-coins and not the FC26 product', sitemap.includes('/products/fc27-coins') && !sitemap.includes('ea-fc-ultimate-team-coins'));
  console.log('   sitemap hosts: ' + [...new Set((sitemap.match(/<loc>https?:\/\/[^\/<]+/g) ?? []).map((s) => s.replace('<loc>', '')))].join(','));

  // Server-side cart pricing per representative package (anonymous session per package).
  console.log('== SERVER PRICING ==');
  for (const key of REPRESENTATIVE) {
    const offer = (byKey[key] ?? []).find((o) => o.platformId === 'plat-ps5');
    const c = await browser.newContext();
    const res = await c.request.post(`${BASE}/api/v1/cart/validate`, { data: { items: [{ offerId: offer.id, quantity: 1 }] } });
    const body = await res.json();
    const cart = body.cart ?? body;
    const total = cart.totals?.total?.amountMinor;
    const line = cart.items?.[0];
    const kick = (cart.benefits?.applied ?? []).find((b) => b.kind === 'FIRST_ORDER');
    const coins = key.endsWith('m') ? Math.round(parseFloat(key) * 1_000_000) : parseInt(key, 10) * 1000;
    const expectedBonus = Math.min(100000, Math.floor(coins / 10 / 1000) * 1000);
    const kickDiscount = kick?.effect?.discountMinor ?? kick?.effect?.discount?.amountMinor ?? 0;
    check(`${key}: server total ₪${shekels(LADDER[key])}, no discount, FIRST KICK as coins`, total === LADDER[key] && (cart.totals?.discount?.amountMinor ?? 0) === 0 && kick && kick.effect?.coins === expectedBonus && kickDiscount === 0 && cart.benefits?.campaignCoins === expectedBonus, `total ${total}, bonus ${kick?.effect?.coins}, campaignCoins ${cart.benefits?.campaignCoins}, line coins ${line?.coins}`);
    await c.close();
  }
  await ctx.close();
}

for (const width of [390, 1440]) {
  console.log(`\n== ${width}px ==`);
  const context = await browser.newContext({ viewport: { width, height: width < 700 ? 844 : 900 }, locale: 'he-IL' });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  const failed = [];
  const hosts = new Set();
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(BASE, '')}`); });
  page.on('request', (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: */ } });
  const go = async (path) => { await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 }); await page.waitForTimeout(1500); };
  const shot = (name) => page.screenshot({ path: `${OUT}/${width}-${name}.png`, fullPage: true });
  const text = () => page.locator('body').innerText();

  await go('/');
  const title = await page.title();
  const kicker = await page.locator('.kicker').first().innerText().catch(() => '');
  const home = await text();
  const canonical = await page.locator('link[rel="canonical"]').getAttribute('href').catch(() => null);
  const ld = await page.locator('script[type="application/ld+json"]').allInnerTexts();
  check('home title says FC 27', /FC 27/.test(title), title);
  check('home kicker says FC 27', /FC 27/.test(kicker), kicker.trim());
  check('home shows no FC 26 in current-commerce copy', !/FC 26/.test(home));
  check('home shows the FIRST KICK strip', (await page.locator('tt-first-kick-strip').innerText().catch(() => '')).includes('FIRST KICK'));
  check('home shelf shows ₪699 and ₪85', home.includes('699') && home.includes('85'));
  check('canonical is production', canonical === `${BASE}/`, String(canonical));
  check('JSON-LD names FC 27 and the fc27 product URL', ld.some((t) => /FC 27/.test(t)) && ld.some((t) => t.includes('/products/fc27-coins')));
  check('no draft/coming-soon wording', !/בקרוב|coming soon|draft|טיוטה/i.test(home));
  await shot('home');

  await go('/store');
  const store = await text();
  check('store sells FC27 (₪699 present, FC 26 absent)', store.includes('699') && !/FC 26/.test(store));
  await shot('store');

  await go('/products/fc27-coins');
  const chips = page.locator('.chooser--variant .chip');
  check('FC27 product page shows 10 variants', (await chips.count()) === 10, `${await chips.count()} chips`);
  // 1M is the recommended rung; select it and read the price ticket.
  const million = page.locator('.chooser--variant .chip', { hasText: /^1M/ }).first();
  if (await million.count()) { await million.click(); await page.waitForTimeout(500); }
  const productText = await text();
  check('product page prices 1M at ₪699', /699/.test(productText));
  const addResponse = page.waitForResponse((r) => /\/api\/v1\/cart/.test(r.url()) && r.request().method() !== 'GET', { timeout: 45000 }).catch(() => null);
  await page.getByRole('button', { name: 'הוספה לעגלה' }).first().click();
  const added = await addResponse;
  check('add to cart answered', added !== null && added.status() < 400, added ? `${added.status()}` : 'no cart request');
  await shot('product');

  await go('/cart');
  await page.locator('.line').first().waitFor({ timeout: 30000 }).catch(() => undefined);
  const cart = await text();
  const total = await page.locator('.row.total span').nth(1).innerText().catch(() => '');
  check('cart line is FC27 1M at ₪699', (await page.locator('.line').count()) === 1 && /699/.test(total), `total ${total}`);
  check('cart shows FIRST KICK as coins (1.1M received), not a discount', /FIRST KICK/.test(cart) && /1\.1M/.test(cart) && !/−.*699/.test(cart));
  await shot('cart');

  await page.getByRole('button', { name: 'מעבר לתשלום' }).click();
  await page.waitForURL('**/checkout', { timeout: 30000 });
  await page.locator('input[name="FULL_NAME"]').waitFor({ timeout: 45000 }).catch(() => undefined);
  const checkout = await text();
  check('checkout renders the 1M line at ₪699, 1.1M received, FIRST KICK line', /699/.test(checkout) && /FIRST KICK/.test(checkout) && /1\.1M/.test(checkout));
  await shot('checkout');

  const external = [...hosts].filter((h) => !h.endsWith('easycoins.co.il'));
  check('no external asset hosts', external.length === 0, external.join(','));
  check('no failed requests', failed.length === 0, failed.slice(0, 5).join(' | '));
  check('no console or page errors', consoleErrors.length === 0 && pageErrors.length === 0, [...consoleErrors, ...pageErrors].slice(0, 4).join(' | '));
  await context.close();
}
await browser.close();
const failedChecks = results.filter((r) => !r.ok);
console.log(`\n${results.length - failedChecks.length}/${results.length} checks passed`);
process.exit(failedChecks.length ? 1 : 0);
