import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v152 hamburger theme action label is rendered directly by React', () => {
  assert.match(navbar, /const themeActionLabel = isDark \? '開燈' : '關燈'/);
  assert.match(navbar, /renderPinControl\('theme', themeActionLabel\)/);
  assert.match(navbar, /<span className="min-w-0 flex-1">\{themeActionLabel\}<\/span>/);
});

test('v152 does not load the retired DOM text observer patch', () => {
  assert.doesNotMatch(indexHtml, /\/src\/v150ThemeActionLabel\.ts/);
});
