import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const themedSelect = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');
const layoutFix = readFileSync(new URL('../src/v188UploadPermissionLayoutFix.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

test('upload permission selector and guest visibility block keep their existing React controls', () => {
  assert.match(upload, /data-upload-guest-visibility="true"/);
  assert.match(upload, /瀏覽權限最低門檻獎銜/);
  assert.match(upload, /<ThemedSelect[\s\S]*value=\{requiredRank\}/);
});

test('v188 uses a real native select on mobile while retaining the desktop themed listbox', () => {
  assert.match(themedSelect, /matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(themedSelect, /if \(useNativeMobile\) \{[\s\S]*return <select/);
  assert.match(themedSelect, /touchAction:'manipulation'/);
  assert.match(themedSelect, /sr-only pointer-events-none/);
  assert.match(themedSelect, /createPortal/);
});

test('v188 mobile native select forwards the selected value to React state', () => {
  assert.match(themedSelect, /setLocal\(event\.target\.value\)/);
  assert.match(themedSelect, /onChange\?\.\(event\)/);
});

test('v188 restores the mobile field section as a real one-column grid', () => {
  assert.match(layoutFix, /\[data-upload-fields-grid="1"\][\s\S]*display: grid !important/);
  assert.match(layoutFix, /grid-template-columns: minmax\(0, 1fr\) !important/);
});

test('v188 gives permission, visibility and VIP their own mobile rows', () => {
  assert.match(layoutFix, /\[data-upload-permission="1"\][\s\S]*grid-row: 7 !important/);
  assert.match(layoutFix, /\[data-upload-guest-visibility="true"\][\s\S]*grid-row: 8 !important/);
  assert.match(layoutFix, /\[data-upload-vip="1"\][\s\S]*grid-row: 9 !important/);
  assert.match(layoutFix, /pointer-events: auto !important/);
});

test('v188 layout override loads after the older upload presentation policy', () => {
  const baseIndex = index.indexOf('/src/uploadModalPresentationPolicy.ts');
  const fixIndex = index.indexOf('/src/v188UploadPermissionLayoutFix.ts');
  assert.ok(baseIndex >= 0);
  assert.ok(fixIndex > baseIndex);
});

test('v188 bumps the PWA shell cache so installed previews reload the corrected UI', () => {
  assert.match(sw, /echostars-shell-v188/);
});
