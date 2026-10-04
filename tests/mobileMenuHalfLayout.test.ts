import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/mobileMenuHalfLayout.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const theme = readFileSync(new URL('../src/utils/theme.ts', import.meta.url), 'utf8');

test('mobile menu layout policy is loaded after the base stylesheet', () => {
  const base = main.indexOf("import './index.css';");
  const menu = main.indexOf("import './mobileMenuHalfLayout.css';");
  assert.ok(base >= 0);
  assert.ok(menu > base);
});

test('mobile drawer stays right aligned, half width, and out of document flow', () => {
  assert.match(css, /position:\s*absolute\s*!important/);
  assert.match(css, /top:\s*100%\s*!important/);
  assert.match(css, /right:\s*0\s*!important/);
  assert.match(css, /width:\s*50vw\s*!important/);
  assert.match(css, /max-width:\s*50vw\s*!important/);
  assert.match(css, /max-height:\s*calc\(100dvh - 64px\)/);
});

test('dark mobile drawer is visually separated from the dark page', () => {
  assert.match(css, /background:\s*linear-gradient\(180deg, rgba\(30, 41, 59, 0\.99\), rgba\(17, 24, 39, 0\.99\)\)\s*!important/);
  assert.match(css, /border-left-color:\s*rgba\(148, 163, 184, 0\.30\)\s*!important/);
  assert.match(css, /-18px 18px 42px rgba\(0, 0, 0, 0\.52\)/);
  assert.match(css, /inset 1px 0 0 rgba\(255, 255, 255, 0\.045\)/);
});

test('menu labels are larger while still wrapping as whole Chinese words', () => {
  assert.match(css, /word-break:\s*keep-all/);
  assert.match(css, /white-space:\s*normal\s*!important/);
  assert.match(css, /font-size:\s*1rem\s*!important/);
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*font-size:\s*0\.9rem\s*!important/);
});

test('notification pending badge is placed on its own row', () => {
  assert.match(css, /button:has\(> div\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /button > div \+ span/);
  assert.match(css, /justify-self:\s*start/);
});

test('install status is positioned under the install label', () => {
  assert.match(css, /button\[aria-label="繁星回聲已安裝"\]/);
  assert.match(css, /button\[aria-label="安裝到桌面"\]/);
  assert.match(css, /grid-template-rows:\s*auto auto/);
  assert.match(css, /span:nth-of-type\(2\)/);
  assert.match(css, /grid-row:\s*2/);
});

test('mobile install entry always keeps a download arrow on the left', () => {
  assert.match(css, /button\[aria-label="繁星回聲已安裝"\]::before/);
  assert.match(css, /mask:\s*url\("data:image\/svg\+xml/);
  assert.match(css, /background-color:\s*currentColor/);
  assert.match(css, /> svg:first-child[\s\S]*display:\s*none\s*!important/);
});

test('palette primary color is synced to browser and standalone PWA chrome', () => {
  assert.match(theme, /querySelector<HTMLMetaElement>\('meta\[name="theme-color"\]'\)/);
  assert.match(theme, /themeColorMeta\.content\s*=\s*palette\.primary/);
});
