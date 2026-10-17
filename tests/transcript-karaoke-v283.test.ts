import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync('public/transcript-client.js', 'utf8');
const html = readFileSync('index.html', 'utf8');

test('v283 transcript uses karaoke two-line presentation', () => {
  assert.match(client, /MAX_LYRIC_CHARS = 15/);
  assert.match(client, /v283-lyric-current/);
  assert.match(client, /v283-lyric-next/);
  assert.match(client, /一次顯示目前句＋下一句/);
  assert.doesNotMatch(client, /v281-transcript-list/);
});

test('v283 current lyric follows playback progress with karaoke sweep', () => {
  assert.match(client, /--karaoke-progress/);
  assert.match(client, /currentPlaybackTime/);
  assert.match(client, /paintLyrics/);
  assert.match(client, /160/);
});

test('v283 transcript font size is user controlled and persisted locally', () => {
  assert.match(client, /echostars_transcript_font_scale_v1/);
  assert.match(client, /data-v283-font-down/);
  assert.match(client, /data-v283-font-up/);
  assert.match(client, /localStorage\.setItem\(FONT_KEY/);
});

test('v283 keeps inline correction available from displayed lyric line', () => {
  assert.match(client, /openEditorForUnit/);
  assert.match(client, /修正這一句/);
  assert.match(client, /\/segments\//);
});

test('v283 cache-busts the transcript client only', () => {
  assert.match(html, /transcript-client\.js\?v=283/);
  assert.match(html, /transcript-admin\.js\?v=281/);
  assert.match(html, /transcript-user-notifications\.js\?v=281/);
});
