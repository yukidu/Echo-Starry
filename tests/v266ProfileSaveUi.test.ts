import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/memberProfileSchemaBridge.ts', import.meta.url), 'utf8');

test('profile edit keeps only the primary motto editor', () => {
  assert.match(mottoUi, /dataset\.profileMottoPrimary = '1'/);
  assert.doesNotMatch(mottoUi, /function makeDisplayCard/);
  assert.doesNotMatch(mottoUi, /function ensureDisplay/);
  assert.match(bridge, /ECHO_MANAGED_EXTENSION_FIELDS = new Set\(\['motto'\]\)/);
});

test('profile save actions are prominent and mobile friendly', () => {
  assert.match(mottoUi, /FLOATING_ACTIONS_ID/);
  assert.match(mottoUi, /min-h-\[68px\]/);
  assert.match(mottoUi, /profileNativeSave/);
  assert.match(mottoUi, /profileFloatingSave/);
  assert.match(mottoUi, /💾 儲存/);
  assert.match(mottoUi, /✅ 個人資料與座右銘已儲存/);
});

test('profile edit DOM observer cannot create a disabled-attribute feedback loop', () => {
  assert.match(mottoUi, /observer\?\.disconnect\(\)/);
  assert.match(mottoUi, /requestAnimationFrame/);
  assert.match(mottoUi, /childList: true, subtree: true/);
  assert.doesNotMatch(mottoUi, /attributeFilter:\s*\['disabled'\]/);
  assert.doesNotMatch(mottoUi, /floatingSave\.disabled\s*=\s*nativeSave\.disabled/);
});
