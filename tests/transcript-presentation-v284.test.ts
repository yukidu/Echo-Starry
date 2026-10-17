import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const presentation = readFileSync('public/transcript-presentation-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('consolidated transcript presentation remains valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(presentation));
});

test('presentation removes karaoke sweep and legacy font size controls', () => {
  assert.doesNotMatch(presentation, /--karaoke-progress/);
  assert.doesNotMatch(presentation, /data-v283-font-down|data-v283-font-up/);
});

test('presentation has centered enlarge transcript control and compact overlay', () => {
  assert.match(presentation, /放大逐字稿/);
  assert.match(presentation, /v290-controls[^}]*justify-content:center/);
  assert.match(presentation, /z-index:2147483646/);
  assert.match(presentation, /background:rgba\(0,0,0,\.18\)/);
  assert.match(presentation, /color:#fff/);
  assert.match(presentation, /font-weight:950/);
  assert.match(presentation, /fitOverlayLine/);
  assert.match(presentation, />✕<\/button>/);
});

test('presentation moves transcript first, player second and keywords after player', () => {
  assert.match(presentation, /'-1000'/);
  assert.match(presentation, /'-999'/);
  assert.match(presentation, /includes\('網友關鍵字'\)/);
  assert.match(presentation, /'-998'/);
});

test('index uses only consolidated v290 transcript presentation', () => {
  assert.match(html, /transcript-presentation-v290\.js\?v=290/);
  assert.doesNotMatch(html, /transcript-presentation-v284\.js\?v=284/);
});
