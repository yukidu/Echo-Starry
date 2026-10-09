import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const fix = readFileSync(new URL('../src/v147NavbarOverlayFix.ts', import.meta.url), 'utf8');
const navbarCss = readFileSync(new URL('../src/components/Navbar.css', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v147 keeps the custom home filter toolbar below the sticky navbar stacking layer', () => {
  assert.match(navbarCss, /\.mobile-menu-shell\s*\{[\s\S]*?z-index:\s*50/);
  assert.match(fix, /\.v145-filter-toolbar\s*\{[\s\S]*?z-index:\s*30\s*!important/);
  assert.match(fix, /\.v145-filter-menu\s*\{[\s\S]*?z-index:\s*35\s*!important/);
});

test('v147 overlay correction loads after the v145 filter toolbar layer', () => {
  const toolbar = indexHtml.indexOf('/src/v145FourFilterToolbar.ts');
  const overlayFix = indexHtml.indexOf('/src/v147NavbarOverlayFix.ts');
  assert.ok(toolbar >= 0);
  assert.ok(overlayFix > toolbar);
});
