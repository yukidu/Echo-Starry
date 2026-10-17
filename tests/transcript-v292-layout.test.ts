import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('public/transcript-ui-v292.js', 'utf8');
const client = readFileSync('public/transcript-client-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v292 loads only the consolidated transcript client plus the v292 UI layer', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.match(html, /transcript-client-v290\.js\?v=292[\s\S]*transcript-ui-v292\.js\?v=292/);
  assert.doesNotMatch(html, /transcript-presentation-v28[4589]/);
  assert.doesNotMatch(html, /transcript-ui-v291/);
});

test('v292 removes the transcript title and centers translate and expand buttons', () => {
  assert.match(ui, /\.v290-title\{display:none!important\}/);
  assert.match(ui, /\.v290-head\{justify-content:center!important/);
  assert.match(ui, /\.v290-tools\{margin-left:0!important;width:100%!important;justify-content:center!important/);
  assert.match(ui, /expand\.textContent = '放大'/);
});

test('v292 uses an original layered-card translation icon and Chinese label', () => {
  assert.match(ui, /class="v292-translate-icon"/);
  assert.match(ui, /class="v292-icon-back"/);
  assert.match(ui, /class="v292-icon-front"/);
  assert.match(ui, /class="v292-icon-arrow"/);
  assert.match(ui, /return '翻譯'/);
});

test('v292 permanently swaps transcript and keyword block positions', () => {
  assert.match(ui, /root\.insertBefore\(panel, root\.firstChild\)/);
  assert.match(ui, /root\.insertBefore\(keyword, timeline\)/);
  assert.match(ui, /data-v292-keywords/);
});

test('v292 constrains transcript to two-line height and shrinks long text', () => {
  assert.match(ui, /height:4\.65rem!important/);
  assert.match(ui, /function fitTranscriptLine/);
  assert.match(ui, /while \(size > minPx && line\.scrollHeight > availableHeight \+ 1\)/);
  assert.match(ui, /fitTranscriptLine\(panel\.querySelector\('\[data-v290-line\]'\)\)/);
});

test('v290 core playback isolation remains intact', () => {
  assert.match(client, /clearTranscriptForTrack/);
  assert.match(client, /generation!==state\.generation\|\|trackId!==state\.trackId/);
  assert.match(client, /Promise\.race/);
  assert.match(client, /15000/);
});
