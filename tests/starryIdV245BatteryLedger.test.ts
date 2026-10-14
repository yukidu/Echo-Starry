import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');
const menu = fs.readFileSync('worker/starryIdV216Enhancer.ts','utf8');
const privacy = fs.readFileSync('worker/privacyCrawlerRouter.ts','utf8');
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

test('v249 keeps current ecosystem menu links and battery ledger in the single v216 menu owner', () => {
  for (const expected of [
    'https://starry.phd','https://id.starry.phd','https://echo.starry.phd','https://download.starry.phd',
    'https://go.starry.phd','https://quotes.starry.phd','https://box.starry.phd'
  ]) assert.ok(menu.includes(expected), `missing ${expected}`);
  assert.doesNotMatch(menu, /美力之星|starbeauty\.yukidu\.workers\.dev/);
  assert.match(menu, /🔋 電池餘額日誌/);
  assert.doesNotMatch(router, /function syncMenu\(/);
});

test('v245 stays inside the established privacy router and does not replace the Worker entry', () => {
  assert.match(privacy, /handleStarryIdV245Battery/);
  assert.match(privacy, /enhanceStarryIdV245Response/);
  assert.match(privacy, /const starryV245Direct = await handleStarryIdV245Battery/);
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.doesNotMatch(wrangler, /starryIdV245Entry/);
});
