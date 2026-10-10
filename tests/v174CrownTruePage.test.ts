import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/v174CrownTruePage.css', import.meta.url), 'utf8');
const mode = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v174ReleaseNote.ts', import.meta.url), 'utf8');

test('v174 loads after the legacy Crown integration and converts it to document flow', () => {
  assert.match(index, /\/src\/v174CrownTruePage\.ts/);
  assert.match(css, /#taiwan-crown-integrated-page\.taiwan-crown-overlay[\s\S]*?position:\s*static\s*!important/);
  assert.match(css, /#root\s*>\s*div\s*>\s*main[\s\S]*?display:\s*none\s*!important/);
  assert.match(css, /overflow:\s*visible\s*!important/);
  assert.doesNotMatch(css, /backdrop-filter/);
});

test('v174 restores natural scrolling when leaving the Crown page', () => {
  assert.match(mode, /returnScrollY = window\.scrollY/);
  assert.match(mode, /window\.scrollTo\(\{ top: 0, behavior: 'auto' \}\)/);
  assert.match(mode, /window\.scrollTo\(\{ top: returnScrollY, behavior: 'auto' \}\)/);
});

test('v174 is formally recorded in the bottom changelog', () => {
  assert.match(index, /\/src\/v174ReleaseNote\.ts/);
  assert.match(release, /version:\s*'v174'/);
  assert.match(release, /真正的站內頁面流/);
  assert.match(release, /不再透出首頁音檔卡片/);
});
