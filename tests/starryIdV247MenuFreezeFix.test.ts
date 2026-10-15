import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const battery = readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');
const menu = readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');

test('v247 battery enhancer no longer owns or rebuilds the main menu', () => {
  assert.doesNotMatch(battery, /function syncMenu\(/);
  assert.doesNotMatch(battery, /menu\.dataset\.v245/);
  assert.doesNotMatch(battery, /for\(const a of qa\(':scope > a',menu\)\)a\.remove\(\)/);
});

test('v248 supersedes the v247 observer exclusions by removing the battery observer entirely', () => {
  const start = battery.indexOf('const CLIENT_SOURCE = `');
  const end = battery.indexOf('export async function handleStarryIdV245Battery');
  const client = battery.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(client, /MutationObserver/);
  assert.match(client, /function finiteSync\(force=false\)/);
});

test('v256 unified menu is the single owner of the restored hamburger and ecosystem links', () => {
  assert.match(menu, /menu\.id='v216Menu'/);
  assert.match(menu, /function openMenu\(\)/);
  assert.match(menu, /v256-menu-panel/);
  assert.match(menu, /電池餘額日誌/);
  assert.match(menu, /https:\/\/id\.starry\.phd\//);
  assert.match(menu, /https:\/\/echo\.starry\.phd\//);
  assert.match(menu, /https:\/\/download\.starry\.phd\//);
  assert.match(menu, /https:\/\/go\.starry\.phd\//);
});
