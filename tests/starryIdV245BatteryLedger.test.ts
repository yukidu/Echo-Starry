import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const router = fs.readFileSync('worker/starryIdV245BatteryRouter.ts','utf8');
const menu = fs.readFileSync('worker/starryIdV256UnifiedMenu.ts','utf8');
const privacy = fs.readFileSync('worker/privacyCrawlerRouter.ts','utf8');
const batteryRouter = fs.readFileSync('worker/starryMainBatteryGameRouter.ts','utf8');
const inlineLoginRouter = fs.readFileSync('worker/starryMainInlineLoginRouter.ts','utf8');
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

test('v256 restored unified menu keeps the battery ledger entry without menu ownership in the battery enhancer', () => {
  assert.match(menu, /電池餘額日誌/);
  assert.match(menu, /'\/battery-ledger'/);
  assert.match(menu, /v256-menu-panel/);
  assert.doesNotMatch(router, /function syncMenu\(/);
});

test('v245 stays inside the established privacy router and does not replace the Worker entry', () => {
  assert.match(privacy, /handleStarryIdV245Battery/);
  assert.match(privacy, /enhanceStarryIdV245Response/);
  assert.match(privacy, /const starryV245Direct = await handleStarryIdV245Battery/);
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(inlineLoginRouter, /import appWorker from '\.\/starryMainBatteryGameRouter'/);
  assert.match(batteryRouter, /import appWorker from '\.\/privacyCrawlerRouter'/);
  assert.doesNotMatch(wrangler, /starryIdV245Entry/);
});
