import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync(new URL('../worker/v192TrackVisibilityRouter.ts', import.meta.url), 'utf8');
const privacy = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const auth = readFileSync(new URL('../worker/authRouter.ts', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../src/v192HiddenTrackUi.ts', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v192HiddenTrackUi.css', import.meta.url), 'utf8');
const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const visibilityPolicy = readFileSync(new URL('../src/trackVisibilityPolicy.ts', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v192 stores the hidden checkbox as an authoritative per-track state', () => {
  assert.match(router, /CREATE TABLE IF NOT EXISTS track_visibility_settings/);
  assert.match(router, /authorizedOnlyVisible INTEGER NOT NULL DEFAULT 0/);
  assert.match(router, /ON CONFLICT\(trackId\) DO UPDATE SET/);
  assert.match(router, /touchesHidden/);
  assert.match(router, /body\.authorizedOnlyVisible === true/);
  assert.match(upload, /setAuthorizedOnlyVisible\(Boolean\(trackToEdit\.authorizedOnlyVisible\)\)/);
  assert.match(upload, /authorizedOnlyVisible,/);
});

test('v192 keeps unauthorized hidden tracks out of the home playlist', () => {
  assert.match(visibilityPolicy, /if \(!Boolean\(track\.authorizedOnlyVisible\)\) return true/);
  assert.match(visibilityPolicy, /return isLoggedIn && canAccess/);
  assert.match(app, /canAppearInHomeForViewer/);
});

test('v192 shows the eye-off hidden marker in home and detail positions', () => {
  assert.match(ui, /已被隱藏/);
  assert.match(ui, /v192-hidden-home-marker/);
  assert.match(ui, /v192-hidden-detail-marker/);
  assert.match(css, /\.v192-hidden-home-marker\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;/);
  assert.match(css, /\.v192-hidden-detail-marker\s*\{[\s\S]*right:\s*calc\(100% \+ 0\.75rem\)/);
  assert.doesNotMatch(ui, /MutationObserver/);
});

test('v192 blocks hidden sharing by default and exposes a protected per-track admin switch', () => {
  assert.match(router, /hiddenShareAllowed INTEGER NOT NULL DEFAULT 0/);
  assert.match(router, /share-slug\|vip-share/);
  assert.match(router, /此音檔已被隱藏，目前禁止分享/);
  assert.match(router, /shareBlockedBySlug/);
  assert.match(router, /const response = await next\(request, env\)/);
  assert.match(router, /if \(!trackWrite \|\| !response\.ok/);
  assert.match(auth, /\^\\\/api\\\/tracks\\\/\[\^\/\]\+\$\/\.test\(path\) && \(method === 'PUT' \|\| method === 'DELETE'\)/);
  assert.match(auth, /只能修改自己上傳的音檔/);
  assert.match(ui, /隱藏音檔允許分享/);
  assert.match(ui, /role="switch"/);
  assert.match(ui, /hiddenShareAllowed:\s*next/);
  assert.match(ui, /setShareButtonsBlocked/);
});

test('v192 keeps the original wrapper chain, v189 fixes, and restored v190 rank badges together', () => {
  assert.match(privacy, /import appWorker from '\.\/favoriteRouter'/);
  assert.match(privacy, /import \{ handleV192TrackVisibility \} from '\.\/v192TrackVisibilityRouter'/);
  assert.match(privacy, /handleV192TrackVisibility/);
  assert.match(privacy, /NOOP_EDIT_MARKER = '__ECHOSTARS_NOOP_EDIT_SAVE__'/);
  assert.match(main, /import '\.\/v189PlaybackSwitchConfirm'/);
  assert.match(main, /import '\.\/v190RankBadge\.css'/);
  assert.match(detail, /speakerRankBadge/);
  assert.match(detail, /v190-rank-badge-image/);
  assert.match(app, /selectedBadgeSpeakerRank/);
  assert.match(html, /v189MobilePermissionLayoutFix\.ts/);
  assert.match(html, /v190ReleaseNote\.ts/);
  assert.match(html, /v192ReleaseNote\.ts/);
  assert.match(html, /v192HiddenTrackUi\.ts/);
});
