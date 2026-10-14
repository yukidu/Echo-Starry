import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const battery = readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');
const menu = readFileSync('worker/starryIdV216Enhancer.ts','utf8');

test('v247 battery enhancer no longer owns or rebuilds the main menu', () => {
  assert.doesNotMatch(battery, /function syncMenu\(/);
  assert.doesNotMatch(battery, /menu\.dataset\.v245/);
  assert.doesNotMatch(battery, /for\(const a of qa\(':scope > a',menu\)\)a\.remove\(\)/);
});

test('v247 battery observer ignores main-menu and topbar mutations', () => {
  assert.match(battery, /\.v216-menu,\.topbar/);
  assert.match(battery, /if\(relevant\)scheduleBattery\(\)/);
});

test('v247 v216 menu is the single owner of ecosystem links and battery ledger', () => {
  for (const url of ['https://starry.phd','https://id.starry.phd','https://echo.starry.phd','https://download.starry.phd','https://go.starry.phd','https://quotes.starry.phd','https://box.starry.phd','https://starbeauty.yukidu.workers.dev']) {
    assert.ok(menu.includes(url), `missing ${url}`);
  }
  assert.match(menu, /ledger\.href='\/battery-ledger'/);
  assert.match(menu, /電池餘額日誌/);
});
