import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/memberProfileSchemaBridge.ts', import.meta.url), 'utf8');

test('profile edit keeps only the primary motto editor', () => {
  assert.match(mottoUi, /dataset\.profileMottoPrimary = '1'/);
  assert.match(mottoUi, /removeLegacyMottoUi/);
  assert.match(mottoUi, /data-starry-extension-field=\"motto\"/);
  assert.match(bridge, /ECHO_MANAGED_EXTENSION_FIELDS = new Set\(\['motto'\]\)/);
});

test('profile save actions are prominent and mobile friendly', () => {
  assert.match(mottoUi, /FLOATING_ACTIONS_ID/);
  assert.match(mottoUi, /min-h-\[68px\]/);
  assert.match(mottoUi, /profileNativeSave/);
  assert.match(mottoUi, /profileFloatingSave/);
  assert.match(mottoUi, /💾 儲存/);
});

test('profile edit DOM observer cannot create a disabled-attribute feedback loop', () => {
  assert.match(mottoUi, /observer\?\.disconnect\(\)/);
  assert.match(mottoUi, /requestAnimationFrame/);
  assert.match(mottoUi, /childList: true, subtree: true/);
  assert.doesNotMatch(mottoUi, /attributeFilter:\s*\['disabled'\]/);
  assert.doesNotMatch(mottoUi, /floatingSave\.disabled\s*=\s*nativeSave\.disabled/);
});

test('non-edit motto display is read-only and never contains a dice button', () => {
  assert.match(mottoUi, /Non-edit mode deliberately has no dice button/);
  assert.match(mottoUi, /section\.querySelectorAll\('\[data-profile-motto-dice\], button'\)\.forEach/);
  assert.match(mottoUi, /dice\.dataset\.profileMottoDice = 'edit-only'/);
});
