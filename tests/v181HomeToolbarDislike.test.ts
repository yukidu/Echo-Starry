import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../src/v181HomeToolbarDislike.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v181HomeToolbarDislike.css', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const router = readFileSync(new URL('../worker/hiddenTrackRouter.ts', import.meta.url), 'utf8');
const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');

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

test('v182 dislike uses one site-styled confirmation and never mentions hiding', () => {
  assert.match(client, /label\.textContent\s*=\s*'不喜歡'/);
  assert.doesNotMatch(client, /window\.confirm/);
  assert.equal((client.match(/styledDislikeConfirm\(/g) || []).length, 2);
  assert.match(client, /v181-confirm-card/);
  assert.match(client, /shieldAlertIcon/);
  assert.doesNotMatch(client, /確定不喜歡[^\n]*隱藏|再次確認[^\n]*隱藏/);
  assert.match(css, /\.v181-confirm-card[\s\S]*background:\s*rgb\(255 251 235\)/);
  assert.match(css, /\.v181-confirm-card[\s\S]*border:\s*1px solid rgb\(252 211 77\)/);
  assert.match(css, /\.v181-confirm-icon[\s\S]*color:\s*rgb\(217 119 6\)/);
});

test('v184 relationship matching hides every card related to the disliked speaker', () => {
  assert.match(client, /const hiddenSpeakers = new Set<string>\(\)/);
  assert.match(client, /speakerMatchesAnyHiddenEntry\(speakerName, hiddenSpeakers\)/);
  assert.doesNotMatch(client, /hiddenSpeakers\.has\(speakerName\)/);
  assert.match(client, /document\.querySelectorAll<HTMLElement>\('\.audio-card\[data-track-id\]'\)/);
  assert.match(client, /hiddenSpeakers\.add\(speakerName\)/);
});

test('v181 production dislikes persist per authenticated member while preserving the legacy worker chain', () => {
  assert.match(router, /CREATE TABLE IF NOT EXISTS user_hidden_speakers/);
  assert.match(router, /PRIMARY KEY \(userId, speakerName\)/);
  assert.match(router, /FROM auth_sessions s[\s\S]*JOIN users u ON u\.id = s\.userId/);
  assert.match(router, /INSERT OR IGNORE INTO user_hidden_speakers/);
  assert.match(router, /SELECT speakerName FROM user_hidden_speakers WHERE userId = \?/);
  assert.match(client, /\/api\/member-hidden-speakers/);
  assert.match(privacyRouter, /import hiddenTrackWorker from '\.\/hiddenTrackRouter'/);
  assert.match(privacyRouter, /url\.pathname === '\/api\/member-hidden-speakers'/);
  assert.match(privacyRouter, /hiddenTrackWorker\.fetch\(request, env\)/);
  assert.match(favoriteRouter, /import appWorker from '\.\/adminUserDeleteRouter'/);
});

test('v181 preview testing stays isolated from production D1', () => {
  assert.match(client, /host !== PRODUCTION_HOST && host\.endsWith\('-echostars\.yukidu\.workers\.dev'\)/);
  assert.match(client, /PREVIEW_STORAGE_PREFIX/);
  assert.match(client, /if \(isPreviewHost\(\)\)[\s\S]*writePreviewHiddenSpeakers/);
  assert.match(main, /import '\.\/v181HomeToolbarDislike';/);
});
