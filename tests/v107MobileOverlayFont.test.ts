import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/components/AudioCard.css', import.meta.url), 'utf8');

test('mobile audio-card photo overlay text is 13px while larger screens keep the existing size', () => {
  assert.match(css, /button\[title\^="點擊照片"\][\s\S]*?font-size:\s*13px\s*!important;/);
  assert.match(css, /@media \(min-width:\s*640px\)[\s\S]*?button\[title\^="點擊照片"\][\s\S]*?font-size:\s*8px\s*!important;/);
});
