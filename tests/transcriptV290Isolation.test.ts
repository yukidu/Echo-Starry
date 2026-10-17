import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const client = fs.readFileSync('public/transcript-client-v290.js', 'utf8');
const translation = fs.readFileSync('worker/transcriptTranslationV285.ts', 'utf8');
const gateway = fs.readFileSync('worker/transcriptV281Gateway.ts', 'utf8');

test('v296 loads the consolidated transcript core without legacy presentation layers', () => {
  assert.match(index, /transcript-client-v290\.js\?v=293/);
  assert.match(index, /transcript-ui-v293\.js\?v=296/);
  assert.doesNotMatch(index, /transcript-client\.js\?v=283/);
  assert.doesNotMatch(index, /transcript-presentation-v28[4589]/);
  assert.doesNotMatch(index, /transcript-ui-v292/);
});

test('v290 identifies tracks safely and clears stale transcript state on track changes', () => {
  assert.match(client, /track\.id!==state\.trackId/);
  assert.match(client, /clearTranscriptForTrack\(track\.id\)/);
  assert.match(client, /absolute\(item && item\.audioUrl\) === src/);
  assert.match(client, /state\.generation\+\+/);
  assert.match(client, /state\.sourceController\.abort\(\)/);
});

test('v290 transcript is background-only and never gates audio playback', () => {
  assert.match(client, /const delay=audio&&!audio\.paused\?700:120/);
  assert.match(client, /音檔可照常播放/);
  assert.doesNotMatch(client, /audio\.pause\(/);
  assert.doesNotMatch(client, /await audio\.play/);
});

test('v290 sentence display breaks only at comma period and exclamation punctuation', () => {
  assert.match(client, /new Set\(\['，','。','！',',','\.','!'\]\)/);
  assert.doesNotMatch(client, /MAX_LYRIC_CHARS/);
});

test('legacy AI translation code remains dormant for future budget re-enable but gateway blocks it now', () => {
  assert.match(translation, /const concurrency = Math\.min\(3/);
  assert.match(translation, /Promise\.all\(Array\.from/);
  assert.match(translation, /translations\/\$\{encodeURIComponent\(language\)\}\.json/);
  assert.doesNotMatch(gateway, /handleTranscriptTranslationV285/);
  assert.match(gateway, /aiTranslationDisabled:\s*true/);
});

test('v290 browser script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(client));
});
