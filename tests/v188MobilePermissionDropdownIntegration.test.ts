import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const themedSelect = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');
const layoutFix = readFileSync(new URL('../src/v188UploadPermissionLayoutFix.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('upload permission selector and guest visibility controls keep their React state bindings', () => {
  assert.match(upload, /data-upload-guest-visibility="true"/);
  assert.match(upload, /瀏覽權限最低門檻獎銜/);
  assert.match(upload, /value=\{requiredRank\}/);
  assert.match(upload, /checked=\{guestVisible\}/);
  assert.match(upload, /checked=\{authorizedOnlyVisible\}/);
  assert.match(themedSelect, /sr-only pointer-events-none/);
});

test('v188b forces permission and visibility controls into separate grid rows', () => {
  assert.match(layoutFix, /LEGACY_STYLE_ID/);
  assert.match(layoutFix, /\[data-upload-permission="1"\][\s\S]*grid-row: 5 !important/);
  assert.match(layoutFix, /\[data-upload-guest-visibility="true"\][\s\S]*grid-row: 6 !important/);
  assert.match(layoutFix, /\[data-upload-vip="1"\][\s\S]*grid-row: 7 !important/);
  assert.match(layoutFix, /\[data-upload-cover-library="1"\][\s\S]*grid-row: 8 !important/);
});

test('v188b stacks both visibility checkboxes vertically and keeps them out of select hit area', () => {
  assert.match(layoutFix, /\[data-upload-guest-visibility="true"\] > div[\s\S]*display: grid !important/);
  assert.match(layoutFix, /grid-template-columns: minmax\(0, 1fr\) !important/);
  assert.match(layoutFix, /\[data-upload-guest-visibility="true"\] input\[type="checkbox"\][\s\S]*width: 1\.25rem !important/);
  assert.match(layoutFix, /\[data-upload-permission="1"\] button[\s\S]*pointer-events: auto !important/);
});

test('v188 layout override loads after the older upload presentation policy', () => {
  const baseIndex = index.indexOf('/src/uploadModalPresentationPolicy.ts');
  const fixIndex = index.indexOf('/src/v188UploadPermissionLayoutFix.ts');
  assert.ok(baseIndex >= 0);
  assert.ok(fixIndex > baseIndex);
});