import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/v174CrownTruePage.css', import.meta.url), 'utf8');
const release = readFileSync(new URL('../src/v175ReleaseNote.ts', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('v175 removes the in-page Crown back-to-playlist row from the visible UI', () => {
  assert.match(
    css,
    /body\[data-taiwan-crown-open="true"\][\s\S]*?\.taiwan-crown-page-top\s*\{[\s\S]*?display:\s*none\s*!important/
  );
});

test('v175 changelog is loaded and records the removed button', () => {
  assert.match(index, /\/src\/v175ReleaseNote\.ts/);
  assert.match(release, /version:\s*'v175'/);
  assert.match(release, /返回播放清單/);
});
