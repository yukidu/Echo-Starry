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

test('lucky draw acts directly on the home card grid with a spotlight and winner state', () => {
  assert.match(app, /lucky-spin-active/);
  assert.match(app, /lucky-win-active/);
  assert.match(app, /data-lucky-winner/);
  assert.match(css, /\.audio-card-grid\.lucky-spin-active > \.lucky-card:nth-child\(2\)/);
  assert.match(css, /\.audio-card-grid\.lucky-win-active > \.lucky-card\[data-lucky-winner="true"\]/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
