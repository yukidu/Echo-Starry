/** Integration of the ACTUAL exported TypeScript adapter with SQLite,
 * using Node's sqlite DatabaseSync (NOT FakeMap / NOT any Provider).
 * This complements on-disk Python multi-connection transaction tests.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  a03Reserve, a03ClaimWithoutSending,
  type A03Database, type A03Hold, type A03Claim,
} from '../worker/starryAiA03OfflineLedger';

const hold: A03Hold = {
  jobKey: 'job-00000001', fingerprint: 'a'.repeat(64), appId: 'echo-app01',
  subjectId: 'subject0001', resourceKey: 'resource0001',
  grantRevision: 1, permissionRevision: 1, resourceRevision: 1,
  sourceRevision: 1, restoreEpoch: 1, budgetEpoch: 1,
  maxMicroTwd: 2, createdAt: 1792570000000,
};
const claim: A03Claim = {
  jobKey: hold.jobKey, fingerprint: hold.fingerprint,
  budgetEpoch: hold.budgetEpoch, claimKey: 'claim-00000001', createdAt: 1792570000001,
};
function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('tests/ai3-a03/schema.sql','utf8'));
  sqlite.exec(`
    INSERT INTO ai3_a03_budget_authority VALUES ('global',1,1,10);
    INSERT INTO ai3_a03_subject_watermarks VALUES ('subject0001','echo-app01',1,1,1);
    INSERT INTO ai3_a03_resource_watermarks VALUES ('resource0001','echo-app01',1,1,1,1);
  `);
  const db: A03Database = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...args: unknown[]) {
          return {
            async run() {
              const result = statement.run(...(args as (string | number | null)[]));
              return { meta: { changes: Number(result.changes) } };
            },
            async first<T = Record<string, unknown>>() {
              return (statement.get(...(args as (string | number | null)[])) ?? null) as T | null;
            }
          };
        }
      };
    }
  };
  return {sqlite, db};
}

test('A03 TypeScript adapter defaults OFF even when demo SQLite policy is ON', async () => {
  const {sqlite,db} = setup();
  try {
    assert.deepEqual(await a03Reserve(db,undefined,hold),
      {allowed:false,reason:'A03_DISABLED',providerCalls:0});
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM ai3_a03_holds').get()!.count,0);
  } finally { sqlite.close(); }
});

test('A03 actual TypeScript functions reserve/claim once using real SQLite', async () => {
  const {sqlite,db} = setup();
  try {
    assert.deepEqual(await a03Reserve(db,{enabled:true},hold),
      {allowed:true,state:'RESERVED_HELD',providerCalls:0});
    assert.deepEqual(await a03Reserve(db,{enabled:true},hold),
      {allowed:false,reason:'DUPLICATE_HELD',providerCalls:0});
    assert.deepEqual(await a03ClaimWithoutSending(db,{enabled:true},claim),
      {allowed:true,state:'UNKNOWN_HELD',providerCalls:0});
    assert.deepEqual(await a03ClaimWithoutSending(db,{enabled:true},{...claim,claimKey:'claim-second0001'}),
      {allowed:false,reason:'CLAIM_USED_OR_REVOKED_OR_AUTHORITY_UNKNOWN',providerCalls:0});
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM ai3_a03_send_claims').get()!.count,1);
  } finally { sqlite.close(); }
});

test('A03 actual adapter denies claim after revocation and keeps hold', async () => {
  const {sqlite,db} = setup();
  try {
    assert.equal((await a03Reserve(db,{enabled:true},hold)).allowed,true);
    sqlite.exec("UPDATE ai3_a03_subject_watermarks SET permission_revision=2");
    assert.deepEqual(await a03ClaimWithoutSending(db,{enabled:true},claim),
      {allowed:false,reason:'CLAIM_USED_OR_REVOKED_OR_AUTHORITY_UNKNOWN',providerCalls:0});
    assert.equal(sqlite.prepare('SELECT SUM(max_micro_twd) AS held FROM ai3_a03_holds').get()!.held,2);
  } finally { sqlite.close(); }
});

test('A03 real adapter denies missing DB, invalid ids and unverified quote', async () => {
  const {sqlite,db} = setup();
  try {
    assert.equal((await a03Reserve(undefined,{enabled:true},hold)).allowed,false);
    assert.equal((await a03Reserve(db,{enabled:true},{...hold, fingerprint:'untrusted'})).allowed,false);
    assert.equal((await a03Reserve(db,{enabled:true},{...hold,maxMicroTwd:0})).allowed,false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM ai3_a03_holds').get()!.count,0);
  } finally { sqlite.close(); }
});
