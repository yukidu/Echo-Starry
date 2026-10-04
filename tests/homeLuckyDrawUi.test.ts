import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8');

test('home search-side action is the accessible-track lucky draw', () => {
  assert.match(app, /🫵好手氣/);
  assert.match(app, /filteredTracks\.filter\(track => !track\.isPrivateVip && checkCanAccess\(track\)\)/);
  assert.match(app, /moveTrackIdToSecondSlot/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /createOscillator\(\)/);
});

test('spin keeps surrounding cards fixed and only replaces the second visible slot', () => {
  assert.match(app, /const \[luckySpinTrackId, setLuckySpinTrackId\]/);
  assert.match(app, /luckyPhase === 'spin' && luckySpinTrackId/);
  assert.match(app, /return \[filteredTracks\[0\], spinTrack, \.\.\.filteredTracks\.slice\(2\)\]/);
  assert.match(app, /setLuckySpinTrackId\(candidate\.id\)/);
  assert.doesNotMatch(app, /--lucky-x-from/);
  assert.doesNotMatch(app, /--lucky-y-to/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card \{[\s\S]*transform: none;[\s\S]*animation: none;/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:nth-child\(2\) \{[\s\S]*animation: echostars-lucky-slot-enter/);
  assert.match(css, /@keyframes echostars-lucky-slot-enter/);
});

test('lucky draw keeps spotlight and persistent winner state without scrolling', () => {
  assert.match(app, /lucky-spin-active/);
  assert.match(app, /lucky-win-active/);
  assert.match(app, /data-lucky-winner/);
  assert.match(css, /\.audio-card-grid\.lucky-win-active > \.lucky-card\[data-lucky-winner="true"\]/);
  assert.match(css, /\.lucky-winner-badge \{[\s\S]*top: -2\.85rem/);
  assert.match(app, /if \(luckyPhase !== 'win'\) return/);
  assert.match(app, /document\.addEventListener\('pointerdown', dismissLuckyWinnerOnBlank/);
  assert.doesNotMatch(app, /winnerElement\?\.scrollIntoView/);
  assert.doesNotMatch(app, /setLuckyPhase\('idle'\), 2400/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('home keyword expand and collapse control is right aligned', () => {
  assert.match(app, /className="ml-auto flex items-center gap-2"[\s\S]*showKeywordsDrawer \? '▲ 收起' : '▼ 展開'/);
});
