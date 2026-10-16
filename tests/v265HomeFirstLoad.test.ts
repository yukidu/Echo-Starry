import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const smoke = readFileSync(new URL('../.github/workflows/production-smoke.yml', import.meta.url), 'utf8');

test('first home load has a server-side playlist and category cache', () => {
  assert.match(router, /HOME_TRACKS_CACHE_KEY/);
  assert.match(router, /HOME_CATEGORIES_CACHE_KEY/);
  assert.match(router, /readHomeApiCache/);
  assert.match(router, /rebuildHomeApiCache/);
  assert.match(router, /X-Echo-Home-Cache/);
});

test('stale homepage data is returned immediately and refreshed in background', () => {
  assert.match(router, /HOME_CACHE_REVALIDATE_MS\s*=\s*30_000/);
  assert.match(router, /runInBackground\(ctx, rebuildHomeApiCache/);
  assert.match(router, /cachedHomeResponse\(cached\.body, stale \? 'stale' : 'hit'\)/);
});

test('structural track and category edits rewarm homepage cache', () => {
  assert.match(router, /isStructuralTrackMutation/);
  assert.match(router, /isCategoryMutation/);
  assert.match(router, /rebuildHomeApiCache\(request\.url, '\/api\/tracks'/);
  assert.match(router, /rebuildHomeApiCache\(request\.url, '\/api\/categories'/);
});

test('existing browser cache remains an instant first paint fallback', () => {
  assert.match(app, /readHomeCache\(\)\?\.tracks \|\| \[\]/);
  assert.match(app, /Fast home bootstrap: show local cache immediately/);
});

test('production smoke warms and verifies cached homepage APIs', () => {
  assert.match(smoke, /Warm and verify homepage playlist cache/);
  assert.match(smoke, /api\/tracks\?warm=/);
  assert.match(smoke, /api\/categories\?warm=/);
  assert.match(smoke, /x-echo-home-cache: \(hit\|stale\)/i);
  assert.match(smoke, /respond within 5 seconds/);
});
