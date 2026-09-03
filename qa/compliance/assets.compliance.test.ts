/**
 * Asset compliance guard.
 *
 * EasyCoins owns its visual layer. No file in this repository may reference a
 * third-party FC/FUT asset host, an EA asset URL or a player-image endpoint,
 * and the FC player type may never gain an image field. The policy is written
 * up in CONTRIBUTING.md ("Asset policy"); this test is what makes drifting
 * from it fail a build rather than a code review.
 *
 * Run with:  npm run test:compliance
 * (Node's built-in test runner with type stripping; no extra dependency.)
 *
 * This file and CONTRIBUTING.md are the only places allowed to spell out the
 * prohibited names, so both are excluded from the scan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..');
const SELF = fileURLToPath(import.meta.url);
/**
 * The guards themselves: the only files that may spell out the prohibited
 * names, because they exist to detect them. Everything else is scanned.
 */
const GUARD_FILES = new Set([
  SELF,
  join(ROOT, 'CONTRIBUTING.md'),
  join(ROOT, 'qa', 'network-audit.mjs'),
]);

interface Rule { readonly name: string; readonly pattern: RegExp; }

const PROHIBITED: readonly Rule[] = [
  { name: 'FUT.GG', pattern: /fut\.gg/i },
  { name: 'FUTBIN', pattern: /futbin/i },
  { name: 'FUTWIZ', pattern: /futwiz/i },
  { name: 'SoFIFA', pattern: /sofifa/i },
  { name: 'EA Sports asset host', pattern: /easports\.com/i },
  { name: 'FUT game-assets CDN', pattern: /game-assets/i },
  { name: 'FUT web-app API host', pattern: /fut\.ea\.com/i },
  { name: 'UTAS endpoint', pattern: /utas\.[a-z0-9.-]*ea\.com/i },
  { name: 'FutDB image endpoint', pattern: /futdb\.app\/api\/[^\s"'`)]*\/image/i },
  { name: 'EA asset URL', pattern: /https?:\/\/[a-z0-9.-]*\bea\.com\/[^\s"'`)]*\.(?:png|jpe?g|webp|avif|svg|gif)/i },
  { name: 'FUT scraper actor', pattern: /apify\.com\/[^\s"'`)]*(?:futbin|futwiz|transfermarkt)/i },
];

/** Where application code, content and configuration live. */
const SCAN_ROOTS = [
  'src', 'admin/src', 'backend/src', 'backend/prisma', 'backend/test', 'docs', 'qa',
  'angular.json', 'vercel.json', 'package.json', 'README.md',
];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.angular', '.git', 'out', 'screenshots', 'coverage']);
const TEXT_EXTENSIONS = new Set([
  '.ts', '.js', '.mjs', '.cjs', '.json', '.html', '.scss', '.css', '.md', '.svg', '.txt',
  '.yml', '.yaml', '.prisma', '.sql', '.env', '.example', '.xml', '.webmanifest',
]);

function* walk(path: string): Generator<string> {
  const stats = statSync(path);
  if (stats.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) {
      continue;
    }
    yield* walk(join(path, entry));
  }
}

function textFiles(): string[] {
  const files: string[] = [];
  for (const root of SCAN_ROOTS) {
    const absolute = join(ROOT, root);
    if (!existsSync(absolute)) {
      continue;
    }
    for (const file of walk(absolute)) {
      if (GUARD_FILES.has(file)) {
        continue;
      }
      if (TEXT_EXTENSIONS.has(extname(file).toLowerCase())) {
        files.push(file);
      }
    }
  }
  return files;
}

const show = (file: string) => relative(ROOT, file).split(sep).join('/');

test('no prohibited asset hosts or patterns anywhere in source, content or configuration', () => {
  const violations: string[] = [];
  for (const file of textFiles()) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of PROHIBITED) {
        if (rule.pattern.test(line)) {
          violations.push(`${show(file)}:${index + 1}  ${rule.name}`);
        }
      }
    });
  }
  assert.deepEqual(violations, [], `Prohibited asset references:\n  ${violations.join('\n  ')}`);
});

test('the storefront never loads an image from another origin', () => {
  // Product art, brand art and UI art are same-origin files under src/assets.
  // A remote image URL in a template, stylesheet or component is either an
  // asset we do not own or a tracking request; both are out.
  const remoteImage = /(?:url\(\s*['"]?|src\s*=\s*['"]|['"])https?:\/\/[^\s"'`)]+\.(?:png|jpe?g|webp|avif|gif|svg)(?:\?[^\s"'`)]*)?/i;
  const offenders: string[] = [];
  for (const file of textFiles()) {
    if (!show(file).startsWith('src/')) {
      continue;
    }
    if (!['.ts', '.html', '.scss', '.css'].includes(extname(file))) {
      continue;
    }
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (remoteImage.test(line)) {
        offenders.push(`${show(file)}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `Remote image references:\n  ${offenders.join('\n  ')}`);
});

test('FcPlayer is data only: no image, render, portrait, avatar, photo or card-art field', () => {
  const forbidden = /^\s*(?:readonly\s+)?(?:playerImage|cardImage|render|portrait|avatar|photo|cardArt)\??\s*:/;
  const declaration = /(?:interface|type)\s+FcPlayer\b/;
  let declarations = 0;
  const offenders: string[] = [];
  for (const file of textFiles()) {
    if (extname(file) !== '.ts') {
      continue;
    }
    const source = readFileSync(file, 'utf8');
    if (!declaration.test(source)) {
      continue;
    }
    declarations += 1;
    const start = source.search(declaration);
    const open = source.indexOf('{', start);
    let depth = 0;
    let end = open;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] === '}') depth -= 1;
      if (depth === 0) { end = index; break; }
    }
    source.slice(open, end).split(/\r?\n/).forEach((line) => {
      if (forbidden.test(line)) {
        offenders.push(`${show(file)}: ${line.trim()}`);
      }
    });
  }
  assert.ok(declarations > 0, 'FcPlayer type declaration not found; the guard would be vacuous');
  assert.deepEqual(offenders, [], `Image fields on FcPlayer:\n  ${offenders.join('\n  ')}`);
});

test('every product raster asset ships as both AVIF and WebP', () => {
  const dir = join(ROOT, 'src', 'assets', 'products');
  const files = existsSync(dir) ? readdirSync(dir) : [];
  const missing: string[] = [];
  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (ext !== '.avif' && ext !== '.webp') {
      continue;
    }
    const sibling = basename(file, ext) + (ext === '.avif' ? '.webp' : '.avif');
    if (!files.includes(sibling)) {
      missing.push(`${file} has no ${sibling}`);
    }
  }
  assert.deepEqual(missing, [], `Raster pairs incomplete:\n  ${missing.join('\n  ')}`);
});

test('every registered art source points at files that exist', () => {
  const registry = join(ROOT, 'src', 'app', 'ui', 'components', 'cards', 'art-sources.ts');
  assert.ok(existsSync(registry), 'art-sources.ts is missing');
  const source = readFileSync(registry, 'utf8');
  const paths = [...source.matchAll(/(?:avif|webp)\s*:\s*['"]([^'"]+)['"]/g)].map((match) => match[1]);
  const missing = paths.filter((path) => !existsSync(join(ROOT, 'src', path)));
  assert.deepEqual(missing, [], `Registered art files not found under src/:\n  ${missing.join('\n  ')}`);
});
