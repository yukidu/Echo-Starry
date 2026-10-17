import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const presentation = readFileSync('public/transcript-presentation-v290.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

test('v290 transcript shows one punctuation-delimited sentence at a time', () => {
  assert.match(presentation, /new Set\(\['，','。','！',',','\.','!'\]\)/);
  assert.match(presentation, /data-v290-current/);
  assert.doesNotMatch(presentation, /data-v290-next/);
  assert.doesNotMatch(presentation, /MAX_CHARS/);
});

test('v290 isolates track changes and ignores stale transcript responses', () => {
  assert.match(presentation, /generation:\s*0/);
  assert.match(presentation, /state\.generation\+\+/);
  assert.match(presentation, /state\.sourceController\?\.abort\(\)/);
  assert.match(presentation, /generation !== state\.generation \|\| trackId !== state\.trackId/);
  assert.match(presentation, /closeOverlay\(\)/);
});

test('v290 gives audio playback priority and avoids duplicate transcript loads', () => {
  assert.match(presentation, /audioNeedsPriority\(\)/);
  assert.match(presentation, /audio\.readyState < 3/);
  assert.match(presentation, /state\.sourceLoading/);
  assert.match(presentation, /window\.setTimeout\(attempt, 350\)/);
});

test('v290 translation stays non-blocking and uses bilingual Translate control', () => {
  assert.match(presentation, /<b>文<\/b><i>A<\/i>/);
  assert.match(presentation, /<span>Translate<\/span>/);
  assert.match(presentation, /\?translate=/);
  assert.match(presentation, /翻譯仍在背景處理/);
  assert.doesNotMatch(presentation, /data-v290-translate[^\n]{0,200}disabled/);
  assert.doesNotMatch(presentation, /translationController[\s\S]{0,500}button\.disabled\s*=\s*true/);
});

test('v290 removes transcript title and centers controls with compact X overlay', () => {
  assert.doesNotMatch(presentation, /🎤 同步逐字稿/);
  assert.match(presentation, /justify-content:center/);
  assert.match(presentation, /data-v290-overlay-close[^>]*aria-label="關閉放大逐字稿">✕<\/button>/);
  assert.match(presentation, /min-height:4\.8rem/);
});

test('only consolidated v290 transcript presentation is loaded', () => {
  assert.match(index, /\/transcript-presentation-v290\.js\?v=290/);
  assert.doesNotMatch(index, /\/transcript-client\.js\?v=283/);
  assert.doesNotMatch(index, /\/transcript-presentation-v28[4589]\.js/);
});

test('v290 browser script parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(presentation));
});
