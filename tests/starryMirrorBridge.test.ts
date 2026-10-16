import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../worker/starryMirrorBridgeRouter.ts', import.meta.url), 'utf8');
const dispatcher = fs.readFileSync(new URL('../worker/starryIdRandomMottoRouter.ts', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('Starry Mirror bridge uses short-lived app tokens and internal-only battery/context routes', () => {
  assert.match(bridge, /app_access_tokens/);
  assert.match(bridge, /\/api\/apps\/starry-mirror\/session/);
  assert.match(bridge, /\/internal\/starry-mirror\/verify/);
  assert.match(bridge, /\/internal\/starry-mirror\/context/);
  assert.match(bridge, /\/internal\/starry-mirror\/battery/);
  assert.match(bridge, /starry-id\.internal/);
  assert.match(dispatcher, /handleStarryMirrorBridge/);
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
});

test('AI context returns useful profile and derived numerology while excluding direct identifiers', () => {
  const contextBlock = bridge.slice(bridge.indexOf('async function aiContext'), bridge.indexOf('async function adjustBattery'));
  assert.match(contextBlock, /profile: identity\.profile/);
  assert.match(contextBlock, /numerology: identity\.numerology/);
  assert.match(contextBlock, /comments:/);
  assert.match(contextBlock, /listenedTitles:/);
  assert.doesNotMatch(contextBlock, /phone:/);
  assert.doesNotMatch(contextBlock, /primaryEmail:/);
  assert.doesNotMatch(contextBlock, /amwayId:/);
  assert.doesNotMatch(contextBlock, /birthday:/);
});

test('numerology is derived server-side and exposes missing numbers and connection lines without exposing birthday', () => {
  assert.match(bridge, /numerologyFromBirthday/);
  assert.match(bridge, /missingNumbers/);
  assert.match(bridge, /numberCounts/);
  assert.match(bridge, /connections/);
  assert.match(bridge, /destinyNumber/);
  assert.match(bridge, /talentNumber/);
});

test('battery writes are centrally identified as Starry Mirror and idempotent', () => {
  assert.match(bridge, /uniqueKey/);
  assert.match(bridge, /sourceApp/);
  assert.match(bridge, /'starry-mirror'/);
  assert.match(bridge, /sourceLabel/);
  assert.match(bridge, /繁星心鏡/);
});
