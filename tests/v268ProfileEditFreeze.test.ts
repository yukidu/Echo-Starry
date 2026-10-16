import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');

test('profile edit observer is bounded and cannot lock the page', () => {
  assert.match(mottoUi, /let scheduled = false/);
  assert.match(mottoUi, /requestAnimationFrame/);
  assert.match(mottoUi, /observer\?\.disconnect\(\)/);
  assert.match(mottoUi, /observer\?\.observe\(document\.documentElement, \{ childList: true, subtree: true \}\)/);
  assert.doesNotMatch(mottoUi, /attributes: true/);
  assert.doesNotMatch(mottoUi, /attributeFilter:\s*\['disabled'\]/);
});

test('floating save actions remain large while avoiding disabled-state mutation feedback', () => {
  assert.match(mottoUi, /min-h-\[68px\]/);
  assert.match(mottoUi, /💾 儲存/);
  assert.match(mottoUi, /取消/);
  assert.doesNotMatch(mottoUi, /floatingSave\.disabled\s*=\s*nativeSave\.disabled/);
});
