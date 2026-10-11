import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../src/v183DislikeFavoritesPolish.ts', import.meta.url), 'utf8');
const dislike = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/hiddenTrackRouter.ts', import.meta.url), 'utf8');

test('v183 dislike dialog removes visible heading and enlarges centered actions', () => {
  assert.match(ui, /\.v181-confirm-title\s*\{\s*display:\s*none\s*!important/);
  assert.match(ui, /\.v181-confirm-message[\s\S]*font-size:\s*1\.12rem/);
  assert.match(ui, /\.v181-confirm-actions[\s\S]*justify-content:\s*center/);
  assert.match(ui, /\.v181-confirm-button[\s\S]*min-width:\s*7rem[\s\S]*min-height:\s*3rem/);
});

test('v183 keeps single speaker confirmation and mounts the favorites management module', () => {
  assert.match(dislike, /import '\.\/v183DislikeFavoritesPolish';/);
  const confirmations = dislike.match(/styledDislikeConfirm\(`/g) || [];
  assert.equal(confirmations.length, 1);
  assert.match(dislike, /確定不喜歡演講者「\$\{speakerName\}」嗎？/);
});

test('v183 favorites page lists hidden speakers and offers restore', () => {
  assert.match(ui, /\.v142-favorites-header/);
  assert.match(ui, /不喜歡的演講者/);
  assert.match(ui, /取消隱藏/);
  assert.match(ui, /PREVIEW_STORAGE_PREFIX/);
  assert.match(ui, /method:\s*'DELETE'/);
});

test('v183 production API supports removing one hidden speaker preference', () => {
  assert.match(router, /itemRoute\s*&&\s*method === 'DELETE'/);
  assert.match(router, /DELETE FROM user_hidden_speakers WHERE userId = \? AND speakerName = \?/);
});
