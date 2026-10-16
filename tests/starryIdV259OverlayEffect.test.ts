import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');

test('v262 menu overlay uses 4px full-page blur and 80 percent shade in both themes', () => {
  assert.match(menu, /background:rgba\(3,8,18,\.8\);backdrop-filter:blur\(4px\);-webkit-backdrop-filter:blur\(4px\)/);
  assert.match(menu, /html\[data-starry-theme="light"\] \.v256-menu-overlay\{background:rgba\(15,23,42,\.8\)\}/);
});