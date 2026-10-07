import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/AudioCard.css', import.meta.url), 'utf8');

test('all top cover status variants use the opaque current palette primary color', () => {
  assert.match(
    css,
    /button\[title\^="點擊照片"\]\s*>\s*div\.absolute\.top-0\s*\{[\s\S]*background-color:\s*var\(--color-primary,\s*#c06c84\)\s*!important;[\s\S]*opacity:\s*1\s*!important;/
  );
});
