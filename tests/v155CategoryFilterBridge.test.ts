import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('v155 category bridge pre-opens the real React option before replaying v145 click', async () => {
  const source = await readFile('src/v155CategoryFilterBridge.ts', 'utf8');
  assert.match(source, /\[data-v145-menu="category"\]/);
  assert.match(source, /ensureOriginalCategoryOption/);
  assert.match(source, /event\.stopImmediatePropagation\(\)/);
  assert.match(source, /currentOption\.click\(\)/);
  assert.match(source, /categoryFromLabel/);
});

test('v155 category bridge is loaded after the v145 toolbar', async () => {
  const html = await readFile('index.html', 'utf8');
  const v145 = html.indexOf('/src/v145FourFilterToolbar.ts');
  const v155 = html.indexOf('/src/v155CategoryFilterBridge.ts');
  assert.ok(v145 >= 0, 'v145 toolbar must remain loaded');
  assert.ok(v155 > v145, 'v155 bridge must load after v145 so it can stabilize its category menu');
});
