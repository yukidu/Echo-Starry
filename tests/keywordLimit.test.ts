import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');
const community = readFileSync(new URL('../worker/community.ts', import.meta.url), 'utf8');

test('detail page enforces a 50-keyword limit without showing the retired count statistic', () => {
  assert.match(detail, /trackKeywords\.length < 50/);
  assert.match(detail, /trackKeywords\.length >= 50/);
  assert.match(detail, /網友關鍵字已達 50 組上限/);
  assert.doesNotMatch(detail, /\(\{trackKeywords\.length\}\/50 組\)/);
  assert.doesNotMatch(detail, /trackKeywords\.length < 20/);
  assert.doesNotMatch(detail, /trackKeywords\.length >= 20/);
});

test('production keyword API accepts up to 50 keywords and rejects the 51st', () => {
  assert.match(community, /keywords\.length >= 50/);
  assert.match(community, /每首最多50個關鍵字/);
  assert.doesNotMatch(community, /keywords\.length >= 20/);
  assert.doesNotMatch(community, /每首最多20個關鍵字/);
});
