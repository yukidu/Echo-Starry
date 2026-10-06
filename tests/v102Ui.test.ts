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
