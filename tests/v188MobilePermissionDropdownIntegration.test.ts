import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');
const themedSelect = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');

test('upload permission selector still uses the shared ThemedSelect component', () => {
  assert.match(upload, /瀏覽權限最低門檻獎銜/);
  assert.match(upload, /<ThemedSelect[\s\S]*value=\{requiredRank\}/);
});

test('mobile shared select exposes a real native select instead of a pointer-events-disabled control', () => {
  assert.match(themedSelect, /className=\{`\$\{className \|\| ''\} md:hidden`\}/);
  assert.doesNotMatch(themedSelect, /pointer-events-none/);
});
