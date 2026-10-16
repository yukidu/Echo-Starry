import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');
const mottoRouter = readFileSync(new URL('../worker/starryIdRandomMottoRouter.ts', import.meta.url), 'utf8');
const mainRouter = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts', import.meta.url), 'utf8');
const starrySync = readFileSync(new URL('../worker/starryIdSync.ts', import.meta.url), 'utf8');

test('Echo member profile exposes editable motto with Quotes Starry dice', () => {
  assert.match(main, /import '\.\/v264ProfileMotto'/);
  assert.match(mottoUi, /座右銘/);
  assert.match(mottoUi, /🎲 隨機一句/);
  assert.match(mottoUi, /\/api\/random-motto/);
  assert.match(mottoUi, /quotes\.starry\.phd/);
  assert.match(mottoUi, /method: 'PUT'/);
  assert.match(mottoUi, /\/api\/users\//);
  assert.match(mottoUi, /motto: motto\.trim\(\)/);
});

test('random motto endpoint is shared by Echo and Starry ID from Quotes Starry source', () => {
  assert.match(mottoRouter, /const ID_HOST = 'id\.starry\.phd'/);
  assert.match(mottoRouter, /const ECHO_HOST = 'echo\.starry\.phd'/);
  assert.match(mottoRouter, /https:\/\/quotes\.starry\.phd\//);
  assert.match(mottoRouter, /docs\.google\.com\/spreadsheets/);
  assert.match(mottoRouter, /source: 'https:\/\/quotes\.starry\.phd\/'/);
  assert.match(mainRouter, /handleStarryIdRandomMotto/);
});

test('motto remains a Starry ID central synchronized member field', () => {
  assert.match(starrySync, /['"]motto['"]/);
  assert.match(starrySync, /SHARED_PROFILE_FIELDS/);
  assert.match(starrySync, /syncEchoMemberToStarry/);
});
