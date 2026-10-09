import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v141HomeVisualRefresh.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v141 home refresh keeps the random primary palette instead of hard coding the mockup color', () => {
  assert.match(visual, /var\(--color-primary/);
  assert.match(visual, /var\(--theme-card-bg/);
  assert.match(app, /getRandomLightPalette/);
  assert.match(app, /handleRandomPalette/);
});

test('visitor conversion teaser compares guest and registered member recording totals without a new API', () => {
  assert.match(visual, /訪客可收聽/);
  assert.match(visual, /註冊會員可收聽/);
  assert.match(visual, /免費註冊，立即解鎖更多內容/);
  assert.match(visual, /echostars_home_cache_v3_3/);
  assert.doesNotMatch(visual, /fetch\(/);
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
  assert.match(card, /查看詳細內容/);
  assert.match(card, /取消收藏/);
  assert.match(card, /收藏/);
  assert.match(card, /echostars_favorite_track_ids_v1/);
});

test('guest zero progress badge is not rendered', () => {
  assert.match(card, /guestProgressPercent > 0/);
});

test('v141 observer avoids self-triggering microtask loops', () => {
  assert.match(visual, /requestAnimationFrame/);
  assert.doesNotMatch(visual, /queueMicrotask/);
  assert.doesNotMatch(visual, /innerHTML\s*=/);
  assert.match(visual, /textContent !== guestText/);
  assert.match(visual, /previousElementSibling !== sortToolbar/);
});

test('v141 visual policy replaces the broken v140 bootstrap and loads after v139', () => {
  const v139 = indexHtml.indexOf('/src/v139HomeUploadPolish.ts');
  const v141 = indexHtml.indexOf('/src/v141HomeVisualRefresh.ts');
  assert.ok(v139 >= 0);
  assert.ok(v141 > v139);
  assert.doesNotMatch(indexHtml, /v140HomeVisualRefresh\.ts/);
});
