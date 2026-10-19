import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layoutFix = readFileSync(new URL('../src/v189MobilePermissionLayoutFix.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('mobile permission controls are isolated into stable rows', () => {
  assert.match(layoutFix, /\[data-upload-permission="1"\][\s\S]*grid-row: 5 !important/);
  assert.match(layoutFix, /\[data-upload-guest-visibility="true"\][\s\S]*grid-row: 6 !important/);
  assert.match(layoutFix, /\[data-upload-vip="1"\][\s\S]*grid-row: 7 !important/);
  assert.match(layoutFix, /\[data-upload-cover-library="1"\][\s\S]*grid-row: 8 !important/);
});

test('mobile visibility checkboxes keep a fixed compact size', () => {
  assert.match(layoutFix, /input\[type="checkbox"\][\s\S]*width: 1\.25rem !important/);
  assert.match(layoutFix, /max-width: 1\.25rem !important/);
  assert.match(layoutFix, /flex: 0 0 1\.25rem !important/);
});

test('React-owned upload form mounts its presentation while permission CSS remains available',()=>{
 const upload=readFileSync(new URL('../src/components/UploadModal.tsx',import.meta.url),'utf8');
 const policy=readFileSync(new URL('../src/uploadModalPresentationPolicy.ts',import.meta.url),'utf8');
 assert.match(upload,/prepareAudioFormPresentation\(formElementRef\.current\)/);
 assert.match(policy,/export function prepareAudioFormPresentation/);
 assert.ok(index.includes('/src/v189MobilePermissionLayoutFix.ts'));
 assert.doesNotMatch(index,/script type="module" src="\/src\/uploadModalPresentationPolicy\.ts"/);
});
