import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v150ThemeActionLabel.ts', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v150 historical theme label patch still documents the next-action rule', () => {
  assert.match(visual, /classList\.contains\('dark'\) \? '開燈' : '關燈'/);
  assert.match(visual, /THEME_LABELS = new Set\(\['淺色／暗色切換', '開燈', '關燈', '開燈\/關燈', '開燈／關燈'\]\)/);
});

test('v152 retires the v150 DOM observer patch from production loading', () => {
  assert.doesNotMatch(indexHtml, /\/src\/v150ThemeActionLabel\.ts/);
});
