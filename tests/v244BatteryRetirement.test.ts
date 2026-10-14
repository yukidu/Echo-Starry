import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const gateway = read('../worker/stickerRouter.ts');
const battery = read('../worker/batteryRouter.ts');
const upline = read('../worker/uplineAdminRouter.ts');
const retire = read('../starry-id/retireLegacyStickerLedger.ts');
const workflow = read('../.github/workflows/starry-id-migrate.yml');
const memberDelete = read('../worker/adminUserDeleteRouter.ts');

test('production never executes the legacy sticker currency engine when central Starry ID DB exists', () => {
  assert.match(gateway, /uplineAdminWorker from '\.\/uplineAdminRouter'/);
  assert.match(gateway, /if \(\(env as any\)\.STARRY_ID_DB\)/);
  assert.match(gateway, /return batteryWorker\.fetch\(request, env\)/);
  assert.match(gateway, /return legacyWorker\.fetch\(request, env\)/);
  assert.match(upline, /upline_names/);
  assert.doesNotMatch(upline, /sticker_transactions|battery_transactions/);
  assert.doesNotMatch(battery, /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+sticker_transactions/i);
});

test('legacy Echo member transaction ledger is dropped only after verified central migration state still matches source', () => {
  assert.match(retire, /state\.status !== 'completed'/);
  assert.match(retire, /sourceCount === Number\(state\.sourceCount/);
  assert.match(retire, /sourceBalance === Number\(state\.sourceBalanceUnits/);
  assert.match(retire, /sourceMaxRowId === Number\(state\.sourceMaxRowId/);
  assert.match(retire, /migratedCount === sourceCount/);
  assert.match(retire, /DROP TABLE sticker_transactions/);
  assert.match(retire, /sourceRetired: true/);
  assert.match(workflow, /Retire verified legacy sticker ledger/);
  assert.match(workflow, /retireLegacyStickerLedger\.ts/);
});

test('rare admin member deletion remains safe after the legacy transaction table no longer exists', () => {
  assert.match(memberDelete, /tableExists\(env\.DB, 'sticker_transactions'\)/);
});
