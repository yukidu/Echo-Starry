import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const visual = readFileSync(new URL('../src/v150ThemeActionLabel.ts', import.meta.url), 'utf8');

test('v151 theme action patch also recognizes the currently rendered legacy label', () => {
  assert.match(visual, /'開燈\/關燈'/);
  assert.match(visual, /'開燈／關燈'/);
  assert.match(visual, /classList\.contains\('dark'\) \? '開燈' : '關燈'/);
});
