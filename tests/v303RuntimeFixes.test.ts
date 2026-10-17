import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const runtime = fs.readFileSync('public/v303-runtime-fixes.js', 'utf8');

test('v303 runtime fix is loaded after transcript UI', () => {
  assert.match(index, /transcript-ui-v297\.js\?v=301[\s\S]*v303-runtime-fixes\.js\?v=303/);
});

test('v303 keeps pinned subtitles synced to playing audio after leaving detail page', () => {
  assert.match(runtime, /audio\.currentTime/);
  assert.match(runtime, /data-v303-time-proxy/);
  assert.match(runtime, /id = 'audio-timeline'/);
  assert.match(runtime, /stashTranscriptPanel/);
  assert.match(runtime, /insertAdjacentElement\('beforebegin', stashedPanel\)/);
  assert.match(runtime, /setInterval\(syncTranscriptTimeProxy, 120\)/);
});

test('v303 audio editor owns a scrollable mobile-safe viewport', () => {
  assert.match(runtime, /\.v161-track-editor-overlay \.upload-modal-overlay\{[^}]*position:absolute!important/);
  assert.match(runtime, /overflow-y:auto!important/);
  assert.match(runtime, /-webkit-overflow-scrolling:touch!important/);
  assert.match(runtime, /touch-action:pan-y!important/);
});

test('v303 moves viewer keyword block below the audio photo card without fighting v301', () => {
  assert.match(runtime, /data-v303-keyword-placeholder/);
  assert.match(runtime, /placeholder\.setAttribute\('data-v301-keywords-block', '1'\)/);
  assert.match(runtime, /keywordBlock\.removeAttribute\('data-v301-keywords-block'\)/);
  assert.match(runtime, /info\.insertAdjacentElement\('afterend', keywordBlock\)/);
});

test('v303 browser script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(runtime));
});
