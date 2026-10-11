import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const themedSelect = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');
const layoutFix = readFileSync(new URL('../src/v188UploadPermissionLayoutFix.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('upload permission selector and guest visibility block keep their existing React controls', () => {
  assert.match(upload, /data-upload-guest-visibility="true"/);
  assert.match(upload, /瀏覽權限最低門檻獎銜/);
  assert.match(upload, /<ThemedSelect[\s\S]*value=\{requiredRank\}/);
  assert.match(themedSelect, /sr-only pointer-events-none/);
});

test('v188 separates permission, guest visibility, VIP and cover library rows on mobile', () => {
  assert.match(layoutFix, /\[data-upload-permission="1"\][\s\S]*grid-row: 5 !important/);
  assert.match(layoutFix, /\[data-upload-guest-visibility="true"\][\s\S]*grid-row: 6 !important/);
  assert.match(layoutFix, /\[data-upload-vip="1"\][\s\S]*grid-row: 7 !important/);
  assert.match(layoutFix, /\[data-upload-cover-library="1"\][\s\S]*grid-row: 8 !important/);
});

test('v188 layout override loads after the older upload presentation policy', () => {
  const baseIndex = index.indexOf('/src/uploadModalPresentationPolicy.ts');
  const fixIndex = index.indexOf('/src/v188UploadPermissionLayoutFix.ts');
  assert.ok(baseIndex >= 0);
  assert.ok(fixIndex > baseIndex);
});
