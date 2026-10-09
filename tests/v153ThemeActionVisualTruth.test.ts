import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('v153 hamburger theme label is forced by the action icon instead of any legacy text node', () => {
  assert.match(indexHtml, /id="echostars-v153-theme-action-label"/);
  assert.match(indexHtml, /svg\.lucide-moon \+ span::after[\s\S]*content: "關燈"/);
  assert.match(indexHtml, /svg\.lucide-sun \+ span::after[\s\S]*content: "開燈"/);
  assert.match(indexHtml, /svg\.lucide-moon \+ span,[\s\S]*svg\.lucide-sun \+ span[\s\S]*font-size: 0 !important/);
});

test('v153 rotates the PWA shell cache so installed apps receive the new menu label rule', () => {
  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v153'/);
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});
