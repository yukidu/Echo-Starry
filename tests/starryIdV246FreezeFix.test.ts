import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');

test('v248 battery client no longer observes the whole Starry ID document', () => {
  const client = source.split('const CLIENT_SOURCE = `')[1]?.split('`;

export async function handleStarryIdV245Battery')[0] || '';
  assert.doesNotMatch(client, /new MutationObserver/);
  assert.doesNotMatch(client, /observe\(document\.documentElement/);
});

test('v248 battery refresh is finite and event driven', () => {
  assert.match(source, /const BOOT_DELAYS=\[0,180,500,1200\]/);
  assert.match(source, /function finiteSync\(force=false\)/);
  assert.match(source, /closest\?\.\('\.member-item'\)/);
  assert.match(source, /window\.addEventListener\('pageshow'/);
});

test('v248 battery DOM writes remain idempotent', () => {
  assert.match(source, /if\(v&&v\.textContent!==nextText\)v\.textContent=nextText/);
  assert.match(source, /if\(button\.textContent!==icon\)button\.textContent=icon/);
  assert.match(source, /function paintEye\(button,visible\)/);
});

test('v248 intercepts the legacy v230 client so its global observer cannot self-spin', () => {
  assert.match(source, /handleStarryIdV230Client/);
  assert.match(source, /stabilizeStarryIdV230ClientSource/);
  assert.match(source, /url\.pathname === '\/starry-id-v230\.js'/);
  assert.match(source, /if\(display\.textContent!==nextText\)display\.textContent=nextText/);
  assert.match(source, /function scheduleSync\(\)\{if\(observerTimer\)return;/);
  assert.match(source, /function scheduleRank\(\)\{if\(rankTimer\)return;/);
});
