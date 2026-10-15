import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');

test('v261 menu overlay uses 2px full-page blur, 75 percent dark shade and 50 percent light shade', () => {
  assert.match(menu, /background:rgba\(3,8,18,\.75\);backdrop-filter:blur\(2px\);-webkit-backdrop-filter:blur\(2px\)/);
  assert.match(menu, /html\[data-starry-theme="light"\] \.v256-menu-overlay\{background:rgba\(15,23,42,\.5\)\}/);
});
