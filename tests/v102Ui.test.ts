import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('cover sticker and permission labels restore only the v100 7/8px presentation size', () => {
  assert.match(html, /button\[title\^="點擊照片"\][\s\S]*font-size: 7px !important/);
  assert.match(html, /@media \(min-width: 640px\)[\s\S]*font-size: 8px !important/);
});

test('lucky draw shows the reel immediately on pointerdown while React keeps winner authority', () => {
  assert.match(html, /addEventListener\('pointerdown'/);
  assert.match(html, /classList\.add\('lucky-immediate-active'\)/);
  assert.match(html, /lucky-spin-active/);
  assert.match(html, /lucky-win-active/);
});

test('admin management is visually promoted from overlay modal to normal full-page content', () => {
  assert.match(html, /body:has\(\.app-modal-overlay\) main \{ display: none !important; \}/);
  assert.match(html, /\.app-modal-overlay \{[\s\S]*position: static !important/);
  assert.match(html, /max-height: none !important/);
});


const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const stickers = readFileSync(new URL('../src/components/StickersModal.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('couple dealer id flow asks once and keeps personal names separate from A&B display', () => {
  assert.match(profile, /是否要綁定與 \$\{data\.candidate\.name\} 為夫妻關係嗎/);
  assert.match(profile, /\/api\/couples\/bind/);
  assert.match(profile, /name:\s*name\.trim\(\)/);
  assert.match(profile, /coupleDisplayName \|\| currentUser\.name/);
});

test('platinum grant page exposes shared dealer-id invite copy and app sharing', () => {
  assert.match(stickers, /綁定成為我下線/);
  assert.match(stickers, /複製網址/);
  assert.match(stickers, /傳 LINE 或 APP/);
  assert.match(stickers, /\/api\/upline-invite\/link/);
  assert.match(app, /\/upline\/\(\[\^\/\]\+\)/);
  assert.match(app, /\/api\/upline-invite\/accept/);
});
