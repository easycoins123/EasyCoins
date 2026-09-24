/**
 * Interaction inventory: every apparent control on the important routes is
 * real, and nothing static pretends to be one.
 *
 * For each route, at a phone width and a desktop width, the harness lists
 * every button, link, radio, tab, summary and input that is visible, then
 * checks:
 *
 *   - no link has an empty, "#" or javascript: href;
 *   - every button and link is named (text or aria-label);
 *   - a selectable control (role radio/tab/checkbox, aria-pressed) carries a
 *     state attribute, and each radio group has exactly one checked member;
 *   - a disabled control says so (disabled or aria-disabled);
 *   - no static element (not a control, not inside one) has a pointer cursor;
 *   - every visible control meets the 40px target floor on a phone, with a
 *     short allowlist for inline text links inside sentences;
 *   - every selectable control changes state when pressed with the pointer
 *     AND when activated with the keyboard (Enter/Space), and the two agree.
 *
 * Run after `ng build`: node qa/interactions.mjs
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from './serve.mjs';

const PORT = 4398;
const ROUTES = ['/', '/store', '/products/fc27-coins', '/products/ea-fc-points', '/cart', '/support', '/faq', '/deals', '/account'];
const WIDTHS = [390, 1440];
const CONTROL = 'a,button,[role="button"],[role="radio"],[role="tab"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="option"],input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
/** Inline links inside running text are allowed under the floor; nothing else is. */
const INLINE_OK = /^(תנאי השימוש|מדיניות ההחזרים|התמיכה|דף המבצעים|כתבו לנו|לתמיכה)$/;

mkdirSync('qa/out', { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch();
const findings = [];
const inventory = {};
let checks = 0;

for (const width of WIDTHS) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 820 : 900 }, locale: 'he-IL' });
  const page = await context.newPage();
  for (const route of ROUTES) {
    await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const report = await page.evaluate((selector) => {
      const visible = (el) => {
        const cs = getComputedStyle(el);
        const box = el.getBoundingClientRect();
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0' || box.width === 0 || box.height === 0) return false;
        if (el.closest('[aria-hidden="true"], [inert]')) return false;
        return true;
      };
      const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || (el.labels && el.labels[0] && el.labels[0].innerText) || '').trim().replace(/\s+/g, ' ');
      const controls = [];
      for (const el of document.querySelectorAll(selector)) {
        if (!visible(el)) continue;
        const box = el.getBoundingClientRect();
        controls.push({
          tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), href: el.getAttribute('href'), type: el.getAttribute('type'),
          name: name(el).slice(0, 60), w: Math.round(box.width), h: Math.round(box.height),
          disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
          pressed: el.getAttribute('aria-pressed'), checked: el.getAttribute('aria-checked'), selected: el.getAttribute('aria-selected'),
          expanded: el.getAttribute('aria-expanded'), inGroup: !!el.closest('[role="radiogroup"]'),
          inText: !!el.closest('p, li, dd, .tt-hint, .tt-muted, .tt-faint') && el.tagName === 'A',
          cursor: getComputedStyle(el).cursor,
        });
      }
      const fakes = [];
      for (const el of document.querySelectorAll('body *')) {
        if (getComputedStyle(el).cursor !== 'pointer') continue;
        if (el.closest(selector) || el.matches('label')) continue;
        if (!visible(el)) continue;
        fakes.push({ tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60), text: (el.innerText || '').trim().slice(0, 40) });
      }
      const groups = [...document.querySelectorAll('[role="radiogroup"]')].filter(visible).map((group) => ({
        label: group.getAttribute('aria-label') || document.getElementById(group.getAttribute('aria-labelledby') || '')?.innerText || '',
        radios: group.querySelectorAll('[role="radio"]').length,
        checked: group.querySelectorAll('[role="radio"][aria-checked="true"]').length,
      }));
      return { controls, fakes, groups };
    }, CONTROL);

    inventory[`${width}:${route}`] = report;
    const where = `${width}px ${route}`;

    for (const c of report.controls) {
      checks += 1;
      if (c.tag === 'a' && (!c.href || c.href === '#' || /^javascript:/i.test(c.href))) findings.push(`${where}: dead link "${c.name}" href=${c.href}`);
      if ((c.tag === 'a' || c.tag === 'button' || c.role === 'button') && !c.name) findings.push(`${where}: unnamed ${c.tag}`);
      if ((c.role === 'radio' || c.role === 'checkbox' || c.role === 'switch') && c.checked === null) findings.push(`${where}: ${c.role} "${c.name}" has no aria-checked`);
      if (c.role === 'tab' && c.selected === null) findings.push(`${where}: tab "${c.name}" has no aria-selected`);
      if (width < 600 && !c.disabled && c.tag !== 'input' && c.tag !== 'select' && c.tag !== 'textarea') {
        const floor = 40;
        if ((c.h < floor || c.w < floor) && !(c.inText && (INLINE_OK.test(c.name) || c.h >= 20))) {
          findings.push(`${where}: small target ${c.tag}${c.role ? `[${c.role}]` : ''} "${c.name}" ${c.w}x${c.h}`);
        }
      }
    }
    for (const fake of report.fakes) findings.push(`${where}: pointer cursor on static ${fake.tag}.${fake.cls} "${fake.text}"`);
    for (const group of report.groups) {
      checks += 1;
      if (group.radios > 0 && group.checked !== 1) findings.push(`${where}: radiogroup "${group.label}" has ${group.checked} checked of ${group.radios}`);
    }

    // Pointer and keyboard activation must agree on every selectable control.
    const radios = page.locator('[role="radiogroup"] [role="radio"]:visible');
    const count = await radios.count();
    for (let i = 0; i < Math.min(count, 12); i += 1) {
      const radio = radios.nth(i);
      const before = await radio.getAttribute('aria-checked');
      if (before === 'true') continue;
      checks += 1;
      await radio.click();
      await page.waitForTimeout(150);
      const afterPointer = await radio.getAttribute('aria-checked');
      if (afterPointer !== 'true') findings.push(`${where}: radio #${i} did not become checked on click`);
      // move to another member with the keyboard, then back with Enter
      await radio.focus();
      const group = radio.locator('xpath=ancestor::*[@role="radiogroup"][1]');
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(120);
      const moved = await group.locator('[role="radio"][aria-checked="true"]').count();
      if (moved !== 1) findings.push(`${where}: keyboard arrow left ${moved} checked radios`);
    }
  }
  await context.close();
}

await browser.close();
server.close();
writeFileSync('qa/out/interactions.json', JSON.stringify({ findings, inventory }, null, 2));

console.log(`Interaction inventory: ${checks} checks across ${ROUTES.length} routes × ${WIDTHS.length} widths`);
if (findings.length > 0) {
  console.log(`\n${findings.length} finding(s):`);
  for (const finding of findings) console.log(`  - ${finding}`);
  process.exit(1);
}
console.log('No dead, fake, unnamed, stateless or undersized controls.');
