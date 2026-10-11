import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v181HomeToolbarDislike.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/hiddenTrackRouter.ts', import.meta.url), 'utf8');
const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');

test('v181 logo circular pulse is visible only while a real audio element is playing', () => {
  assert.match(client, /querySelectorAll<HTMLAudioElement>\('audio'\)/);
  assert.match(client, /!audio\.paused\s*&&\s*!audio\.ended/);
  assert.match(client, /dataset\.echostarsAudioPlaying\s*=\s*playing\s*\?\s*'true'\s*:\s*'false'/);
  assert.match(css, /\.brand-logo-glow > div > span\.animate-ping\s*\{[\s\S]*display:\s*none\s*!important/);
  assert.match(css, /html\[data-echostars-audio-playing='true'\][\s\S]*span\.animate-ping[\s\S]*display:\s*block\s*!important/);
});

test('v181 hamburger keeps the three-line control but removes the rounded rectangle shell', () => {
  assert.match(css, /button\[data-main-menu='hamburger'\][\s\S]*border-radius:\s*0\s*!important/);
  assert.match(css, /button\[data-main-menu='hamburger'\][\s\S]*background:\s*transparent\s*!important/);
  assert.match(css, /button\[data-main-menu='hamburger'\][\s\S]*box-shadow:\s*none\s*!important/);
});

test('v181 dislike uses the speaker name, styled confirmation twice, and never mentions hiding', () => {
  assert.match(client, /label\.textContent\s*=\s*'不喜歡'/);
  assert.doesNotMatch(client, /window\.confirm/);
  assert.match(client, /speakerNameFromCard[\s\S]*img\[alt\]/);
  assert.match(client, /styledDislikeConfirm\(`確定不喜歡「\$\{speakerName\}」嗎？`, '不喜歡確認'\)/);
  assert.match(client, /styledDislikeConfirm\(`再確認一次，真的不喜歡「\$\{speakerName\}」嗎？`, '再次確認'\)/);
  assert.match(client, /v181-confirm-card/);
  assert.match(client, /shieldAlertIcon/);
  assert.doesNotMatch(client, /確定不喜歡[^\n]*隱藏|再次確認[^\n]*隱藏/);
  assert.match(css, /\.v181-confirm-card[\s\S]*background:\s*rgb\(255 251 235\)/);
  assert.match(css, /\.v181-confirm-card[\s\S]*border:\s*1px solid rgb\(252 211 77\)/);
  assert.match(css, /\.v181-confirm-icon[\s\S]*color:\s*rgb\(217 119 6\)/);
});

test('v181 hides every card for the same disliked speaker', () => {
  assert.match(client, /const hiddenSpeakers = new Set<string>\(\)/);
  assert.match(client, /hiddenSpeakers\.has\(speakerName\)/);
  assert.match(client, /document\.querySelectorAll<HTMLElement>\('\.audio-card\[data-track-id\]'\)/);
  assert.match(client, /hiddenSpeakers\.add\(speakerName\)/);
});

test('v181 persists production dislikes per authenticated member and speaker in D1', () => {
  assert.match(router, /CREATE TABLE IF NOT EXISTS user_hidden_speakers/);
  assert.match(router, /PRIMARY KEY \(userId, speakerName\)/);
  assert.match(router, /FROM auth_sessions s[\s\S]*JOIN users u ON u\.id = s\.userId/);
  assert.match(router, /INSERT OR IGNORE INTO user_hidden_speakers/);
  assert.match(router, /SELECT speakerName FROM user_hidden_speakers WHERE userId = \?/);
  assert.match(client, /\/api\/member-hidden-speakers/);
  assert.match(favoriteRouter, /import appWorker from '\.\/hiddenTrackRouter'/);
});

test('v181 preview testing stays isolated from production D1', () => {
  assert.match(client, /host !== PRODUCTION_HOST && host\.endsWith\('-echostars\.yukidu\.workers\.dev'\)/);
  assert.match(client, /PREVIEW_STORAGE_PREFIX/);
  assert.match(client, /if \(isPreviewHost\(\)\)[\s\S]*writePreviewHiddenSpeakers/);
  assert.match(main, /import '\.\/v181HomeToolbarDislike';/);
});
