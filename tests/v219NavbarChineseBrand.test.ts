import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const navbar = readFileSync(new URL('../src/components/Navbar.tsx', import.meta.url), 'utf8');

test('v219: top-left site label is 繁星回聲', () => {
  assert.match(navbar, />繁星回聲<\/span>/);
  assert.doesNotMatch(navbar, />Echo-Starry<\/span>/);
});
