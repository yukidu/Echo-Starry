import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import {
  HIDDEN_BALANCE_CORRECTION_TYPE,
  HIDDEN_BALANCE_TARGETS_V111,
  HIDDEN_BALANCE_TARGETS_V112,
  applyHiddenBalanceCorrections,
  hashNormalizedMemberName
} from '../worker/hiddenStickerBalanceCorrection';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE sticker_transactions (
      id TEXT PRIMARY KEY,userId TEXT NOT NULL,deltaUnits INTEGER NOT NULL,balanceAfterUnits INTEGER NOT NULL,
      type TEXT NOT NULL,sourceId TEXT,description TEXT NOT NULL,actorUserId TEXT,uniqueKey TEXT NOT NULL UNIQUE,createdAt INTEGER NOT NULL
    );
  `);
  const db = {
    sqlite,
    prepare(sql: string) {
      let values: any[] = [];
      const statement = {
        bind(...args: any[]) { values = args; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        async run() {
          const result = sqlite.prepare(sql).run(...values);
          return { meta: { changes: Number(result.changes) } };
        }
      };
      return statement;
    }
  };
  return db;
}

function balance(sqlite: DatabaseSync, userId: string) {
  return Number((sqlite.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS n FROM sticker_transactions WHERE userId=?').get(userId) as any).n);
}

test('hidden correction sets exact non-negative final balances and runs only once', async () => {
  const db = database();
  db.sqlite.exec(`
    INSERT INTO users VALUES ('a','測試甲'),('b','測試乙'),('c','測試丙');
    INSERT INTO sticker_transactions(id,userId,deltaUnits,balanceAfterUnits,type,description,uniqueKey,createdAt) VALUES
      ('a0','a',60,60,'initial','initial','a0',1),
      ('b0','b',200,200,'initial','initial','b0',1),
      ('c0','c',500,500,'initial','initial','c0',1);
  `);
  const targets = [
    { memberNameHash: await hashNormalizedMemberName('測試甲'), targetUnits: 120 },
    { memberNameHash: await hashNormalizedMemberName('測試乙'), targetUnits: 2061 },
    { memberNameHash: await hashNormalizedMemberName('測試丙'), targetUnits: 3160 }
  ];
  const first = await applyHiddenBalanceCorrections(db, 'test-hidden-v1', targets);
  assert.deepEqual(first, { applied: true, pending: false, corrected: 3 });
  assert.equal(balance(db.sqlite, 'a'), 120);
  assert.equal(balance(db.sqlite, 'b'), 2061);
  assert.equal(balance(db.sqlite, 'c'), 3160);
  assert.equal(Number((db.sqlite.prepare('SELECT COUNT(*) AS n FROM sticker_transactions WHERE type=?').get(HIDDEN_BALANCE_CORRECTION_TYPE) as any).n), 3);

  const second = await applyHiddenBalanceCorrections(db, 'test-hidden-v1', targets);
  assert.deepEqual(second, { applied: false, pending: false, corrected: 0 });
  assert.equal(Number((db.sqlite.prepare('SELECT COUNT(*) AS n FROM sticker_transactions WHERE type=?').get(HIDDEN_BALANCE_CORRECTION_TYPE) as any).n), 3);
});

test('ambiguous or missing members leave the migration pending without partial corrections', async () => {
  const db = database();
  db.sqlite.exec(`INSERT INTO users VALUES ('a','重名'),('b','重名');`);
  const targets = [{ memberNameHash: await hashNormalizedMemberName('重名'), targetUnits: 100 }];
  const result = await applyHiddenBalanceCorrections(db, 'test-hidden-pending', targets);
  assert.deepEqual(result, { applied: false, pending: true, corrected: 0 });
  assert.equal(Number((db.sqlite.prepare('SELECT COUNT(*) AS n FROM sticker_transactions').get() as any).n), 0);
  assert.equal(Number((db.sqlite.prepare('SELECT COUNT(*) AS n FROM app_migrations').get() as any).n), 0);
});

test('production mappings keep three hash-only non-negative targets and v112 repairs the exact final balances', () => {
  assert.equal(HIDDEN_BALANCE_TARGETS_V111.length, 3);
  assert.equal(HIDDEN_BALANCE_TARGETS_V112.length, 3);
  assert.deepEqual(HIDDEN_BALANCE_TARGETS_V111.map(item => item.targetUnits).sort((a,b) => a-b), [2061, 3060, 3160]);
  assert.deepEqual(HIDDEN_BALANCE_TARGETS_V112.map(item => item.targetUnits).sort((a,b) => a-b), [2061, 3060, 3160]);
  assert.ok(HIDDEN_BALANCE_TARGETS_V111.every(item => item.targetUnits >= 0 && /^[a-f0-9]{64}$/.test(item.memberNameHash)));
});

test('member history shows valid correction entries while earned/spent and toast streams still exclude them', () => {
  const source = readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url), 'utf8');
  assert.match(source, /系統錯誤修正/);
  assert.match(source, /hidden-sticker-balance-v111:%/);
  assert.match(source, /t\.type <> 'balance_correction' AND t\.deltaUnits > 0/);
  assert.match(source, /t\.type <> 'balance_correction' AND t\.deltaUnits < 0/);
  assert.match(source, /type NOT IN \('initial','balance_correction'\)/);
  assert.match(source, /COALESCE\(SUM\(t\.deltaUnits\),0\) AS balanceUnits/);
});
