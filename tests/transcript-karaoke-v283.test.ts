import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync('public/transcript-presentation-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('consolidated transcript client remains valid JavaScript', () => {
  assert.doesNotThrow(() => new Function(client));
});

test('transcript shows only the current punctuation-delimited sentence', () => {
  assert.match(client, /new Set\(\['，','。','！',',','\.','!'\]\)/);
  assert.match(client, /data-v290-current/);
  assert.doesNotMatch(client, /data-v290-next/);
  assert.doesNotMatch(client, /MAX_LYRIC_CHARS|MAX_CHARS/);
});

test('current transcript follows playback progress without karaoke sweep', () => {
  assert.match(client, /playbackTime/);
  assert.match(client, /activeUnitIndex/);
  assert.match(client, /paint\(false\)/);
  assert.doesNotMatch(client, /--karaoke-progress/);
});

test('legacy transcript font controls remain removed', () => {
  assert.doesNotMatch(client, /echostars_transcript_font_scale_v1/);
  assert.doesNotMatch(client, /data-v283-font-down|data-v283-font-up/);
});

test('inline correction remains available from displayed sentence', () => {
  assert.match(client, /openEditor/);
  assert.match(client, /修正這一句/);
  assert.match(client, /\/segments\//);
});

test('index loads only consolidated transcript presentation plus admin notification helpers', () => {
  assert.match(html, /transcript-presentation-v290\.js\?v=290/);
  assert.doesNotMatch(html, /transcript-client\.js\?v=283/);
  assert.match(html, /transcript-admin\.js\?v=281/);
  assert.match(html, /transcript-user-notifications\.js\?v=281/);
});
