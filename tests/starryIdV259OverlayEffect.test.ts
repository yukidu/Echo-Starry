import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');

test('v259 menu overlay uses 2px full-page blur and 50 percent shade in both themes', () => {
  assert.match(menu, /background:rgba\(3,8,18,\.5\);backdrop-filter:blur\(2px\);-webkit-backdrop-filter:blur\(2px\)/);
  assert.match(menu, /html\[data-starry-theme="light"\] \.v256-menu-overlay\{background:rgba\(15,23,42,\.5\)\}/);
});
