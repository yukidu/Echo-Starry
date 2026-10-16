import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const menu = readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');

test('v267 menu overlay uses 1px blur, 40 percent dark shade and 30 percent light shade', () => {
  assert.match(menu, /background:rgba\(3,8,18,\.4\);backdrop-filter:blur\(1px\);-webkit-backdrop-filter:blur\(1px\)/);
  assert.match(menu, /html\[data-starry-theme="light"\] \.v256-menu-overlay\{background:rgba\(15,23,42,\.3\)\}/);
});