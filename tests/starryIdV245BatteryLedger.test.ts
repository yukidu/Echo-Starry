import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');
const entry = fs.readFileSync('worker/starryIdV245Entry.ts','utf8');
const wrangler = fs.readFileSync('wrangler.toml','utf8');

test('v245 exposes read-only central battery balance and full ledger routes', () => {
  assert.match(router, /\/api\/battery-ledger\/summary/);
  assert.match(router, /\/api\/battery-ledger/);
  assert.match(router, /\/battery-ledger/);
  assert.match(router, /FROM battery_accounts WHERE userId=\?/);
  assert.match(router, /FROM battery_transactions WHERE/);
  assert.match(router, /sourceApp=\?/);
  assert.match(router, /sourceAppLabel/);
});

test('v245 battery field is readonly and has its own public visibility control', () => {
  assert.match(router, /電池數量/);
  assert.match(router, /中央電池餘額，無法手動修改/);
  assert.match(router, /fieldName='battery'/);
  assert.match(router, /visibility:\{battery:next\}/);
  assert.match(router, /enhancePublicCard/);
  assert.match(router, /<div class=\"label\">電池數量<\/div>/);
});

test('v245 ecosystem menu includes current Starry apps and battery ledger', () => {
  for (const expected of [
    'https://starry.phd','https://id.starry.phd','https://echo.starry.phd','https://download.starry.phd',
    'https://go.starry.phd','https://quotes.starry.phd','https://box.starry.phd','https://starbeauty.yukidu.workers.dev'
  ]) assert.ok(router.includes(expected), `missing ${expected}`);
  assert.match(router, /🔋 電池餘額日誌/);
});

test('v245 entry remains a thin wrapper around the established privacy router', () => {
  assert.match(entry, /import baseWorker from '\.\/privacyCrawlerRouter'/);
  assert.match(entry, /const direct = await handleStarryIdV245Battery/);
  assert.match(entry, /const response = await baseWorker\.fetch/);
  assert.match(entry, /enhanceStarryIdV245Response/);
  assert.match(wrangler, /main = "worker\/starryIdV245Entry\.ts"/);
});
