import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const spotlight = readFileSync(new URL('../src/components/TutorialSpotlight.tsx', import.meta.url), 'utf8');

test('home tutorial uses the requested concise copy and explicit line breaks', () => {
  assert.match(app, /text: '回首頁'/);
  assert.match(app, /text: '按照片\\n播放\/暫停'/);
  assert.match(app, /註冊會員\\n才有完整功能\\n\\n記憶播放進度\\n生命靈數分析\\n累積星幣點數\\n收藏我的最愛\\n超多有趣功能等你發現/);
  assert.match(spotlight, /whiteSpace: 'pre-line'/);
  assert.match(spotlight, /打勾不再顯示新手教學/);
});

test('tutorial opt-out control follows the photo callout on viewport changes', () => {
  assert.match(spotlight, /const photoCallout = positions\.find\(item => item\.target\.key === 'photo'\)/);
  assert.match(spotlight, /const belowTop = photoCallout\.position\.top \+ photoCallout\.position\.height \+ gap/);
  assert.match(spotlight, /const aboveTop = photoCallout\.position\.top - controlHeight - gap/);
  assert.match(spotlight, /fitsBelow \? belowTop : aboveTop/);
  assert.match(spotlight, /window\.addEventListener\('resize', update\)/);
  assert.match(spotlight, /window\.addEventListener\('orientationchange', update\)/);
});
