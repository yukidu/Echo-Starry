import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const themedSelect = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');

test('v188 uses a native select on mobile and keeps the custom listbox on desktop', () => {
  assert.match(themedSelect, /<select[\s\S]*md:hidden/);
  assert.match(themedSelect, /<button[\s\S]*hidden md:block/);
  assert.doesNotMatch(themedSelect, /className="sr-only pointer-events-none"/);
});

test('v188 mobile native select forwards changes to React state', () => {
  assert.match(themedSelect, /setLocal\(event\.target\.value\)/);
  assert.match(themedSelect, /onChange\?\.\(event\)/);
});
