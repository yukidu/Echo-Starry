import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');

test('v188 mobile select remains native and tappable', () => {
  assert.match(source, /md:hidden/);
  assert.doesNotMatch(source, /pointer-events-none/);
});
