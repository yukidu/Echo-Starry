import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import organizationRouter from '../worker/organizationRouter';
import {
  bindCouple,
  bindDownlineToGroup,
  canonicalDownlineUserIds,
  deleteOrganizationStateForUser,
  ensureOrganizationSchema,
  organizationForUser,
  syncLegacyLabelsForGroup
} from '../worker/organizationModel';

function database() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      amwayId TEXT,
      rank TEXT,
      approvedRank TEXT,
      rankApproved INTEGER DEFAULT 0,
      rankAuditStatus TEXT,
      role TEXT DEFAULT '一般夥伴',
      isBlocked INTEGER DEFAULT 0,
      registerDate TEXT,
      platinumUpline TEXT,
      diamondUpline TEXT
    );
    CREATE TABLE auth_sessions (tokenHash TEXT PRIMARY KEY, userId TEXT, expiresAt INTEGER, createdAt INTEGER);
    CREATE TABLE sticker_transactions (id TEXT PRIMARY KEY,userId TEXT,deltaUnits INTEGER);
    CREATE TABLE upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name));
    CREATE TABLE upline_names (kind TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(kind,name));
  `);
  const db:any = {
    sqlite,
    prepare(sql:string) {
      let values:any[]=[];
      const statement:any = {
        bind(...args:any[]) { values=args; return statement; },
        async first() { return sqlite.prepare(sql).get(...values) || null; },
        async all() { return { results: sqlite.prepare(sql).all(...values) }; },
        execute() { const result=sqlite.prepare(sql).run(...values); return { meta:{ changes:Number(result.changes) } }; },
        async run() { return statement.execute(); }
      };
      return statement;
    },
    async batch(statements:any[]) {
      sqlite.exec('BEGIN');
      try {
        const result=statements.map(statement=>statement.execute());
        sqlite.exec('COMMIT');
        return result;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
  return db;
}

async function session(db:any,userId:string) {
  const token=`${userId}-`.padEnd(40,'x');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  const hash=Array.from(new Uint8Array(digest)).map(byte=>byte.toString(16).padStart(2,'0')).join('');
  db.sqlite.prepare('INSERT INTO auth_sessions VALUES (?,?,?,?)').run(hash,userId,Date.now()+86400000,Date.now());
  return token;
}

async function call(db:any,token:string,path:string,method='GET',body?:unknown) {
  const headers:Record<string,string>={'Content-Type':'application/json'};
  if (token) headers.Authorization=`Bearer ${token}`;
  const response=await organizationRouter.fetch(new Request(`https://test.example${path}`,{
    method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})
  }),{DB:db} as any);
  return {status:response.status,data:await response.json() as any};
}

function stickerBalance(db:any,userId:string) {
  return Number((db.sqlite.prepare('SELECT COALESCE(SUM(deltaUnits),0) AS n FROM sticker_transactions WHERE userId=?').get(userId) as any).n);
}

test('couple organization shares only dealer identity and downline network while personal sticker data stays independent', async () => {
  const db=database();
  db.sqlite.exec(`
    INSERT INTO users(id,name,email,amwayId,rank,approvedRank,rankApproved,registerDate,platinumUpline,diamondUpline) VALUES
      ('a','甲','a@example.com','D100','白金','白金',1,'2025-01-01','',''),
      ('b','乙','b@example.com','D100','鑽石級以上','鑽石級以上',1,'2025-02-01','',''),
      ('c','既有下線','c@example.com','C300','無','無',1,'2025-03-01','甲',''),
      ('d','新下線','d@example.com','D400','無','無',1,'2025-04-01','舊白金','');
    INSERT INTO sticker_transactions VALUES ('a1','a',1000),('b1','b',3000),('c1','c',60),('d1','d',60);
  `);
  await ensureOrganizationSchema(db);
  const beforeA=stickerBalance(db,'a');
  const beforeB=stickerBalance(db,'b');

  // B confirms the couple, but display order remains stable by existing registration order: 甲&乙.
  const linked=await bindCouple(db,'b','a','D100');
  assert.ok(!('error' in linked),JSON.stringify(linked));
  assert.equal(linked.group?.displayName,'甲&乙');
  assert.equal(linked.group?.kind,'diamond');
  assert.equal((db.sqlite.prepare("SELECT name FROM users WHERE id='a'").get() as any).name,'甲');
  assert.equal((db.sqlite.prepare("SELECT name FROM users WHERE id='b'").get() as any).name,'乙');
  assert.equal(stickerBalance(db,'a'),beforeA);
  assert.equal(stickerBalance(db,'b'),beforeB);

  // Legacy downline name is migrated once to stable group/user IDs.
  assert.deepEqual(await canonicalDownlineUserIds(db,'a'),['c']);
  assert.deepEqual(await canonicalDownlineUserIds(db,'b'),['c']);
  assert.equal((db.sqlite.prepare("SELECT platinumUpline FROM users WHERE id='c'").get() as any).platinumUpline,'甲&乙');

  // New invite binding uses the highest approved spouse rank and changes only that one upline field.
  const group=await organizationForUser(db,'a');
  assert.ok(group);
  const self=await bindDownlineToGroup(db,'a',group!.id,'diamond');
  assert.equal('error' in self ? self.status : 200,400);
  const bound=await bindDownlineToGroup(db,'d',group!.id,'diamond');
  assert.ok(!('error' in bound));
  const d=(db.sqlite.prepare("SELECT platinumUpline,diamondUpline FROM users WHERE id='d'").get() as any);
  assert.equal(d.platinumUpline,'舊白金');
  assert.equal(d.diamondUpline,'甲&乙');

  // Each person edits only their own personal name; the organization display is recomputed from IDs.
  db.sqlite.prepare("UPDATE users SET name='新乙' WHERE id='b'").run();
  await syncLegacyLabelsForGroup(db,group!.id);
  assert.equal((db.sqlite.prepare("SELECT name FROM users WHERE id='a'").get() as any).name,'甲');
  assert.equal((db.sqlite.prepare("SELECT name FROM users WHERE id='b'").get() as any).name,'新乙');
  assert.equal((db.sqlite.prepare("SELECT platinumUpline FROM users WHERE id='c'").get() as any).platinumUpline,'甲&新乙');
  assert.equal((db.sqlite.prepare("SELECT diamondUpline FROM users WHERE id='d'").get() as any).diamondUpline,'甲&新乙');
  assert.equal(stickerBalance(db,'a'),beforeA);
  assert.equal(stickerBalance(db,'b'),beforeB);

  // Removing one spouse keeps the surviving organization and updates its display without touching personal sticker ledgers.
  db.sqlite.prepare("DELETE FROM users WHERE id='b'").run();
  await deleteOrganizationStateForUser(db,'b');
  const remaining=await organizationForUser(db,'a');
  assert.equal(remaining?.displayName,'甲');
  assert.equal((db.sqlite.prepare("SELECT platinumUpline FROM users WHERE id='c'").get() as any).platinumUpline,'甲');
  assert.equal((db.sqlite.prepare("SELECT diamondUpline FROM users WHERE id='d'").get() as any).diamondUpline,'甲');
  assert.equal(stickerBalance(db,'a'),beforeA);
  assert.equal(stickerBalance(db,'b'),beforeB);
});

test('organization API supports one-party couple confirmation, dealer-id invite, and rejects dirty duplicate data', async () => {
  const db=database();
  db.sqlite.exec(`
    INSERT INTO users(id,name,email,amwayId,rank,approvedRank,rankApproved,registerDate,platinumUpline,diamondUpline) VALUES
      ('owner','先加入','owner@example.com','D500','白金','白金',1,'2025-01-01','',''),
      ('spouse','後加入','spouse@example.com',NULL,'鑽石級以上','鑽石級以上',1,'2025-02-01','',''),
      ('recipient','接收者','recipient@example.com','R1','無','無',1,'2025-03-01','原白金',''),
      ('third1','重複一','third1@example.com','D900','白金','白金',1,'2025-01-01','',''),
      ('third2','重複二','third2@example.com','D900','白金','白金',1,'2025-02-01','',''),
      ('third3','重複三','third3@example.com','D900','無','無',1,'2025-03-01','','');
  `);
  const spouseToken=await session(db,'spouse');
  const ownerToken=await session(db,'owner');
  const recipientToken=await session(db,'recipient');
  const thirdToken=await session(db,'third3');

  const candidate=await call(db,spouseToken,'/api/organization/couple-candidate?dealerId=D500');
  assert.equal(candidate.status,200);
  assert.equal(candidate.data.candidate.id,'owner');

  // Only the entering member confirms; no approval from the existing partner is required.
  const couple=await call(db,spouseToken,'/api/organization/couple-bind','POST',{dealerId:'D500',partnerUserId:'owner'});
  assert.equal(couple.status,200,JSON.stringify(couple.data));
  assert.equal(couple.data.displayName,'先加入&後加入');
  assert.equal((db.sqlite.prepare("SELECT amwayId FROM users WHERE id='spouse'").get() as any).amwayId,'D500');

  const invite=await call(db,ownerToken,'/api/organization/invite-link');
  assert.equal(invite.status,200,JSON.stringify(invite.data));
  assert.equal(invite.data.url,'https://test.example/upline/D500');
  assert.equal(invite.data.displayName,'先加入&後加入');
  assert.equal(invite.data.kind,'diamond');

  const accepted=await call(db,recipientToken,'/api/organization/invite-accept','POST',{dealerId:'D500'});
  assert.equal(accepted.status,200,JSON.stringify(accepted.data));
  const recipient=(db.sqlite.prepare("SELECT platinumUpline,diamondUpline FROM users WHERE id='recipient'").get() as any);
  assert.equal(recipient.platinumUpline,'原白金');
  assert.equal(recipient.diamondUpline,'先加入&後加入');

  // Three users sharing one dealer ID is treated as dirty data and never auto-linked.
  const dirty=await call(db,thirdToken,'/api/organization/couple-candidate?dealerId=D900');
  assert.equal(dirty.status,409);
  assert.match(dirty.data.error,/超過一位其他會員|超過兩位會員/);

  // A member cannot use the shared invite to become their own downline.
  const self=await call(db,ownerToken,'/api/organization/invite-accept','POST',{dealerId:'D500'});
  assert.equal(self.status,400);

  // Platinum+ members can never be bound as downlines, even if an invite is valid.
  db.sqlite.prepare(`INSERT INTO users(id,name,email,amwayId,rank,approvedRank,rankApproved,rankAuditStatus,registerDate,platinumUpline,diamondUpline)
    VALUES ('platinumTarget','白金目標','pt@example.com','PT1','白金','白金',1,'approved','2025-05-01','','')`).run();
  const platinumToken=await session(db,'platinumTarget');
  const rejected=await call(db,platinumToken,'/api/organization/invite-accept','POST',{dealerId:'D500'});
  assert.equal(rejected.status,409);
  assert.match(rejected.data.error,/白金或白金以上/);
});
