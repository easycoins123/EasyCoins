/**
 * Bakes the raster coin art.
 *
 * The SVG drawn by `tt-coin-art` is the visual source of truth. This script
 * takes that exact markup from the running storefront (so the geometry,
 * materials and compositions can never drift from the vector), adds the
 * finishing a live SVG cannot afford on every paint (brushed-metal grain, a
 * specular highlight from the scene's light, a bevelled rim, a soft contact
 * shadow), renders it at 2x on a transparent ground, and encodes AVIF and
 * WebP with sharp. Sizes are printed so the registry and the report can be
 * filled from measurements rather than guesses.
 *
 * What is baked and why:
 *   bundle  one per bundle size, 720 x 576, from the store shelf. The
 *           package cards, at 150-320 CSS px.
 *   card    one per tier, 720 x 576, from the product page with that tier's
 *           variant selected. The quote and the product page.
 *   hero    the trophy, 1200 x 1015, from the home page.
 * Tiles (60-100 CSS px) stay SVG: at that size the vector is sharper and
 * costs no request.
 *
 *   npx ng build --configuration development
 *   node qa/bake-coin-art.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { startServer } from './serve.mjs';

const PORT = 4388;
const BASE = `http://localhost:${PORT}`;
const OUT = 'src/assets/products';
mkdirSync(OUT, { recursive: true });

/** Tier -> the mock variant whose product page shows that tier's card composition. */
const TIER_VARIANTS = { starter: 'prod-fc-coins__100k', pro: 'prod-fc-coins__250k', elite: 'prod-fc-coins__1m', legend: 'prod-fc-coins__2m' };
const PRODUCT = '/products/ea-fc-ultimate-team-coins';

/** The finishing layer, added to the extracted markup at bake time only. */
const FINISH_DEFS = `
  <filter id="bk-metal" x="-15%" y="-15%" width="130%" height="130%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.02 0.7" numOctaves="2" seed="11" result="noise"/>
    <feColorMatrix in="noise" type="matrix"
      values="0 0 0 0 0.55  0 0 0 0 0.55  0 0 0 0 0.55  0 0 0 0.42 0" result="grain"/>
    <feBlend in="SourceGraphic" in2="grain" mode="overlay" result="brushed"/>
    <feComposite in="brushed" in2="SourceGraphic" operator="in" result="brushedClipped"/>
    <feSpecularLighting in="SourceAlpha" surfaceScale="2.5" specularConstant="0.85" specularExponent="24"
      lighting-color="#FFFFFF" result="spec">
      <fePointLight x="30" y="-70" z="150"/>
    </feSpecularLighting>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specClipped"/>
    <feComposite in="specClipped" in2="brushedClipped" operator="arithmetic" k1="0" k2="0.5" k3="1" k4="0"/>
  </filter>
  <filter id="bk-soft" x="-30%" y="-80%" width="160%" height="260%">
    <feGaussianBlur stdDeviation="2.6"/>
  </filter>
  <linearGradient id="bk-bevel" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.8"/>
    <stop offset="0.5" stop-color="#FFFFFF" stop-opacity="0.06"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.6"/>
  </linearGradient>`;

const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}="([^"]+)"`)) || [])[1];

/** Adds the finishing layer to one extracted SVG. Pure string work on our own markup. */
function finish(svg, width, height) {
  let out = svg
    .replace(/<svg\b[^>]*>/, (open) => open
      .replace(/\s(?:class|role|aria-hidden|focusable)="[^"]*"/g, '')
      .replace(/<svg/, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"`))
    .replace(/<defs>/, `<defs>${FINISH_DEFS}`);

  // The stage light, the rays and the sparks stay vector in the component
  // (drawn live behind the raster): a translucent gradient bands badly once
  // quantised to 8-bit alpha, and it should recolour with the theme anyway.
  out = out
    .replace(/<ellipse\b[^>]*fill="url\(#[^)]*-light\)"[^>]*>(?:<\/ellipse>)?/, '')
    .replace(/<g\b[^>]*class="rays"[^>]*>[\s\S]*?<\/g>/, '')
    .replace(/<g\b[^>]*>(?:\s*<circle\b[^>]*>(?:<\/circle>)?\s*)+<\/g>/g, '');

  // Faces (lying ellipses and the facing circle): grain, highlight, bevel.
  out = out.replace(/<ellipse\b[^>]*fill="url\(#[^)]*-face\)"[^>]*>(?:<\/ellipse>)?/g, (tag) => {
    const cx = attr(tag, 'cx'); const cy = attr(tag, 'cy'); const rx = Number(attr(tag, 'rx')); const ry = Number(attr(tag, 'ry'));
    const filtered = tag.replace(/<ellipse/, '<ellipse filter="url(#bk-metal)"');
    const bevel = `<ellipse cx="${cx}" cy="${cy}" rx="${(rx - 0.9).toFixed(2)}" ry="${(ry - 0.5).toFixed(2)}" fill="none" stroke="url(#bk-bevel)" stroke-width="1.5" opacity="0.75"></ellipse>`;
    return filtered + bevel;
  });
  out = out.replace(/<circle\b[^>]*fill="url\(#[^)]*-face\)"[^>]*>(?:<\/circle>)?/g, (tag) => {
    const cx = attr(tag, 'cx'); const cy = attr(tag, 'cy'); const r = Number(attr(tag, 'r'));
    const filtered = tag.replace(/<circle/, '<circle filter="url(#bk-metal)"');
    const bevel = `<circle cx="${cx}" cy="${cy}" r="${(r - 1).toFixed(2)}" fill="none" stroke="url(#bk-bevel)" stroke-width="2" opacity="0.8"></circle>`;
    return filtered + bevel;
  });
  // The contact shadow softens.
  out = out.replace(/<ellipse\b([^>]*fill="#000"[^>]*opacity="0\.42"[^>]*)>/, '<ellipse filter="url(#bk-soft)"$1>');
  return out;
}

const server = await startServer(PORT);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

const jobs = [];

// Bundle compositions from the store shelf, smallest first.
await page.goto(`${BASE}/store?platform=plat-ps5&art=vector`, { waitUntil: 'networkidle' });
await page.locator('tt-easycoins-card').first().waitFor();
const shelf = await page.locator('tt-easycoins-card').evaluateAll((cards) => cards.map((card) => ({
  amount: card.querySelector('.amount')?.textContent?.trim().toLowerCase() ?? '',
  svg: card.querySelector('tt-coin-art svg')?.outerHTML ?? '',
})));
for (const card of shelf) {
  if (card.svg) jobs.push({ file: `bundle-${card.amount}`, svg: card.svg, width: 720, height: 576 });
}

// Card compositions per tier, from the product page.
for (const [tier, variant] of Object.entries(TIER_VARIANTS)) {
  await page.goto(`${BASE}${PRODUCT}/${variant}?art=vector`, { waitUntil: 'networkidle' });
  const svg = await page.locator('.media tt-coin-art svg').first().evaluate((node) => node.outerHTML);
  jobs.push({ file: `coins-${tier}`, svg, width: 720, height: 576 });
}

// The hero, from the home page.
await page.goto(`${BASE}/?art=vector`, { waitUntil: 'networkidle' });
const heroSvg = await page.locator('tt-hero-scene .object svg').first().evaluate((node) => node.outerHTML);
jobs.push({ file: 'coins-legend-hero', svg: heroSvg, width: 1200, height: 1015, hero: true });

const rows = [];
for (const job of jobs) {
  const svg = finish(job.svg, job.width, job.height);
  const render = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: 1 });
  await render.setContent(`<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
  await render.waitForTimeout(150);
  const png = await render.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width: job.width, height: job.height } });
  await render.close();

  const avif = await sharp(png).avif({ quality: 56, effort: 8, chromaSubsampling: '4:2:0' }).toBuffer();
  const webp = await sharp(png).webp({ quality: job.hero ? 76 : 78, alphaQuality: 88, effort: 6 }).toBuffer();
  writeFileSync(`${OUT}/${job.file}.avif`, avif);
  writeFileSync(`${OUT}/${job.file}.webp`, webp);
  writeFileSync(`qa/screenshots/bake-${job.file}.png`, png);
  rows.push({ file: job.file, width: job.width, height: job.height, avif: avif.length, webp: webp.length, png: png.length });
}

await browser.close();
server.close();

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log('\nfile                   size        AVIF       WebP       (PNG source)');
for (const row of rows) {
  console.log(`${row.file.padEnd(22)} ${`${row.width}x${row.height}`.padEnd(11)} ${kb(row.avif).padEnd(10)} ${kb(row.webp).padEnd(10)} ${kb(row.png)}`);
}
console.log(`total AVIF ${kb(rows.reduce((sum, row) => sum + row.avif, 0))}, total WebP ${kb(rows.reduce((sum, row) => sum + row.webp, 0))}`);
