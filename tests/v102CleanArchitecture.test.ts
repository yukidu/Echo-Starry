import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const admin = readFileSync(new URL('../src/components/AdminModal.tsx', import.meta.url), 'utf8');
const cardCss = readFileSync(new URL('../src/components/AudioCard.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('cover progress and permission overlays restore only the v100 7px/8px font size', () => {
  assert.match(cardCss, /button\[title\^="點擊照片"\][\s\S]*font-size:\s*7px\s*!important/);
  assert.match(cardCss, /@media \(min-width: 640px\)[\s\S]*button\[title\^="點擊照片"\][\s\S]*font-size:\s*8px\s*!important/);
});

test('lucky draw enters spin state before waiting for sticker authorization', () => {
  const start = app.indexOf('const handleLuckyDraw =');
  const end = app.indexOf('// Rated tracks by current user for BW export', start);
  assert.ok(start >= 0 && end > start, 'lucky draw handler must exist');
  const handler = app.slice(start, end);
  const immediateSpin = handler.indexOf("setLuckyPhase('spin')");
  const request = handler.indexOf("apiJson('/api/stickers/lucky-spend'");
  assert.ok(immediateSpin >= 0, 'spin state must be set immediately');
  assert.ok(request > immediateSpin, 'server request must be started only after immediate spin state is visible');
  assert.match(handler, /const approvalPromise/);
  assert.match(handler, /spin\(\);/);
  assert.doesNotMatch(html, /lucky-immediate-active|MutationObserver[\s\S]*lucky-spin-active/);
});

test('admin management is rendered as a real main-content page, not a CSS-disguised overlay', () => {
  assert.match(app, /isAdminOpen \? 'max-w-6xl' : 'max-w-3xl'/);
  assert.match(app, /<AdminModal\s+presentation="page"/);
  assert.doesNotMatch(app, /Admin Management Modal/);
  assert.match(admin, /presentation\?: 'modal' \| 'page'/);
  assert.match(admin, /isPagePresentation \? 'w-full' : 'app-modal-overlay fixed/);
  assert.match(admin, /isPagePresentation \? 'p-4 sm:p-5 space-y-3\.5 text-xs'/);
});
