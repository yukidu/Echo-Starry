import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts', import.meta.url), 'utf8');

test('dynamic interaction endpoints do not invalidate the expensive homepage snapshot', () => {
  assert.match(router, /parts\.length === 3/);
  assert.doesNotMatch(router, /pathname\.startsWith\('\/api\/tracks\/'\).*rebuildHomeApiCache/s);
});

test('cached response stays browser-fresh while server refreshes in background', () => {
  assert.match(router, /'Cache-Control': 'no-store'/);
  assert.match(router, /if \(stale\) \{\s*runInBackground/s);
});
