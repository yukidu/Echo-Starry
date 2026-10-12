import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v141HomeVisualRefresh.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v142 home polish keeps the random primary palette instead of hard coding the mockup color', () => {
  assert.match(visual, /var\(--color-primary/);
  assert.match(visual, /var\(--theme-card-bg/);
  assert.match(app, /getRandomLightPalette/);
  assert.match(app, /handleRandomPalette/);
});

test('visitor conversion teaser shows guest audible count, all-site total and member unlock message without a new API', () => {
  assert.match(visual, /訪客可聽/);
  assert.match(visual, /全站共/);
  assert.match(visual, /註冊會員解鎖更多/);
  assert.match(visual, /const totalCount = tracks\.length/);
  assert.match(visual, /echostars_home_cache_v3_3/);
  assert.doesNotMatch(visual, /fetch\(/);
});

test('visitor conversion teaser is removed after a member is logged in', () => {
  assert.match(visual, /if \(!isGuestMode\(\)\) \{\s*teaser\?\.remove\(\);\s*return;/s);
  assert.doesNotMatch(visual, /cta\.hidden\s*=\s*!isGuestMode\(\)/);
});

test('summon-stars feature remains on the home page', () => {
  assert.match(app, /handleLuckyDraw/);
  assert.match(app, /召喚繁星解答/);
});

test('audio card keeps title first and speaker plus rank second without description text', () => {
  const titleIndex = card.indexOf('{track.title}');
  const speakerIndex = card.indexOf('{speakerDisplay}');
  assert.ok(titleIndex >= 0);
  assert.ok(speakerIndex > titleIndex);
  assert.doesNotMatch(card, /track\.description/);
});

test('audio card more menu offers share details and local favorite controls', () => {
  assert.match(card, /分享音檔/);
  assert.match(card, /詳細內容/);
  assert.match(card, /取消收藏/);
  assert.match(card, /收藏/);
  assert.match(card, /echostars_favorite_track_ids_v1/);
});

test('more menu is raised above following audio cards when expanded', () => {
  assert.match(visual, /audio-card:has\(button\[aria-label="更多功能"\]\[aria-expanded="true"\]\)/);
  assert.match(visual, /z-index: 300/);
});

test('hamburger menu gains a local My Favorites entry and favorite-only home view', () => {
  assert.match(visual, /我的收藏/);
  assert.match(visual, /v142-favorites-menu-row/);
  assert.match(visual, /data-track-card-id/);
  assert.match(visual, /echostars-favorites-changed/);
  assert.match(visual, /echostars_favorite_track_ids_v1/);
  assert.match(visual, /返回全部音檔/);
});

test('guest zero progress badge is not rendered', () => {
  assert.match(card, /guestProgressPercent > 0/);
});

test('v142 observer avoids self-triggering microtask loops', () => {
  assert.match(visual, /requestAnimationFrame/);
  assert.doesNotMatch(visual, /queueMicrotask/);
  assert.doesNotMatch(visual, /innerHTML\s*=/);
  assert.match(visual, /textContent !== guestText/);
  assert.match(visual, /previousElementSibling !== sortToolbar/);
});

test('v141 bootstrap remains the safe post-v139 visual policy and broken v140 is not loaded', () => {
  const v139 = indexHtml.indexOf('/src/v139HomeUploadPolish.ts');
  const v141 = indexHtml.indexOf('/src/v141HomeVisualRefresh.ts');
  assert.ok(v139 >= 0);
  assert.ok(v141 > v139);
  assert.doesNotMatch(indexHtml, /v140HomeVisualRefresh\.ts/);
});