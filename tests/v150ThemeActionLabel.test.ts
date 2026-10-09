import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v150ThemeActionLabel.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v151 hamburger theme label describes the next action and recognizes the real deployed slash label', () => {
  assert.match(visual, /classList\.contains\('dark'\) \? '開燈' : '關燈'/);
  assert.match(visual, /'開燈\/關燈'/);
  assert.match(visual, /'開燈／關燈'/);
  assert.match(visual, /\^開燈\\s\*\[／\/\]\\s\*關燈\$/);
  assert.match(visual, /label\.textContent = nextLabel/);
  assert.match(visual, /attributeFilter: \['class'\]/);
});

test('v150 theme label patch is loaded after navbar visual patches', () => {
  const navbarFix = indexHtml.indexOf('/src/v147NavbarOverlayFix.ts');
  const v150 = indexHtml.indexOf('/src/v150ThemeActionLabel.ts');
  assert.ok(navbarFix >= 0);
  assert.ok(v150 > navbarFix);
});
