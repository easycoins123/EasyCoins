/**
 * Renders the social-sharing preview (1200 × 630) from the same design
 * language as the storefront: the wordmark, the headline, the four tier coins
 * and the platforms, on the brand ground. Writes
 * src/assets/brand/social-preview.png, which index.html already references as
 * og:image and twitter:image.
 *
 * The storefront is a static SPA, so the preview is one brand image rather
 * than one per product; it carries no price on purpose, because a static
 * image cannot follow the catalog.
 *
 *   node qa/og-render.mjs
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const OUT = 'src/assets/brand/social-preview.png';
const coins = readFileSync('src/assets/products/coins.svg', 'utf8')
  .replace(/<\?xml[^>]*>/, '')
  .replace(/<svg /, '<svg width="520" height="390" ');

const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;600;700&family=Karantina:wght@700&display=block" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; background: #0C0B09; color: #F6F2EA; font-family: 'Heebo', sans-serif; }
  .ground { position: absolute; inset: 0;
    background:
      radial-gradient(60% 70% at 26% 60%, rgba(212, 180, 106, 0.16), transparent 70%),
      radial-gradient(50% 60% at 82% 20%, rgba(46, 95, 240, 0.10), transparent 70%),
      repeating-linear-gradient(99deg, rgba(255, 248, 235, 0.05) 0 1px, transparent 1px 74px),
      #0C0B09; }
  .wrap { position: absolute; inset: 0; display: grid; grid-template-columns: 1fr 520px; align-items: center; padding: 64px 72px; }
  .copy { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; }
  .brand { display: inline-flex; align-items: center; gap: 10px; font-family: 'Karantina', sans-serif; font-size: 44px; direction: ltr; letter-spacing: 0.02em; }
  .brand b { color: #E6CB86; }
  .kicker { font-size: 20px; font-weight: 700; letter-spacing: 0.1em; color: #ADA69A; text-transform: uppercase; }
  h1 { font-family: 'Karantina', sans-serif; font-weight: 700; font-size: 92px; line-height: 0.94; max-width: 540px; }
  h1 .latin { display: inline; color: #F6F2EA; font-weight: 700; white-space: nowrap; }
  h1 .muted { display: block; color: rgba(246, 242, 234, 0.55); font-weight: 400; }
  .line { display: flex; gap: 10px; margin-top: 8px; }
  .chip { padding: 8px 16px; border: 1px solid rgba(255, 248, 235, 0.22); border-radius: 999px; font-size: 20px; font-weight: 700; color: #ADA69A; }
  .art { position: relative; display: grid; place-items: center; }
  .art svg { filter: drop-shadow(0 30px 40px rgba(0, 0, 0, 0.6)); }
  .rule { position: absolute; left: 72px; right: 72px; bottom: 44px; height: 1px; background: linear-gradient(90deg, transparent, rgba(230, 203, 134, 0.5), transparent); }
</style>
</head>
<body>
  <div class="ground"></div>
  <div class="wrap">
    <div class="copy">
      <div class="brand"><svg width="40" height="40" viewBox="0 0 64 64"><g transform="translate(5,0) skewX(-8)" fill="#D4B46A"><rect x="14" y="12" width="10" height="40" rx="3"/><rect x="14" y="12" width="34" height="10" rx="5"/><rect x="14" y="27" width="26" height="10" rx="5"/><rect x="14" y="42" width="34" height="10" rx="5"/><rect x="3" y="12" width="7" height="10" rx="5" opacity="0.45"/></g></svg><span>EASY<b>COINS</b></span></div>
      <div class="kicker">EA SPORTS FC · Ultimate Team</div>
      <h1>קוינס ל־<span class="latin" dir="ltr">Ultimate Team</span><span class="muted">בלי כאב ראש.</span></h1>
      <div class="line"><span class="chip">PlayStation</span><span class="chip">Xbox</span><span class="chip">PC</span><span class="chip">100K – 2M</span></div>
    </div>
    <div class="art">${coins}</div>
  </div>
  <div class="rule"></div>
</body>
</html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
const png = await page.screenshot({ type: 'png' });
writeFileSync(OUT, png);
await browser.close();
console.log(`wrote ${OUT} (${(png.length / 1024).toFixed(0)} KB)`);
