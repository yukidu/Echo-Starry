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

test('v182 dislike resolves exact track.speaker from the tracks API, never from title or DOM copy', () => {
  assert.match(client, /fetch\('\/api\/tracks'/);
  assert.match(client, /const speaker = String\(track\?\.speaker \|\| ''\)\.trim\(\)/);
  assert.match(client, /trackSpeakerById\.set\(id, speaker\)/);
  assert.match(client, /resolveSpeakerNameFromCard/);
  assert.doesNotMatch(client, /querySelector\('h3'\)/);
  assert.doesNotMatch(client, /img\[alt\]/);
  assert.match(client, /確定不喜歡演講者「\$\{speakerName\}」嗎？/);
  assert.doesNotMatch(client, /再次確認|真的不喜歡演講者/);
});

test('v183 dislike uses one larger site-styled confirmation without visible heading', () => {
  assert.match(client, /label\.textContent\s*=\s*'不喜歡'/);
  assert.doesNotMatch(client, /window\.confirm/);
  assert.equal((client.match(/await styledDislikeConfirm\(/g) || []).length, 1);
  assert.doesNotMatch(client, /v181-confirm-title/);
  assert.doesNotMatch(client, /heading\.textContent/);
  assert.match(css, /\.v181-confirm-message[\s\S]*font-size:\s*1\.08rem/);
  assert.match(css, /\.v181-confirm-actions[\s\S]*justify-content:\s*center/);
  assert.match(css, /\.v181-confirm-button[\s\S]*min-width:\s*6\.4rem/);
  assert.doesNotMatch(client, /確定不喜歡[^\n]*隱藏/);
});

test('v183 hamburger menu exposes my favorites and hidden speaker management', () => {
  assert.match(client, /label\.textContent = '我的收藏'/);
  assert.match(client, /data-v183-favorites-page/);
  assert.match(client, /已隱藏的演講者/);
  assert.match(client, /取消隱藏/);
  assert.match(client, /FAVORITES_KEY = 'echostars_favorite_track_ids_v1'/);
  assert.match(css, /\.v183-favorites-page/);
});

test('v181 hides every card for the same disliked speaker', () => {
  assert.match(client, /const hiddenSpeakers = new Set<string>\(\)/);
  assert.match(client, /hiddenSpeakers\.has\(speakerName\)/);
  assert.match(client, /document\.querySelectorAll<HTMLElement>\('\.audio-card\[data-track-id\]'\)/);
  assert.match(client, /hiddenSpeakers\.add\(speakerName\)/);
});

test('v183 persists and can cancel production hidden speakers per authenticated member in D1', () => {
  assert.match(router, /CREATE TABLE IF NOT EXISTS user_hidden_speakers/);
  assert.match(router, /PRIMARY KEY \(userId, speakerName\)/);
  assert.match(router, /FROM auth_sessions s[\s\S]*JOIN users u ON u\.id = s\.userId/);
  assert.match(router, /INSERT OR IGNORE INTO user_hidden_speakers/);
  assert.match(router, /SELECT speakerName FROM user_hidden_speakers WHERE userId = \?/);
  assert.match(router, /method === 'DELETE'/);
  assert.match(router, /DELETE FROM user_hidden_speakers WHERE userId = \? AND speakerName = \?/);
  assert.match(client, /\/api\/member-hidden-speakers/);
  assert.match(favoriteRouter, /import appWorker from '\.\/hiddenTrackRouter'/);
});

test('v181 preview testing stays isolated from production D1', () => {
  assert.match(client, /host !== PRODUCTION_HOST && host\.endsWith\('-echostars\.yukidu\.workers\.dev'\)/);
  assert.match(client, /PREVIEW_STORAGE_PREFIX/);
  assert.match(client, /if \(isPreviewHost\(\)\)[\s\S]*writePreviewHiddenSpeakers/);
  assert.match(main, /import '\.\/v181HomeToolbarDislike';/);
});
