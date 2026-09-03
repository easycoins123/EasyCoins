/**
 * Bakes the FUT coin artwork from the approved masters in docs/design/source.
 *
 *   node qa/bake-fut-art.mjs            # writes src/assets/products/fut-*.{avif,webp}
 *   node qa/bake-fut-art.mjs --sheet    # also writes qa/out/fut-contact-sheet.png for review
 *
 * Two masters: the hero render (transparent) and a 3x3 sheet of compositions
 * rendered on black. Sheet tiles are keyed to transparency from their own
 * brightness (the background is pure black; the coins never are), trimmed,
 * and placed on a consistent 3:2 canvas so every package sits on the same
 * floor line. Everything is written as AVIF with a WebP fallback and the
 * intrinsic sizes below are what the art registry declares.
 */
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'docs/design/source';
const OUT = 'src/assets/products';
const WANT_SHEET = process.argv.includes('--sheet');

/** Sheet tiles by row and column, and what each becomes. */
const TILES = {
  'fut-100k': { row: 0, col: 0 }, // one standing coin
  'fut-250k': { row: 2, col: 2 }, // a coin leaning on a short stack
  'fut-500k': { row: 0, col: 1 }, // a coin against a four-high stack
  'fut-1m': { row: 2, col: 0 }, // two tall stacks
  'fut-coin': { row: 1, col: 0, cropTop: 0.3 }, // one coin lying flat: the product image (the bloom above it is cut)
  'fut-stadium': { row: 1, col: 2, feather: true }, // a coin under the floodlights, edges dissolved
  'fut-podium': { row: 2, col: 1 }, // a coin on the plinth
};

/* 448 px is two device pixels for a desktop card and nearly three for a
   phone card; the sheet is grainy, so a touch of blur before encoding costs
   nothing visible and halves the file. The WebP fallback is encoded a size
   down: it only serves browsers without AVIF. */
const TILE_W = 448;
const TILE_H = 299;
const SOFTEN = 0.4;

/** Alpha from brightness: black stays out, the coin and its bloom stay in. */
async function matte(image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const lo = 6;
  const hi = 44;
  for (let i = 0; i < out.length; i += 4) {
    const max = Math.max(out[i], out[i + 1], out[i + 2]);
    const t = Math.min(1, Math.max(0, (max - lo) / (hi - lo)));
    out[i + 3] = Math.round(255 * (t * t * (3 - 2 * t)));
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

/** Dissolves the edges of a scene that has a real background, so it never reads as a pasted rectangle. */
async function feather(image) {
  const { data, info } = await image.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.from(data);
  const cx = info.width / 2;
  const cy = info.height / 2;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const t = Math.min(1, Math.max(0, (r - 0.55) / 0.45));
      const keep = 1 - t * t * (3 - 2 * t);
      const i = (y * info.width + x) * 4;
      out[i + 3] = Math.round(out[i + 3] * keep);
    }
  }
  return sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } });
}

/** Trims the transparent margin and sets the object on a 3:2 canvas, resting near the floor. */
async function frame(image, width = TILE_W, height = TILE_H, fill = 0.94) {
  const trimmed = await image.png().toBuffer();
  const cut = await sharp(trimmed).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(cut).metadata();
  const scale = Math.min((width * fill) / meta.width, (height * fill) / meta.height, 1);
  const w = Math.round(meta.width * scale);
  const h = Math.round(meta.height * scale);
  const resized = await sharp(cut).resize(w, h, { fit: 'inside', kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: resized, left: Math.round((width - w) / 2), top: Math.round(height - h - (height - h) / 2) }]);
}

async function write(image, name, { avif = 40, webp = 58, webpWidth } = {}) {
  const png = await image.png().toBuffer();
  await sharp(png).blur(SOFTEN).avif({ quality: avif, effort: 6 }).toFile(join(OUT, `${name}.avif`));
  const fallback = webpWidth ? sharp(png).resize({ width: webpWidth }) : sharp(png);
  await fallback.blur(SOFTEN).webp({ quality: webp, alphaQuality: 80, effort: 6 }).toFile(join(OUT, `${name}.webp`));
  const meta = await sharp(png).metadata();
  const a = statSync(join(OUT, `${name}.avif`)).size;
  const w = statSync(join(OUT, `${name}.webp`)).size;
  console.log(`${name.padEnd(14)} ${meta.width}x${meta.height}  avif ${(a / 1024).toFixed(1)} KB  webp ${(w / 1024).toFixed(1)} KB`);
  return png;
}

mkdirSync(OUT, { recursive: true });
const sheet = sharp(join(SRC, 'fut-sheet-master.webp'));
const sheetMeta = await sheet.metadata();
const cellW = Math.floor(sheetMeta.width / 3);
const cellH = Math.floor(sheetMeta.height / 3);
const baked = {};

for (const [name, { row, col, cropTop = 0, feather: soft = false }] of Object.entries(TILES)) {
  const top = row * cellH + Math.round(cellH * cropTop);
  const cell = sharp(join(SRC, 'fut-sheet-master.webp')).extract({ left: col * cellW, top, width: cellW, height: cellH - Math.round(cellH * cropTop) });
  const keyed = soft ? await feather(await matte(cell)) : await matte(cell);
  const framed = await frame(keyed, TILE_W, TILE_H, soft ? 1 : 0.94);
  baked[name] = await write(framed, name, { webp: 55, webpWidth: 360 });
}

// 2M: the two-stack composition with a second, mirrored pair set back behind
// it, so the largest package visibly holds the most metal.
{
  const base = sharp(baked['fut-1m']);
  const behind = await sharp(baked['fut-1m']).flop().resize(Math.round(TILE_W * 0.86)).modulate({ brightness: 0.72 }).png().toBuffer();
  const behindMeta = await sharp(behind).metadata();
  const composed = sharp({ create: { width: TILE_W, height: TILE_H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: behind, left: Math.round(TILE_W - behindMeta.width) + 40, top: Math.round(TILE_H - behindMeta.height) - 26 },
      { input: await base.png().toBuffer(), left: -36, top: 0 },
    ]);
  baked['fut-2m'] = await write(composed, 'fut-2m', { webp: 55, webpWidth: 360 });
}

// Hero: the transparent master. 960 px is 1.6 device pixels at the desktop
// hero's 600 CSS px and 2.7 at a phone's 350 CSS px.
{
  const hero = sharp(join(SRC, 'fut-hero-master.webp'));
  const trimmed = await hero.trim({ threshold: 6 }).png().toBuffer();
  baked['fut-hero'] = await write(sharp(trimmed).resize({ width: 960, kernel: 'lanczos3' }), 'fut-hero', { avif: 46, webp: 58, webpWidth: 720 });
}

// Thumbnail: the flat coin at cart size.
baked['fut-thumb'] = await write(sharp(baked['fut-coin']).resize({ width: 240 }), 'fut-thumb', { avif: 50, webp: 66 });

if (WANT_SHEET) {
  mkdirSync('qa/out', { recursive: true });
  const names = Object.keys(baked);
  const cols = 4;
  const cell = 400;
  const rows = Math.ceil(names.length / cols);
  const tiles = [];
  for (const [index, name] of names.entries()) {
    const img = await sharp(baked[name]).resize({ width: cell - 20, height: Math.round((cell - 20) * 0.75), fit: 'inside' }).png().toBuffer();
    const meta = await sharp(img).metadata();
    tiles.push({ input: img, left: (index % cols) * cell + 10 + Math.round((cell - 20 - meta.width) / 2), top: Math.floor(index / cols) * Math.round(cell * 0.8) + 10 });
  }
  await sharp({ create: { width: cols * cell, height: rows * Math.round(cell * 0.8), channels: 4, background: '#14120F' } })
    .composite(tiles).png().toFile('qa/out/fut-contact-sheet.png');
  console.log('contact sheet: qa/out/fut-contact-sheet.png');
}
