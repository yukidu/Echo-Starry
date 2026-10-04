import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const spotlight = readFileSync(new URL('../src/components/TutorialSpotlight.tsx', import.meta.url), 'utf8');

test('homepage tutorial uses the requested concise copy and member feature list', () => {
  assert.match(app, /text: '回首頁'/);
  assert.match(app, /text: '按照片播放\/暫停'/);
  assert.match(app, /註冊會員\\n才有完整功能\\n\\n記憶播放進度\\n生命靈數分析\\n累積星幣點數\\n收藏我的最愛\\n超多有趣功能等你發現/);
  assert.doesNotMatch(app, /按此回首頁/);
  assert.doesNotMatch(app, /按照片可播放或暫停/);
  assert.doesNotMatch(app, /按此註冊會員/);
  assert.match(spotlight, /打勾不再顯示新手教學/);
  assert.doesNotMatch(spotlight, /打勾不再提醒/);
});

test('phone tutorial control stays near the photo callout and follows viewport height changes', () => {
  assert.match(spotlight, /belowPhotoCallout = photo\.position\.top \+ photo\.position\.height \+ 16/);
  assert.match(spotlight, /roomBelow = belowPhotoCallout \+ controlHeight <= viewport\.height - 12/);
  assert.match(spotlight, /roomBelow \? belowPhotoCallout : abovePhotoCallout/);
  assert.match(spotlight, /window\.addEventListener\('resize', update\)/);
  assert.match(spotlight, /window\.addEventListener\('orientationchange', update\)/);
  assert.match(spotlight, /whiteSpace: 'pre-line'/);
  assert.match(spotlight, /key === 'visitor'[^\n]*isPhone \? 176/);
});
