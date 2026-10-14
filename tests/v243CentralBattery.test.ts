import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const gateway = read('../worker/stickerRouter.ts');
const central = read('../worker/batteryRouter.ts');
const organization = read('../worker/organizationRouter.ts');
const migration = read('../starry-id/migrateBatteries.ts');
const workflow = read('../.github/workflows/starry-id-migrate.yml');
const main = read('../src/main.tsx');
const terminology = read('../src/batteryTerminologyPolicy.ts');

test('production currency traffic uses Starry ID central battery ledger while old cached routes remain compatible', () => {
  assert.match(organization, /import appWorker from '\.\/stickerRouter'/);
  assert.match(gateway, /batteryWorker from '\.\/batteryRouter'/);
  assert.match(gateway, /STARRY_ID_DB/);
  assert.match(central, /battery_transactions/);
  assert.match(central, /\/api\/batteries/);
  assert.doesNotMatch(central, /INSERT(?:\s+OR\s+IGNORE)?\s+INTO\s+sticker_transactions/i);
});

test('central migration verifies every historical transaction and every member balance', () => {
  assert.match(migration, /rowMismatches/);
  assert.match(migration, /userBalanceMismatches/);
  assert.match(migration, /sourceChangedDuringMigration/);
  assert.match(migration, /expected\.size === sourceCount/);
  assert.match(workflow, /migrateBatteries\.ts/);
});

test('current website calls battery API and displays battery terminology', () => {
  assert.match(main, /batteryTerminologyPolicy/);
  assert.match(terminology, /\/api\/stickers/);
  assert.match(terminology, /\/api\/batteries/);
  assert.match(terminology, /replaceAll\('貼紙', '電池'\)/);
  assert.match(terminology, /replaceAll\('張電池', '顆電池'\)/);
});
