import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v155 category switching finds the category trigger by stable toolbar structure, not its changing text', async () => {
  const source = await readFile('src/v145FourFilterToolbar.ts', 'utf8');
  assert.match(source, /function findOriginalCategoryButton\(\)[\s\S]*buttons\[buttons\.length - 1\]/);
  assert.match(source, /function setOriginalCategory\(category: string\)[\s\S]*const liveToolbar = getOriginalToolbar\(\)[\s\S]*const liveCategoryButton = findOriginalCategoryButton\(\)/);
  assert.doesNotMatch(source, /const categoryButton = findOriginalButton\('分類'\)/);
});

test('v155 no longer loads the temporary click-replay bridge', async () => {
  const html = await readFile('index.html', 'utf8');
  assert.match(html, /\/src\/v145FourFilterToolbar\.ts/);
  assert.doesNotMatch(html, /\/src\/v155CategoryFilterBridge\.ts/);
});
