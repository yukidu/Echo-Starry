import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const battery = readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');
const menu = readFileSync('worker/starryIdV216Enhancer.ts','utf8');
const navigation = readFileSync('worker/starryIdV253NavigationEnhancer.ts','utf8');

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

test('v255 retires the old v216 ecosystem hamburger menu at its source', () => {
  assert.doesNotMatch(menu, /const APPS=/);
  assert.doesNotMatch(menu, /function openMenu/);
  assert.doesNotMatch(menu, /ledger\.href='\/battery-ledger'/);
  assert.match(menu, /retireLegacyToolbar/);
  assert.match(navigation, /q\('#v216Menu'\)\?\.remove\(\)/);
  assert.match(navigation, /label==='☰'/);
});
