import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/categoryIntegrityRouter.ts', import.meta.url), 'utf8');
const adminUserDeleteRouter = readFileSync(new URL('../worker/adminUserDeleteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../src/categoryIntegrityBootstrap.ts', import.meta.url), 'utf8');
const audioCard = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');

test('v71 scrubs deleted categories from persisted tracks without inventing a fallback', () => {
  assert.match(router, /CATEGORY_INTEGRITY_MIGRATION = 'category-integrity-v71'/);
  assert.match(router, /SELECT id, categories FROM tracks/);
  assert.match(router, /filter\(name => allowedSet\.has\(name\)\)/);
  assert.match(router, /UPDATE tracks SET categories = \? WHERE id = \?/);
  assert.match(router, /INSERT OR IGNORE INTO app_migrations/);
  assert.doesNotMatch(router, /allowedSet\.has\('未分類'\)\s*\?\s*\['未分類'\]/);
});

test('D1 categories is the only category authority, including an empty list', () => {
  assert.match(router, /url\.pathname === '\/api\/categories' && method === 'GET'/);
  assert.match(router, /return jsonResponse\(await liveCategories\(env\.DB\)\)/);
  assert.match(router, /body\.categories = sanitizeCategories\(body\.categories, allowed\)/);
  assert.match(router, /repairCreatedTrackResponse/);
  assert.match(router, /reconcileAllTrackCategories/);
  assert.match(privacyRouter, /import appWorker from '\.\/adminUserDeleteRouter'/);
  assert.match(adminUserDeleteRouter, /import appWorker from '\.\/categoryIntegrityRouter'/);
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
});

test('browser startup reconciles stale or missing home cache before React mounts', () => {
  assert.match(bootstrap, /HOME_CACHE_KEY = 'echostars_home_cache_v3_3'/);
  assert.match(bootstrap, /liveCategoriesLoaded = false/);
  assert.match(bootstrap, /\{ tracks: \[\], categories: \[\], savedAt: 0 \}/);
  assert.match(bootstrap, /cached\.savedAt = 0/);
  assert.match(bootstrap, /sanitizeTrackCategories/);
  assert.match(bootstrap, /await refreshLiveCategories\(\)/);
  assert.match(bootstrap, /await import\('\.\/main'\)/);
  assert.match(index, /categoryIntegrityBootstrap\.ts/);
  assert.doesNotMatch(index, /<script type="module" src="\/src\/main\.tsx"><\/script>/);
});

test('client track writes and track-list reads are sanitized against live categories', () => {
  assert.match(bootstrap, /rewriteTrackWrite/);
  assert.match(bootstrap, /body\.categories = sanitizeTrackCategories\(body\.categories\)/);
  assert.match(bootstrap, /sanitizeTrackListResponse/);
  assert.match(bootstrap, /pathname\.startsWith\('\/api\/categories'\)/);
  assert.doesNotMatch(bootstrap, /return allowed\.has\('未分類'\)/);
});

test('home cards keep a valid empty category list instead of showing a made-up category', () => {
  assert.match(audioCard, /Array\.isArray\(track\.categories\)/);
  assert.match(audioCard, /categories\.length > 0/);
  assert.doesNotMatch(audioCard, /track\.category \? \[track\.category\] : \['未分類'\]/);
});

test('schema reruns cannot recreate categories deleted by an administrator', () => {
  assert.doesNotMatch(schema, /INSERT\s+OR\s+IGNORE\s+INTO\s+categories/i);
  assert.match(schema, /分類完全由後台管理中心維護/);
});
