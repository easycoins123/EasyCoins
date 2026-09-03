/**
 * EasyCoins card visual regression.
 *
 * Renders the store shelf at a phone and a desktop width, checks that all four
 * tiers appear and that each card carries its facts as text (amount, platform,
 * price, action), that nothing overflows, that the coin art painted, and saves
 * a screenshot of every card per tier, per platform and per width under
 * qa/screenshots/cards/ for eyeballing and for diffing between rounds.
 *
 *   node qa/card-visual.mjs [port]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

const PORT = Number(process.argv[2] ?? 4377);
const BASE = `http://localhost:${PORT}`;
const OUT = 'qa/screenshots/cards';
const server = await startServer(PORT);

const WIDTHS = [320, 390, 768, 1440];
const TIERS = ['starter', 'pro', 'elite', 'legend'];
const PLATFORMS = [
  { id: 'plat-ps5', label: 'PS5' },
  { id: 'plat-xbox', label: 'Xbox' },
  { id: 'plat-pc', label: 'PC' },
];

const browser = await chromium.launch();
const failures = [];
let checks = 0;
const check = (name, ok, detail = '') => {
  checks += 1;
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name + (detail ? ' — ' + detail : ''));
};
const manifest = [];

for (const width of WIDTHS) {
  console.log(`\n== ${width}px ==`);
  mkdirSync(`${OUT}/${width}`, { recursive: true });
  const page = await browser.newPage({ viewport: { width, height: width < 700 ? 844 : 900 } });

  for (const platform of PLATFORMS) {
    await page.goto(`${BASE}/store?platform=${platform.id}`, { waitUntil: 'networkidle' });
    await page.locator('tt-easycoins-card').first().waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    const cards = page.locator('tt-easycoins-card');
    const count = await cards.count();
    const label = `${width}px ${platform.label}`;

    check(`${label}: five bundles on the shelf`, count === 5, `${count} cards`);
    const tiers = await page.locator('tt-easycoins-card article[data-tier]').evaluateAll((nodes) => nodes.map((node) => node.dataset.tier));
    check(`${label}: all four tiers present`, TIERS.every((tier) => tiers.includes(tier)), tiers.join(', '));
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    check(`${label}: no horizontal overflow`, scrollWidth <= width, `scrollWidth ${scrollWidth}`);

    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      // The art is requested when a card comes near the viewport; bring each
      // card into view the way a visitor would before judging it.
      await card.scrollIntoViewIfNeeded();
      await card.locator("tt-coin-art img, tt-coin-art svg").first().waitFor({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(150);
      const facts = await card.evaluate((node) => {
        const text = (selector) => node.querySelector(selector)?.textContent?.trim() ?? '';
        const svg = node.querySelector('tt-coin-art svg, tt-coin-art img');
        const box = svg?.getBoundingClientRect();
        const button = node.querySelector('button.buy');
        return {
          tier: node.querySelector('article')?.dataset.tier,
          amount: text('.amount'),
          platform: text('.platform'),
          price: text('.tt-price'),
          cta: button?.textContent?.trim() ?? '',
          ctaEnabled: button ? !button.disabled : false,
          artPainted: Boolean(box && box.width > 20 && box.height > 20),
          tierLabel: text('.tier'),
        };
      });
      const name = `${facts.tier}-${index}`;
      check(`${label} ${name}: amount, platform, price and action are text`,
        /\d/.test(facts.amount) && facts.platform.includes(platform.label) && /₪|\d/.test(facts.price) && facts.cta.length > 0,
        `${facts.amount} · ${facts.platform} · ${facts.price} · ${facts.cta}`);
      check(`${label} ${name}: coin art painted and action enabled`, facts.artPainted && facts.ctaEnabled);

      const file = `${OUT}/${width}/${platform.label.toLowerCase()}-${name}.png`;
      await card.screenshot({ path: file });
      manifest.push({ width, platform: platform.label, ...facts, file });
    }
  }
  await page.close();
}

writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
await browser.close();
server.close();

console.log(`\n${checks - failures.length}/${checks} checks passed; ${manifest.length} card screenshots in ${OUT}/`);
if (failures.length > 0) {
  console.log('Failures:');
  for (const failure of failures) console.log('  - ' + failure);
  process.exit(1);
}
