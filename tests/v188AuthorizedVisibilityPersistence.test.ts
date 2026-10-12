import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/trackVisibilityPersistenceRouter.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');
const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const visibilityPolicy = readFileSync(new URL('../src/trackVisibilityPolicy.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('authorized-only visibility is sent by upload/edit form and remains backward compatible', () => {
  assert.match(upload, /authorizedOnlyVisible,/);
  assert.match(upload, /guestVisible: authorizedOnlyVisible \? false : guestVisible/);
  assert.match(worker, /__ECHOSTARS_V185_META__/);
  assert.match(worker, /encodeTrackExtras/);
});

test('v188 stores authorized-only visibility in a dedicated D1 column', () => {
  assert.match(router, /ALTER TABLE tracks ADD COLUMN authorizedOnlyVisible INTEGER DEFAULT 0/);
  assert.match(router, /track_visibility_migrations_v188/);
  assert.doesNotMatch(router, /CREATE TABLE IF NOT EXISTS app_migrations/);
  assert.match(router, /UPDATE tracks SET authorizedOnlyVisible = 1, guestVisible = 0 WHERE id = \?/);
  assert.match(router, /UPDATE tracks SET authorizedOnlyVisible = 0/);
});

test('v188 backfills old hidden metadata and canonicalizes track-list responses', () => {
  assert.match(router, /legacyAuthorizedOnlyVisible\(row\.externalFiles\)/);
  assert.match(router, /SELECT id, authorizedOnlyVisible, guestVisible FROM tracks/);
  assert.match(router, /canonicalizeTrackList/);
});

test('home card visibility still requires login plus actual browse permission when restricted', () => {
  assert.match(visibilityPolicy, /if \(!Boolean\(track\.authorizedOnlyVisible\)\) return true/);
  assert.match(visibilityPolicy, /return isLoggedIn && canAccess/);
});

test('wrangler enters through persistence layer which delegates to privacy crawler router', () => {
  assert.match(wrangler, /main = "worker\/trackVisibilityPersistenceRouter\.ts"/);
  assert.match(router, /import appWorker from '\.\/privacyCrawlerRouter'/);
});
