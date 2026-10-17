import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const presentation = readFileSync('public/transcript-presentation-v289.js', 'utf8');
const index = readFileSync('index.html', 'utf8');

test('v289 transcript shows one punctuation-delimited sentence at a time', () => {
  assert.match(presentation, /new Set\(\['，','。','！',',','\.','!'\]\)/);
  assert.match(presentation, /data-v289-current/);
  assert.doesNotMatch(presentation, /data-v289-next/);
  assert.doesNotMatch(presentation, /MAX_CHARS/);
  assert.match(presentation, /sourceChars\.length/);
});

test('v289 translate control is language-neutral and owns translation requests', () => {
  assert.match(presentation, /<b>文<\/b><i>A<\/i>/);
  assert.match(presentation, /buttonHtml\('Translate'\)/);
  assert.match(presentation, /\?translate=/);
  assert.match(presentation, /method:'POST'/);
  assert.match(presentation, /requestId = \+\+state\.requestId/);
  assert.match(presentation, /Translating…/);
});

test('v289 presentation is loaded after v288 for safe override', () => {
  const oldIndex = index.indexOf('/transcript-presentation-v288.js?v=288');
  const newIndex = index.indexOf('/transcript-presentation-v289.js?v=289');
  assert.ok(oldIndex >= 0);
  assert.ok(newIndex > oldIndex);
});

test('v289 browser script parses as JavaScript', () => {
  assert.doesNotThrow(() => new Function(presentation));
});
