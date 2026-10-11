import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/components/ThemedSelect.tsx', import.meta.url), 'utf8');

test('v188 uses the browser native select on phone-width screens', () => {
  assert.match(source, /matchMedia\('\(max-width: 767px\)'\)/);
  assert.match(source, /if \(useNativeMobile\)/);
  assert.match(source, /touchAction:'manipulation'/);
  assert.match(source, /minHeight:44/);
});

test('v188 keeps the themed portal listbox for desktop', () => {
  assert.match(source, /createPortal/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /aria-haspopup="listbox"/);
});

test('v188 mobile native select forwards changes to React state', () => {
  assert.match(source, /const handleNativeChange/);
  assert.match(source, /setLocal\(event\.target\.value\)/);
  assert.match(source, /onChange\?\.\(event\)/);
});
