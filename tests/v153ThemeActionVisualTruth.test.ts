import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('theme action text is owned by React instead of a CSS pseudo-element fallback', () => {
  assert.doesNotMatch(indexHtml, /echostars-v153-theme-action-label/);
  assert.doesNotMatch(indexHtml, /lucide-moon \+ span::after/);
  assert.doesNotMatch(indexHtml, /lucide-sun \+ span::after/);
  assert.match(navbar, /const themeActionLabel = isDark \? '開燈' : '關燈'/);
  assert.match(navbar, /<span className="min-w-0 flex-1">\{themeActionLabel\}<\/span>/);
});

test('PWA activation immediately takes control so installed apps can receive the current React bundle', () => {
  assert.match(sw, /self\.skipWaiting\(\)/);
  assert.match(sw, /self\.clients\.claim\(\)/);
});
