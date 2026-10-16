import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bridge = fs.readFileSync(new URL('../worker/starryMirrorBridgeRouter.ts', import.meta.url), 'utf8');
const entry = fs.readFileSync(new URL('../worker/starryMirrorBridgeEntry.ts', import.meta.url), 'utf8');
const wrangler = fs.readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('Starry Mirror bridge uses short-lived app tokens and internal-only battery/context routes', () => {
  assert.match(bridge, /app_access_tokens/);
  assert.match(bridge, /\/api\/apps\/starry-mirror\/session/);
  assert.match(bridge, /\/internal\/starry-mirror\/verify/);
  assert.match(bridge, /\/internal\/starry-mirror\/context/);
  assert.match(bridge, /\/internal\/starry-mirror\/battery/);
  assert.match(bridge, /starry-id\.internal/);
  assert.match(entry, /handleStarryMirrorBridge/);
  assert.match(wrangler, /starryMirrorBridgeEntry\.ts/);
});

test('AI context returns useful profile text but excludes direct contact identifiers', () => {
  const contextBlock = bridge.slice(bridge.indexOf('async function aiContext'), bridge.indexOf('async function adjustBattery'));
  assert.match(contextBlock, /profile: identity\.profile/);
  assert.match(contextBlock, /comments:/);
  assert.match(contextBlock, /listenedTitles:/);
  assert.doesNotMatch(contextBlock, /phone:/);
  assert.doesNotMatch(contextBlock, /primaryEmail:/);
  assert.doesNotMatch(contextBlock, /amwayId:/);
  assert.doesNotMatch(contextBlock, /birthday:/);
});

test('battery writes are centrally identified as Starry Mirror and idempotent', () => {
  assert.match(bridge, /uniqueKey/);
  assert.match(bridge, /sourceApp[^\n]*starry-mirror|starry-mirror[^\n]*sourceApp/);
  assert.match(bridge, /sourceLabel/);
  assert.match(bridge, /繁星心鏡/);
});
