import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const index = fs.readFileSync('index.html', 'utf8');
const client = fs.readFileSync('public/transcript-client-v290.js', 'utf8');
const translation = fs.readFileSync('worker/transcriptTranslationV285.ts', 'utf8');

test('v290 disables all legacy transcript presentation layers before loading the consolidated client', () => {
  assert.match(index, /__starryTranscriptV283 = true/);
  assert.match(index, /__starryTranscriptPresentationV284 = true/);
  assert.match(index, /__starryTranscriptPresentationV285 = true/);
  assert.match(index, /__starryTranscriptPresentationV288 = true/);
  assert.match(index, /__starryTranscriptPresentationV289 = true/);
  assert.match(index, /transcript-client-v290\.js\?v=290/);
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

test('v290 Translate always recovers from slow requests and keeps native language labels', () => {
  assert.match(client, /Promise\.race/);
  assert.match(client, /15000/);
  assert.match(client, /state\.translateBusy=false/);
  assert.match(client, /buttonHtml\('Translate'\)/);
  assert.match(client, /\['vi','Tiếng Việt'\]/);
  assert.match(client, /\['id','Bahasa Indonesia'\]/);
  assert.match(client, /\['ja','日本語'\]/);
  assert.match(client, /\['ko','한국어'\]/);
  assert.match(client, /\['hi','हिन्दी'\]/);
});

test('translation backend runs bounded concurrent batches and preserves cache', () => {
  assert.match(translation, /const concurrency = Math\.min\(3/);
  assert.match(translation, /Promise\.all\(Array\.from/);
  assert.match(translation, /translations\/\$\{encodeURIComponent\(language\)\}\.json/);
});

test('v290 browser script is valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(client));
});
