import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('public/transcript-presentation-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('consolidated transcript presentation is valid and loaded alone', () => {
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /transcript-presentation-v290\.js\?v=290/);
  assert.doesNotMatch(html, /transcript-presentation-v288\.js\?v=288/);
});

test('transcript has no fixed 15-character splitter and uses punctuation sentences', () => {
  assert.doesNotMatch(script, /MAX_(?:LYRIC_)?CHARS/);
  assert.doesNotMatch(script, /每句約 15 字/);
  assert.match(script, /new Set\(\['，','。','！',',','\.','!'\]\)/);
  assert.match(script, /data-v290-current/);
});

test('whole player stays directly below transcript and keywords after player', () => {
  assert.match(script, /panel\.style\.setProperty\('order','-1000'/);
  assert.match(script, /context\.timeline\.style\.setProperty\('order','-999'/);
  assert.match(script, /網友關鍵字/);
  assert.match(script, /'-998'/);
});

test('sentence correction and translated segments remain available', () => {
  assert.match(script, /\/segments\/.*segment\.id/);
  assert.match(script, /expectedText:oldFull/);
  assert.match(script, /\?translate=/);
  assert.match(script, /originalSegments/);
});
