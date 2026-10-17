import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const script = readFileSync('public/transcript-presentation-v288.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v288 transcript presentation is valid and loaded after v285', () => {
  assert.doesNotThrow(() => new Function(script));
  assert.match(html, /transcript-presentation-v285\.js\?v=285[\s\S]*transcript-presentation-v288\.js\?v=288/);
});

test('v288 displays original transcript segments without a 15-character splitter', () => {
  assert.doesNotMatch(script, /MAX_(?:LYRIC_)?CHARS/);
  assert.doesNotMatch(script, /每句約 15 字/);
  assert.match(script, /state\.segments = data\.segments\.map/);
  assert.match(script, /c\.textContent = text\(current\.text\)/);
});

test('v288 forces the whole player directly below the transcript and keywords after player', () => {
  assert.match(script, /#v283-transcript-panel\{order:-1000!important\}/);
  assert.match(script, /#audio-timeline\{order:-999!important\}/);
  assert.match(script, /網友關鍵字/);
  assert.match(script, /'-998'/);
});

test('v288 keeps full-segment correction and translated segments', () => {
  assert.match(script, /\/segments\/.*segment\.id/);
  assert.match(script, /expectedText:text\(segment\.text\)/);
  assert.match(script, /\?translate=/);
});
