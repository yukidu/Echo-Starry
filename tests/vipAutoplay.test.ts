import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');

test('entering VIP/shared detail pages never starts audio automatically', () => {
  assert.doesNotMatch(main, /meta\[name="echostars-share-vip"\]/);
  assert.doesNotMatch(main, /function startVipShareAutoplay\(\)/);
  assert.doesNotMatch(main, /audio\.autoplay = true/);
  assert.doesNotMatch(main, /startVipShareAutoplay\(\);/);
  assert.match(main, /const nativeMediaPlay = HTMLMediaElement\.prototype\.play/);
  assert.match(main, /HTMLMediaElement\.prototype\.play = function manualPlaybackOnly\(\)/);
});

test('only an explicit playback control grants the next play call', () => {
  assert.match(main, /function isPlaybackControl\(target: EventTarget \| null\)/);
  assert.match(main, /開始播放\|繼續播放\|暫停播放\|照片播放\|照片暫停/);
  assert.match(main, /explicitPlaybackIntentUntil = performance\.now\(\) \+ 30_000/);
  assert.match(main, /document\.addEventListener\('pointerdown'/);
  assert.match(main, /event\.key === 'Enter' \|\| event\.key === ' '/);
  assert.match(main, /return nativeMediaPlay\.call\(this\)/);
});

test('blocked programmatic autoplay is rejected and fake playing UI is reset', () => {
  assert.match(main, /new DOMException\('Playback requires an explicit user action\.', 'NotAllowedError'\)/);
  assert.match(main, /function syncBlockedAutoplayUi\(media: HTMLMediaElement/);
  assert.match(main, /button\[aria-label="暫停播放"\]/);
  assert.match(main, /button\[title="點擊照片暫停"\]/);
  assert.doesNotMatch(main, /點一下開始播放/);
  assert.doesNotMatch(main, /瀏覽器阻擋了自動播放/);
});
