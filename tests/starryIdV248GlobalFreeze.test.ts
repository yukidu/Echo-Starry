import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stabilizeStarryIdV230ClientSource } from '../worker/starryIdV245BatteryRouter';

const legacyV230 = readFileSync('worker/starryIdV230ClientRouter.ts','utf8');
const batteryV245 = readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');

test('v248 patches every known v230 self-trigger source before serving it', () => {
  const patched = stabilizeStarryIdV230ClientSource(legacyV230);
  assert.notEqual(patched, legacyV230);
  assert.doesNotMatch(patched, /if\(display\)\{display\.textContent=next\|\|'尚未填寫';display\.classList\.toggle\('empty',!next\)\}/);
  assert.match(patched, /if\(display\.textContent!==nextText\)display\.textContent=nextText/);
  assert.doesNotMatch(patched, /new MutationObserver\(sync\)/);
  assert.match(patched, /new MutationObserver\(scheduleSync\)/);
  assert.doesNotMatch(patched, /scheduleRank\(\)\{clearTimeout\(rankTimer\)/);
});

test('v248 battery layer adds no new whole-page MutationObserver', () => {
  const start = batteryV245.indexOf('const CLIENT_SOURCE = `');
  const end = batteryV245.indexOf('export async function handleStarryIdV245Battery');
  const client = batteryV245.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.doesNotMatch(client, /MutationObserver/);
  assert.doesNotMatch(client, /setInterval/);
  assert.match(client, /BOOT_DELAYS=\[0,180,500,1200\]/);
});

test('v248 keeps battery feature routes while removing continuous page watching', () => {
  for (const expected of ['/api/battery-ledger/summary','/api/battery-ledger','/battery-ledger','/starry-id-v245.js']) {
    assert.ok(batteryV245.includes(expected), `missing ${expected}`);
  }
  assert.match(batteryV245, /fieldName='battery'/);
  assert.match(batteryV245, /中央電池餘額，無法手動修改/);
});
