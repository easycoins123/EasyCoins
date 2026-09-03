/**
 * Bakes the world's one raster: the crowd, out of focus.
 *
 * A stadium crowd at night from pitch level is a field of soft points of
 * light in tiers, warmer low down where the floodlights bounce and cooler
 * high up. Drawing that live would be a hundred blurred elements; baked once
 * it is a single transparent AVIF of a few kilobytes. Deterministic seed, so
 * a rebake reproduces the same crowd.
 *
 *   node qa/bake-stadium.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const OUT = 'src/assets/ui';
mkdirSync(OUT, { recursive: true });
const WIDTH = 640;
const HEIGHT = 280;

const html = `<!doctype html><html><head><style>html,body{margin:0;background:transparent}canvas{display:block}</style></head>
<body><canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas>
<script>
  // Mulberry32: small, deterministic.
  let seed = 20260903;
  const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const ctx = document.getElementById('c').getContext('2d');
  const W = ${WIDTH}, H = ${HEIGHT};
  const warm = [247, 235, 203], cool = [214, 226, 255], blue = [156, 178, 224];
  // Out of focus: everything is drawn through a blur and adds up as light.
  ctx.globalCompositeOperation = 'lighter';
  ctx.filter = 'blur(3px)';
  // Tiers of seats: four bands, denser and dimmer as they rise, larger and
  // softer as they come nearer.
  const bands = [
    { y0: 0.02, y1: 0.24, n: 120, r: [2, 5], a: 0.10 },
    { y0: 0.22, y1: 0.46, n: 140, r: [3, 7], a: 0.13 },
    { y0: 0.44, y1: 0.70, n: 120, r: [4, 9], a: 0.15 },
    { y0: 0.68, y1: 0.94, n: 70, r: [5, 12], a: 0.12 },
  ];
  for (const band of bands) {
    for (let i = 0; i < band.n; i++) {
      const x = rnd() * W;
      const y = H * (band.y0 + rnd() * (band.y1 - band.y0));
      const r = band.r[0] + rnd() * (band.r[1] - band.r[0]);
      const mix = rnd();
      const c = mix < 0.55 ? warm : mix < 0.85 ? cool : blue;
      const alpha = band.a * (0.5 + rnd() * 0.7);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(' + c.join(',') + ',' + alpha + ')');
      g.addColorStop(0.4, 'rgba(' + c.join(',') + ',' + (alpha * 0.5) + ')');
      g.addColorStop(1, 'rgba(' + c.join(',') + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  // A few sharper points: phones held up in the stands.
  ctx.filter = 'blur(1.2px)';
  for (let i = 0; i < 28; i++) {
    const x = rnd() * W, y = H * (0.05 + rnd() * 0.7), r = 0.8 + rnd() * 1.2;
    ctx.fillStyle = 'rgba(240, 244, 255,' + (0.35 + rnd() * 0.35) + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
</script></body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
await page.setContent(html);
await page.waitForTimeout(100);
const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
await browser.close();

// Blurred light survives a smaller canvas untouched; encode at 1200 wide.
const scaled = sharp(png);
const avif = await scaled.clone().avif({ quality: 30, effort: 8, chromaSubsampling: '4:2:0' }).toBuffer();
const webp = await scaled.clone().webp({ quality: 62, alphaQuality: 80, effort: 6 }).toBuffer();
writeFileSync(`${OUT}/stadium-bokeh.avif`, avif);
writeFileSync(`${OUT}/stadium-bokeh.webp`, webp);
writeFileSync('qa/screenshots/bake-stadium-bokeh.png', png);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log(`stadium-bokeh ${WIDTH}x${HEIGHT}  AVIF ${kb(avif.length)}  WebP ${kb(webp.length)}  (PNG ${kb(png.length)})`);
