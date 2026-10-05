import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('home search-side action is the accessible-track lucky draw', () => {
  assert.match(app, /🫵好手氣/);
  assert.match(app, /filteredTracks\.filter\(track => !track\.isPrivateVip && checkCanAccess\(track\) && isTrackStickerUnlocked\(track\)\)/);
  assert.match(app, /moveTrackIdToSecondSlot/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /createOscillator\(\)/);
});

test('lucky draw acts directly on the home card grid with a spotlight and winner state', () => {
  assert.match(app, /lucky-spin-active/);
  assert.match(app, /lucky-win-active/);
  assert.match(app, /data-lucky-winner/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card \{[\s\S]*animation: echostars-lucky-reel/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:nth-child\(2\)/);
  assert.match(css, /\.audio-card-grid\.lucky-win-active > \.lucky-card\[data-lucky-winner="true"\]/);
  assert.match(css, /\.lucky-winner-badge \{[\s\S]*top: -1\.25rem/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('lucky winner stays pinned without scrolling and dismisses from blank space', () => {
  assert.match(app, /if \(luckyPhase !== 'win'\) return/);
  assert.match(app, /document\.addEventListener\('pointerdown', dismissLuckyWinnerOnBlank/);
  assert.doesNotMatch(app, /winnerElement\?\.scrollIntoView/);
  assert.doesNotMatch(app, /setLuckyPhase\('idle'\), 2400/);
});

test('lucky draw sits to the left of the search field', () => {
  const luckyIndex = app.indexOf('title="從目前條件下可播放的音檔中抽一張好手氣"');
  const searchIndex = app.indexOf('ref={searchContainerRef}');
  assert.ok(luckyIndex >= 0 && searchIndex >= 0 && luckyIndex < searchIndex);
});

test('home keyword expand and collapse control is integrated into the heading', () => {
  assert.match(app, /onClick=\{\(\) => setShowKeywordsDrawer\(prev => !prev\)\}/);
  assert.match(app, /showKeywordsDrawer \? '▲收起' : '▼展開'/);
  assert.match(app, /網友關鍵字/);
  assert.match(app, /\(可複選多個\)/);
  assert.doesNotMatch(app, /className="ml-auto flex items-center gap-2"[\s\S]*showKeywordsDrawer \? '▲ 收起' : '▼ 展開'/);
});
