import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/v189PlaybackSwitchConfirm.ts', import.meta.url), 'utf8');
const player = readFileSync(new URL('../src/components/MiniPlayer.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v189 identifies the exact current and requested track before asking to switch', () => {
  assert.match(player, /data-media-track-id=\{track\.id\}/);
  assert.match(ui, /\.audio-card\[data-track-id\]/);
  assert.match(ui, /state\?\.view === 'detail'/);
  assert.match(ui, /if \(!currentId \|\| !targetId \|\| currentId === targetId\) return/);
});

test('v189 only interrupts a user playback trigger while audio is actually playing', () => {
  assert.match(ui, /!audio\.paused && !audio\.ended/);
  assert.match(ui, /開始播放\|繼續播放/);
  assert.match(ui, /event\.preventDefault\(\)/);
  assert.match(ui, /event\.stopImmediatePropagation\(\)/);
  assert.doesNotMatch(ui, /MutationObserver/);
});

test('v189 switch confirmation reuses the dislike confirmation visual language', () => {
  for (const className of [
    'v181-confirm-layer',
    'v181-confirm-card',
    'v181-confirm-icon',
    'v181-confirm-message',
    'v181-confirm-actions',
    'v181-confirm-button v181-confirm-cancel',
    'v181-confirm-button v181-confirm-ok'
  ]) assert.match(ui, new RegExp(className));
  assert.match(ui, /目前音檔正在播放中，確定要切換播放其他音檔嗎？/);
  assert.match(ui, /cancel\.textContent = '取消'/);
  assert.match(ui, /confirm\.textContent = '確定'/);
});

test('v189 cancel preserves playback and confirm explicitly replays the requested control', () => {
  assert.match(main, /echostars:grant-playback-intent/);
  assert.match(main, /echostars:clear-playback-intent/);
  assert.match(ui, /finishIntent\(grant\)/);
  assert.match(ui, /if \(grant && button\.isConnected\)/);
  assert.match(ui, /bypassOnce\.add\(button\)/);
  assert.match(ui, /button\.click\(\)/);
});

test('v189 release note is loaded into the changelog pipeline', () => {
  assert.match(index, /\/src\/v189ReleaseNote\.ts/);
});
