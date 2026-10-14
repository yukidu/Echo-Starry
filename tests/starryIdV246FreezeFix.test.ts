import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');

test('v246 battery sync no longer observes class and hidden attribute churn', () => {
  assert.match(source, /observe\(document\.documentElement,\{childList:true,subtree:true\}\)/);
  assert.doesNotMatch(source, /attributeFilter:\['class','hidden'\]/);
});

test('v246 scheduler coalesces mutations without repeated clearTimeout starvation', () => {
  assert.match(source, /function scheduleBattery\(\)\{if\(timer\)return;/);
  assert.doesNotMatch(source, /clearTimeout\(timer\);timer=setTimeout\(syncBattery/);
});

test('v246 ignores battery card and feedback mutations caused by itself', () => {
  assert.match(source, /closest\?\.\('\[data-v245-battery="1"\],\.v245-feedback'\)/);
});

test('v246 DOM writes are idempotent so observer cannot self-loop', () => {
  assert.match(source, /if\(v\.textContent!==nextText\)v\.textContent=nextText/);
  assert.match(source, /if\(button\.textContent!==icon\)button\.textContent=icon/);
  assert.match(source, /function paintEye\(button,visible\)/);
});
