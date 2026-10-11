import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/v179CrownPolish.css', import.meta.url), 'utf8');
const ts = readFileSync(new URL('../src/v179CrownPolish.ts', import.meta.url), 'utf8');
const entry = readFileSync(new URL('../src/v174CrownTruePage.ts', import.meta.url), 'utf8');

test('v179 keeps the approved smaller quote size with mobile override', () => {
  assert.match(css, /\.taiwan-crown-overlay \.taiwan-crown-card \.taiwan-crown-card-quote[\s\S]*font-size:\s*1\.04em\s*!important/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*font-size:\s*0\.96em\s*!important/);
  assert.match(css, /font-weight:\s*400\s*!important/);
});

test('v179 uses independent spark nodes with different durations, delays and brightness', () => {
  assert.match(ts, /const SPARKS/);
  assert.match(ts, /duration:\s*5\.7/);
  assert.match(ts, /duration:\s*10\.4/);
  assert.match(ts, /max:\s*1/);
  assert.match(ts, /max:\s*0\.68/);
  assert.match(css, /taiwanCrownIndependentSpark/);
  assert.match(css, /var\(--spark-duration\)/);
  assert.match(css, /var\(--spark-delay\)/);
});

test('v179 is loaded after v178', () => {
  assert.match(entry, /import '\.\/v178CrownDiagonalReflection';[\s\S]*import '\.\/v179CrownPolish';/);
});
