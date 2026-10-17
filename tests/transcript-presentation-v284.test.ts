import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const presentation = readFileSync('public/transcript-presentation-v284.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v284 presentation remains valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(presentation));
});

test('v284 removes the visible karaoke sweep and font size controls', () => {
  assert.match(presentation, /v283-transcript-note,.v283-font-tools,.v283-karaoke-help\{display:none!important\}/);
  assert.match(presentation, /background:none!important/);
  assert.match(presentation, /-webkit-text-fill-color:currentColor!important/);
});

test('v284 adds one enlarge transcript button and top overlay', () => {
  assert.match(presentation, /放大逐字稿/);
  assert.match(presentation, /position:fixed/);
  assert.match(presentation, /z-index:2147483646/);
  assert.match(presentation, /background:rgba\(0,0,0,.72\)/);
  assert.match(presentation, /color:#fff!important/);
  assert.match(presentation, /font-weight:950/);
  assert.match(presentation, /fitLine/);
});

test('v284 moves transcript first and detail keywords under the timeline', () => {
  assert.match(presentation, /panel\.style\.order = '-1000'/);
  assert.match(presentation, /includes\('網友關鍵字'\)/);
  assert.match(presentation, /keywordPanel\.style\.order = String\(timelineOrder \+ 1\)/);
});

test('v284 is loaded after the v283 transcript client', () => {
  const base = html.indexOf('/transcript-client.js?v=283');
  const presentationIndex = html.indexOf('/transcript-presentation-v284.js?v=284');
  assert.ok(base >= 0);
  assert.ok(presentationIndex > base);
});
