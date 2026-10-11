import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const polish = readFileSync(new URL('../src/v143FavoriteCountCtaPolish.ts', import.meta.url), 'utf8');
const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('registration CTA is a prominent button and uses a bounded reliable profile opener', () => {
  assert.match(polish, /註冊會員解鎖更多 →/);
  assert.match(polish, /min-height: 44px/);
  assert.match(polish, /background: var\(--color-primary/);
  assert.match(polish, /openRegistrationReliable/);
  assert.match(polish, /attempt < 8/);
  assert.match(polish, /navbar-menu-identity/);
  assert.match(polish, /stopImmediatePropagation/);
});

test('guest favorites hamburger row aligns its icon with native menu rows', () => {
  assert.match(polish, /spacer\.hidden !== shouldHide/);
  assert.match(polish, /const shouldHide = isGuestMode\(\)/);
  assert.match(polish, /makeBookmarkSvg/);
  assert.doesNotMatch(polish, /innerHTML\s*=/);
});

test('favorite count is shown beside the card favorite action and persisted with one write per toggle', () => {
  assert.match(polish, /v143-favorite-count/);
  assert.match(polish, /`\(\$\{count\}\)`/);
  assert.match(polish, /echostars-favorites-changed/);
  assert.match(polish, /\/api\/tracks\/\$\{encodeURIComponent\(trackId\)\}\/favorite/);
  assert.match(favoriteRouter, /favoritedBy/);
  assert.match(favoriteRouter, /favoriteCount/);
  assert.match(favoriteRouter, /typeof body\.favorite !== 'boolean'/);
  assert.match(favoriteRouter, /UPDATE tracks SET favoritedBy = \?, favoriteCount = \?/);
});

test('favorite counts stay on the existing tracks response while v185 augments the same response with speakers', () => {
  assert.match(favoriteRouter, /const trackList = url\.pathname === '\/api\/tracks' && method === 'GET'/);
  assert.match(favoriteRouter, /return augmentTrackList\(await appWorker\.fetch\(request, env\), env\.DB\)/);
  assert.doesNotMatch(polish, /fetch\(['"`]\/api\/favorites\/counts/);
});

test('favorite router remains inside the privacy wrapper and v143 loads after v141', () => {
  assert.match(privacyRouter, /import appWorker from '\.\/favoriteRouter'/);
  const v141 = indexHtml.indexOf('/src/v141HomeVisualRefresh.ts');
  const v143 = indexHtml.indexOf('/src/v143FavoriteCountCtaPolish.ts');
  assert.ok(v141 >= 0);
  assert.ok(v143 > v141);
});
