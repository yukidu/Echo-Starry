import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('public/transcript-ui-v291.js', 'utf8');
const client = readFileSync('public/transcript-client-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v291 transcript UI helper parses and loads after v290 client', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.match(html, /transcript-client-v290\.js\?v=290[\s\S]*transcript-ui-v291\.js\?v=291/);
});

test('v291 removes visible transcript title and centers action buttons', () => {
  assert.match(ui, /\.v290-title\{display:none!important\}/);
  assert.match(ui, /\.v290-head\{justify-content:center!important/);
  assert.match(ui, /\.v290-tools\{margin-left:0!important;width:100%!important;justify-content:center!important/);
  assert.match(ui, /title\.remove\(\)/);
});

test('v291 uses a large X and shorter transparent enlarged transcript panel', () => {
  assert.match(ui, /min-height:3\.65rem!important/);
  assert.match(ui, /max-height:5\.4rem!important/);
  assert.match(ui, /width:2\.7rem!important/);
  assert.match(ui, /font-size:1\.85rem!important/);
  assert.match(ui, /close\.textContent !== '✕'/);
  assert.match(client, /background:rgba\(0,0,0,\.18\)/);
});

test('v290 core still isolates transcript identity and translation timeout', () => {
  assert.match(client, /clearTranscriptForTrack/);
  assert.match(client, /generation!==state\.generation\|\|trackId!==state\.trackId/);
  assert.match(client, /Promise\.race/);
  assert.match(client, /15000/);
  assert.match(client, /音檔仍可正常播放/);
});
