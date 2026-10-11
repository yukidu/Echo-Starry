import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');

test('mobile renders the real select while desktop custom trigger is responsive-hidden', () => {
  assert.match(source, /md:hidden/);
  assert.match(source, /hidden md:block/);
  assert.match(source, /browser-native select/);
});
