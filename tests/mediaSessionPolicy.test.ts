import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const policy = readFileSync(new URL('../src/mediaSessionPolicy.ts', import.meta.url), 'utf8');
const miniPlayer = readFileSync(new URL('../src/components/MiniPlayer.tsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const manifest = readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../src/categoryIntegrityBootstrap.ts', import.meta.url), 'utf8');
const serviceWorker = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('mini player exposes current track metadata to the system media policy', () => {
  assert.match(miniPlayer, /data-echostars-media-session="1"/);
  assert.match(miniPlayer, /data-echostars-media-toggle="1"/);
  assert.match(miniPlayer, /data-media-title=\{track\.title\}/);
  assert.match(miniPlayer, /data-media-artist=/);
  assert.match(miniPlayer, /data-media-artwork=\{track\.speakerAvatar \|\| '\/icon-512\.png'\}/);
});

test('media session publishes title, speaker, artwork and app album name', () => {
  assert.match(policy, /APP_TITLE = '繁星回聲'/);
  assert.match(policy, /mediaSession\.metadata/);
  assert.match(policy, /title,/);
  assert.match(policy, /artist,/);
  assert.match(policy, /album: APP_TITLE/);
  assert.match(policy, /artwork: artworkEntries/);
  assert.match(policy, /player\.dataset\.mediaArtwork/);
});

test('real speaker portrait is the only artwork candidate so OS cannot prefer app icons', () => {
  assert.match(policy, /mediaArtworkEntries/);
  assert.match(policy, /if \(!isDefaultArtworkUrl\(artwork\)\)/);
  assert.match(policy, /return \[\{ src: artwork \}\]/);
  assert.match(policy, /DEFAULT_ARTWORK_PATHS/);
});

test('system playback controls directly control audio and bridge iOS system intent', () => {
  assert.match(policy, /playFromSystemControl/);
  assert.match(policy, /pauseFromSystemControl/);
  assert.match(policy, /echostars:grant-playback-intent/);
  assert.match(policy, /void audio\.play\(\)/);
  assert.match(policy, /audio\.pause\(\)/);
  assert.doesNotMatch(policy, /toggle\.click\(\)/);
  assert.doesNotMatch(policy, /toggleThroughApp/);
  assert.match(policy, /safeSetActionHandler\('play'/);
  assert.match(policy, /safeSetActionHandler\('pause'/);
  assert.match(policy, /safeSetActionHandler\('seekbackward'/);
  assert.match(policy, /safeSetActionHandler\('seekforward'/);
  assert.match(policy, /safeSetActionHandler\('seekto'/);
  assert.match(policy, /setPositionState/);
  assert.match(policy, /playbackState/);
});

test('media session loads before the React bootstrap and PWA exposes monochrome icon', () => {
  const mediaIndex = indexHtml.indexOf('/src/mediaSessionPolicy.ts');
  const bootstrapIndex = indexHtml.indexOf('/src/categoryIntegrityBootstrap.ts');
  assert.ok(mediaIndex >= 0);
  assert.ok(bootstrapIndex >= 0);
  assert.ok(mediaIndex < bootstrapIndex);
  assert.match(bootstrap, /await import\('\.\/main'\)/);
  assert.match(manifest, /icon-monochrome\.svg/);
  assert.match(manifest, /"purpose": "monochrome"/);
  assert.match(serviceWorker, /icon-monochrome\.svg/);
});