import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const offline = readFileSync(new URL('../src/utils/offlineAudio.ts', import.meta.url), 'utf8');

test('timeline seek buffering does not reopen the fullscreen initial-load overlay', () => {
  assert.match(app, /audioInitialLoadRef/);
  assert.match(app, /onWaiting=\{\(\) => \{[\s\S]*audioInitialLoadRef\.current/);
  assert.doesNotMatch(app, /onWaiting=\{\(\) => setIsLoadingAudio\(true\)\}/);
  assert.match(app, /onCanPlay=\{finishInitialAudioLoad\}/);
  assert.match(app, /onPlaying=\{finishInitialAudioLoad\}/);
  assert.match(app, /正在準備音訊播放/);
});

test('offline audio remains a real verified Cache Storage download', () => {
  assert.match(offline, /caches\.open\(AUDIO_CACHE\)/);
  assert.match(offline, /await cache\.put\(audioUrl, response\.clone\(\)\)/);
  assert.match(offline, /if \(!\(await cache\.match\(audioUrl\)\)\) return false/);
  assert.match(offline, /markCached\(trackId, audioUrl\)/);
  assert.match(offline, /priority: 'low'/);
  assert.match(offline, /cacheQueue/);
});

test('completed recordings stay offline until the retention window expires', () => {
  assert.match(offline, /if \(ratio > 0\.95\) record\.completed = true/);
  const progressStart = offline.indexOf('export function handleTrackProgressOffline');
  const progressEnd = offline.indexOf('/** Remove one track', progressStart);
  const progressSection = offline.slice(progressStart, progressEnd);
  assert.doesNotMatch(progressSection, /removeOfflineTrack\(/);
  assert.match(offline, /now - record\.lastListenedAt > RETENTION_MS/);
  assert.doesNotMatch(offline, /\|\| record\.completed/);
  assert.match(offline, /navigator\.storage\.persist\(\)/);
});
