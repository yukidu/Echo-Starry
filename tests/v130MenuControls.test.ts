import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const policy = readFileSync(new URL('../src/v130MenuControls.ts', import.meta.url), 'utf8');

test('v130 menu polish is loaded by the app bootstrap', () => {
  assert.match(main, /import '\.\/v130MenuControls';/);
});

test('home shortcut displays a two-line 回首頁 label', () => {
  assert.match(policy, /home\.setAttribute\('aria-label', '回首頁'\)/);
  assert.match(policy, /label\.textContent = '回首頁'/);
  assert.match(policy, /\.navbar-menu-home-shortcut \{[\s\S]*flex-direction: column !important/);
});

test('hamburger menu compensates user font zoom and keeps font controls left aligned', () => {
  assert.match(policy, /Math\.round\(\(1 \/ zoom\) \* 10000\)/);
  assert.match(policy, /panel\.style\.setProperty\('zoom'/);
  assert.match(policy, /v130-font-row/);
  assert.match(policy, /v130-font-label/);
});

test('installed palette shortcut is renamed to 換個心情', () => {
  assert.match(policy, /mood\.setAttribute\('aria-label', '換個心情'\)/);
  assert.match(policy, /label\.textContent = '換個心情'/);
});

test('reset menu uses existing pin handlers and keeps logout separate', () => {
  assert.match(policy, /resetCurrentDeviceMenu/);
  assert.match(policy, /button\.click\(\)/);
  assert.match(policy, /clickUnselected\('字體'\)/);
  assert.match(policy, /clickUnselected\('淺色／暗色切換'\)/);
  assert.match(policy, /logout\.insertAdjacentElement\('afterend', reset\)/);
  assert.doesNotMatch(policy, /logout\.replaceWith/);
});
