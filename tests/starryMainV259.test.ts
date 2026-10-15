import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const game = readFileSync(new URL('../worker/starryMainBatteryGameRouter.ts', import.meta.url), 'utf8');
const login = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('Starry main meteor reward is generated server-side between 0.01 and 0.09', () => {
  assert.match(game, /crypto\.getRandomValues\(bytes\)/);
  assert.match(game, /\(bytes\[0\] % 9\) \+ 1/);
  assert.match(game, /deltaHundredths/);
  assert.match(game, /rewardHundredths/);
  assert.match(game, /const added = Number\(\(rewardHundredths \/ 100\)\.toFixed\(2\)\)/);
});

test('Starry main Google login keeps the current page and allows credentialed central exchange', () => {
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(login, /const MAIN_ORIGIN = 'https:\/\/starry\.phd'/);
  assert.match(login, /url\.pathname === GOOGLE_SYNC_PATH/);
  assert.match(login, /Access-Control-Allow-Origin', MAIN_ORIGIN/);
  assert.match(login, /Access-Control-Allow-Credentials', 'true'/);
  assert.match(login, /ux_mode: 'popup'/);
});
