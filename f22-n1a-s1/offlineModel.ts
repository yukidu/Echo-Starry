/**
 * N1A-S1 F22 TEST-ONLY MODEL. Node SQLite and synthetic trust root.
 * This file MUST NOT be imported by real Workers, routers, D1 or Starry ID.
 * No public rankings, cloud API, provider calls, production migrations or billing.
 */
import {createHash,createHmac} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';

export type IdentityKind='registered'|'guest'|'unknown';
export type State='pending'|'done'|'failed';
export type Period='today'|'7d'|'30d'|'all';
export type BudgetState='SAFE_RESERVED'|'WARNING_PAUSED'|'STOP_BLOCKED'|'UNKNOWN_LOCKED'|'REPLAY_NOOP'|'RESERVED_UNCERTAIN';
const H=(secret:string,text:string)=>createHmac('sha256',secret).update(text).digest('hex');
const DAY=86_400_000,TZ=28_800_000;
const HEX=/^[a-f0-9]{64}$/;
const KEY=/^[a-z0-9:_-]{1,96}$/;
export const TEST_ONLY=true;
export const productionAuthorized=false;
export const F22_N1A_S1_GATE_ENABLED=false;
export interface FakeEnvelope{
 schemaVersion:'f22-n1a-fake-v1';originAppId:string;globalEventId:string;
 sourceRevision:number;payloadDigest:string;identityKind:IdentityKind;
 registeredMemberHandle:string|null;acceptedAtUtcMs:number;
 trackId:string;state:State;active:boolean;testOnlySignature:string;
}
const body=(e:Omit<FakeEnvelope,'testOnlySignature'>)=>JSON.stringify(e);
const noSig=(e:FakeEnvelope)=>{const {testOnlySignature:_,...rest}=e;return rest;};
function checkTime(n:number){if(!Number.isSafeInteger(n)||n<0||n>8_639_999_999_000_000)throw Error('BAD_TIME');}
export function taipeiDay(ms:number):string{checkTime(ms);return new Date(ms+TZ).toISOString().slice(0,10);}
export function reportWindow(period:Period,asOfMs:number){
 checkTime(asOfMs);
 const day=taipeiDay(asOfMs), startDayUtc=Date.parse(day+'T00:00:00Z');
 if(period==='all')return{startMs:0,endMs:asOfMs};
 const n=period==='today'?1:period==='7d'?7:period==='30d'?30:0;
 if(!n)throw Error('BAD_PERIOD');
 return{startMs:startDayUtc-(n-1)*DAY-TZ,endMs:asOfMs};
}

/** Entirely synthetic Starry ID membership source and event issuer. */
export class FakeStarryIdSource{
 private readonly membership=new Set<string>();
 private readonly actions=new Map<string,Omit<FakeEnvelope,'testOnlySignature'>>();
 private readonly eventsById=new Map<string,string>();
 private readonly ownersByAction=new Map<string,string>();
 constructor(private readonly fakeSigningSecret:string){if(!fakeSigningSecret)throw Error('FAKE_SECRET_REQUIRED');}
 register(subject:string){if(!KEY.test(subject))throw Error('BAD_FAKE_SUBJECT');this.membership.add(subject);}
 revoke(subject:string){this.membership.delete(subject);}
 /** First server receipt freezes the original identity and accepted-at time. */
 firstAccept(a:{logicalSourceId:string;app:string;subject:string|null;
   acceptedAtUtcMs:number;track:string;state:State}):FakeEnvelope{
  if(!KEY.test(a.logicalSourceId)||!KEY.test(a.app)||!KEY.test(a.track))throw Error('BAD_FAKE_KEY');
  checkTime(a.acceptedAtUtcMs);
  const k=a.app+':'+a.logicalSourceId,prev=this.actions.get(k);
  // Fake source-side owner binding. A logical event cannot silently change
  // from guest to registered (or impersonate a different subject).
  const kind:IdentityKind=a.subject===null?'guest':this.membership.has(a.subject)?'registered':'unknown';
  const owner=H(this.fakeSigningSecret,'owner:'+JSON.stringify([a.subject,kind]));
  if(prev){
   if(this.ownersByAction.get(k)!==owner||prev.identityKind!==kind)
    throw Error('ACTION_IDENTITY_CONFLICT');
   return this.sign(prev);
  }
  const m:Omit<FakeEnvelope,'testOnlySignature'>={
   schemaVersion:'f22-n1a-fake-v1',originAppId:a.app,
   globalEventId:H(this.fakeSigningSecret,'event:'+k),sourceRevision:1,
   payloadDigest:H(this.fakeSigningSecret,'payload:'+k+':v1'),
   identityKind:kind,registeredMemberHandle:kind==='registered'?H(this.fakeSigningSecret,'member:'+a.subject):null,
   acceptedAtUtcMs:a.acceptedAtUtcMs,trackId:a.track,state:a.state,active:true
  };
  this.actions.set(k,m);this.ownersByAction.set(k,owner);this.eventsById.set(m.globalEventId,k);return this.sign(m);
 }
 revise(app:string,logicalSourceId:string,update:{track?:string;state?:State;active?:boolean}):FakeEnvelope{
  const k=app+':'+logicalSourceId,old=this.actions.get(k);
  if(!old)throw Error('MISSING_FAKE_ACTION');
  if(update.track!==undefined&&!KEY.test(update.track))throw Error('BAD_FAKE_TRACK');
  const rev=old.sourceRevision+1;
  const next={...old,sourceRevision:rev,trackId:update.track??old.trackId,
   state:update.state??old.state,active:update.active??old.active,
   payloadDigest:H(this.fakeSigningSecret,'payload:'+k+':v'+rev)};
  this.actions.set(k,next);return this.sign(next);
 }
 private sign(v:Omit<FakeEnvelope,'testOnlySignature'>):FakeEnvelope{
  return{...v,testOnlySignature:H(this.fakeSigningSecret,body(v))};
 }
 verify(e:FakeEnvelope):boolean{
  const actionKey=this.eventsById.get(e.globalEventId);
  const stored=actionKey===undefined?undefined:this.actions.get(actionKey);
  // Fake issuer validates signature; old signed versions still eligible for STALE checks.
  return !!stored && e.originAppId===stored.originAppId &&
    HEX.test(e.globalEventId) &&
    H(this.fakeSigningSecret,body(noSig(e)))===e.testOnlySignature;
 }
}

/** In-memory / local SQLite schema, never a Cloudflare D1 migration. */
export const FAKE_SQL=String.raw`
CREATE TABLE fake_f22_events (
 event_id TEXT PRIMARY KEY,revision INTEGER NOT NULL,payload_digest TEXT NOT NULL,
 identity_kind TEXT NOT NULL,member_handle TEXT,accepted_ms INTEGER NOT NULL,
 track_id TEXT NOT NULL,state TEXT NOT NULL,active INTEGER NOT NULL
);
CREATE INDEX fake_f22_window ON fake_f22_events(accepted_ms,track_id);
CREATE TABLE fake_f22_budget (
 account_id TEXT PRIMARY KEY,plan_kind TEXT NOT NULL,period_key TEXT NOT NULL,
 read_cap INTEGER NOT NULL,write_cap INTEGER NOT NULL,
 observed_read INTEGER NOT NULL,observed_write INTEGER NOT NULL,
 reserved_read INTEGER NOT NULL DEFAULT 0,reserved_write INTEGER NOT NULL DEFAULT 0,
 checked_at INTEGER NOT NULL,evidence TEXT NOT NULL
);
CREATE TABLE fake_f22_reservations (
 account_id TEXT NOT NULL,batch_id TEXT NOT NULL,reads INTEGER NOT NULL,
 writes INTEGER NOT NULL,state TEXT NOT NULL,
 PRIMARY KEY(account_id,batch_id)
);
`;
export function newFakeDatabase(filename=':memory:'){const db=new DatabaseSync(filename);db.exec(FAKE_SQL);return db;}
function eventValid(e:FakeEnvelope){
 if(!KEY.test(e.originAppId)||!HEX.test(e.globalEventId)||!HEX.test(e.payloadDigest)||
 !KEY.test(e.trackId)||!Number.isSafeInteger(e.sourceRevision)||e.sourceRevision<1||
 !['registered','guest','unknown'].includes(e.identityKind)||
 !['pending','done','failed'].includes(e.state)||typeof e.active!=='boolean')throw Error('BAD_FAKE_EVENT');
 if(e.identityKind==='registered'?!e.registeredMemberHandle||!HEX.test(e.registeredMemberHandle):e.registeredMemberHandle!==null)throw Error('BAD_MEMBER_KIND');
 checkTime(e.acceptedAtUtcMs);
}
export function applyFakeEvent(db:DatabaseSync,source:FakeStarryIdSource,e:FakeEnvelope){
 eventValid(e);if(!source.verify(e))throw Error('UNTRUSTED_FAKE_SOURCE');
 db.exec('BEGIN IMMEDIATE');
 try{
  const old=db.prepare('SELECT * FROM fake_f22_events WHERE event_id=?').get(e.globalEventId) as any;
  if(old){
   if(e.acceptedAtUtcMs!==old.accepted_ms||e.identityKind!==old.identity_kind||
    e.registeredMemberHandle!==old.member_handle)throw Error('IMMUTABLE_RECEIPT_CONFLICT');
   if(e.sourceRevision<old.revision){db.exec('COMMIT');return 'STALE_IGNORED' as const;}
   if(e.sourceRevision===old.revision){
    if(old.payload_digest!==e.payloadDigest||old.track_id!==e.trackId||
      old.state!==e.state||old.active!==Number(e.active))throw Error('SAME_REVISION_CONFLICT');
    db.exec('COMMIT');return 'DUPLICATE_NOOP' as const;
   }
  }
  db.prepare('INSERT INTO fake_f22_events(event_id,revision,payload_digest,identity_kind,member_handle,accepted_ms,track_id,state,active) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(event_id) DO UPDATE SET revision=excluded.revision,payload_digest=excluded.payload_digest,track_id=excluded.track_id,state=excluded.state,active=excluded.active')
    .run(e.globalEventId,e.sourceRevision,e.payloadDigest,e.identityKind,
      e.registeredMemberHandle,e.acceptedAtUtcMs,e.trackId,e.state,Number(e.active));
  db.exec('COMMIT');return 'APPLIED' as const;
 }catch(err){db.exec('ROLLBACK');throw err;}
}
/**
 * Offline SQL oracle for existing Fake tests ONLY. This is NOT a private API;
 * the only simulated private read entry point is fakeStats() below.
 */
export function fakeStatsFixtureOnly(db:DatabaseSync,period:Period,asOfMs:number,track:string|null=null){
 const w=reportWindow(period,asOfMs);
 if(track!==null&&!KEY.test(track))throw Error('BAD_TRACK');
 const filter=track===null?'':' AND track_id=?';
 const values=track===null?[w.startMs,w.endMs]:[w.startMs,w.endMs,track];
 const x=db.prepare("SELECT COUNT(*) calls, COUNT(DISTINCT CASE WHEN identity_kind='registered' THEN member_handle END) members, "+
   "SUM(CASE WHEN identity_kind='guest' THEN 1 ELSE 0 END) guestCalls, "+
   "SUM(CASE WHEN identity_kind='unknown' THEN 1 ELSE 0 END) unknownCalls, "+
   "SUM(CASE WHEN state='done' THEN 1 ELSE 0 END) done, "+
   "SUM(CASE WHEN state='failed' THEN 1 ELSE 0 END) failed, "+
   "SUM(CASE WHEN state='pending' THEN 1 ELSE 0 END) pending "+
   "FROM fake_f22_events WHERE active=1 AND accepted_ms>=? AND accepted_ms<?"+filter).get(...values) as any;
 return{period,asOfUtcMs:asOfMs,trackId:track,calls:x.calls,registeredMembers:x.members,
   guestCalls:x.guestCalls??0,unknownCalls:x.unknownCalls??0,
   done:x.done??0,failed:x.failed??0,pending:x.pending??0,
   actualTwd:null,tokenCount:null,estimatedTwd:null,repeat5:null,repeat30:null,repeat60:null};
}

/**
 * Independent in-memory TEST witness. It is deliberately NOT in the SQLite
 * backup; a restored old SQLite cannot change its sealed snapshot/tombstones.
 * This fixture is NOT a real non-rollback anchor, authenticator or signer.
 */
export class FakePrivateStatsWitness{
 private available=true;
 private readonly fakeActiveAdmins=new Set<string>();
 private readonly revokedMembers=new Set<string>();
 private sealedDigest:string|null=null;
 enrollFakeSuperAdmin(subject:string){
  if(!KEY.test(subject))throw Error('BAD_FAKE_ADMIN');
  this.fakeActiveAdmins.add(subject);
 }
 revokeFakeSuperAdmin(subject:string){this.fakeActiveAdmins.delete(subject);}
 setFakeAuthorityAvailable(value:boolean){this.available=value;}
 revokeFakeMember(memberHandle:string){
  if(!HEX.test(memberHandle))throw Error('BAD_FAKE_MEMBER_HANDLE');
  this.revokedMembers.add(memberHandle);
 }
 /**
  * One-time trust boundary: only the fixture issuer may seal a fresh known
  * snapshot. No automatic re-seal of a restored DB or after any tombstone.
  */
 sealInitialFakeSnapshot(db:DatabaseSync){
  if(!this.available||this.revokedMembers.size||this.sealedDigest!==null)
   throw Error('FAKE_WITNESS_CANNOT_SEAL');
  this.sealedDigest=fakeStatsDbFingerprint(db);
 }
 assertCurrentFakeAuthority(db:DatabaseSync,admin:string){
  if(!this.available||!this.fakeActiveAdmins.has(admin)||this.revokedMembers.size||
     this.sealedDigest===null||this.sealedDigest!==fakeStatsDbFingerprint(db))
   throw Error('FAKE_PRIVATE_AUTH_REJECTED');
 }
}
function fakeStatsDbFingerprint(db:DatabaseSync){
 const rows=db.prepare('SELECT event_id,revision,payload_digest,identity_kind,member_handle,accepted_ms,track_id,state,active FROM fake_f22_events ORDER BY event_id').all();
 return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
/** Simulated PRIVATE read: no witness/admin → default deny, including restored DB. */
export function fakeStats(db:DatabaseSync,period:Period,asOfMs:number,
 track:string|null=null,authorization?:{witness:FakePrivateStatsWitness;admin:string}){
 if(!authorization||!(authorization.witness instanceof FakePrivateStatsWitness)||
   !KEY.test(authorization.admin))throw Error('FAKE_PRIVATE_AUTH_REQUIRED');
 authorization.witness.assertCurrentFakeAuthority(db,authorization.admin);
 const result=fakeStatsFixtureOnly(db,period,asOfMs,track);
 // A second witness check before private output; this remains offline only.
 authorization.witness.assertCurrentFakeAuthority(db,authorization.admin);
 return result;
}

/** Two independent budget SQLite files cannot provide global atomicity. */
export function reserveFakeAcrossIsolatedDatabases():ReserveDecision{
 return {state:'UNKNOWN_LOCKED',permitted:false,detail:'UNSUPPORTED_CROSS_DATABASE'};
}

/** Synthetic centralized account quota: ONE SQLite file for all fake workers. */
export function setupFakeAccount(db:DatabaseSync,record:{
 accountId:string;plan:'workers-free'|'workers-paid'|'unknown';periodKey:string;
 capReads:number;capWrites:number;observedReads:number;observedWrites:number;now:number;
 evidence:'fake-verified'|'unknown'
}){
 if(!KEY.test(record.accountId)||!KEY.test(record.periodKey))throw Error('BAD_FAKE_ACCOUNT');
 for(const x of [record.capReads,record.capWrites,record.observedReads,record.observedWrites,record.now])
  if(!Number.isSafeInteger(x)||x<0)throw Error('BAD_FAKE_BUDGET');
 db.prepare('INSERT INTO fake_f22_budget(account_id,plan_kind,period_key,read_cap,write_cap,observed_read,observed_write,checked_at,evidence) VALUES(?,?,?,?,?,?,?,?,?)')
 .run(record.accountId,record.plan,record.periodKey,record.capReads,record.capWrites,
  record.observedReads,record.observedWrites,record.now,record.evidence);
}
export type ReserveDecision={state:BudgetState;permitted:boolean;detail:string};
const deny=(state:BudgetState,detail:string):ReserveDecision=>({state,permitted:false,detail});
export function reserveFakeBatch(db:DatabaseSync,req:{
 accountId:string;batchId:string;periodKey:string;now:number;reads:number;writes:number
}):ReserveDecision{
 if(!KEY.test(req.accountId)||!KEY.test(req.batchId)||!KEY.test(req.periodKey)||
  !Number.isSafeInteger(req.now)||req.now<0||
  !Number.isSafeInteger(req.reads)||req.reads<0||
  !Number.isSafeInteger(req.writes)||req.writes<0)return deny('UNKNOWN_LOCKED','INVALID_REQUEST');
 try{db.exec('BEGIN IMMEDIATE');}catch{return deny('UNKNOWN_LOCKED','WRITE_LOCK_BUSY');}
 try{
  const old=db.prepare('SELECT * FROM fake_f22_reservations WHERE account_id=? AND batch_id=?')
   .get(req.accountId,req.batchId) as any;
  if(old){
   db.exec('COMMIT');
   if(old.reads!==req.reads||old.writes!==req.writes)return deny('UNKNOWN_LOCKED','BATCH_REPLAY_MISMATCH');
   return deny(old.state==='reserved'?'REPLAY_NOOP':'RESERVED_UNCERTAIN','EXISTING_RESERVATION_NO_NEW_EXECUTION');
  }
  const b=db.prepare('SELECT * FROM fake_f22_budget WHERE account_id=?').get(req.accountId) as any;
  if(!b||b.evidence!=='fake-verified'||!['workers-free','workers-paid'].includes(b.plan_kind)||
   b.period_key!==req.periodKey||req.now-b.checked_at>300000||
   req.now<b.checked_at-60000||b.read_cap<=0||b.write_cap<=0||
   !Number.isSafeInteger(b.observed_read)||!Number.isSafeInteger(b.observed_write)||
   !Number.isSafeInteger(b.reserved_read)||!Number.isSafeInteger(b.reserved_write)||
   b.observed_read<0||b.observed_write<0||
   b.reserved_read<0||b.reserved_write<0){db.exec('COMMIT');return deny('UNKNOWN_LOCKED','UNVERIFIED_ACCOUNT_BUDGET');}
  const read=b.observed_read+b.reserved_read+req.reads,write=b.observed_write+b.reserved_write+req.writes;
  if(!Number.isSafeInteger(read)||!Number.isSafeInteger(write)){
   db.exec('COMMIT');return deny('UNKNOWN_LOCKED','BUDGET_OVERFLOW');
  }
  if(read>=b.read_cap||write>=b.write_cap){db.exec('COMMIT');return deny('STOP_BLOCKED','100_PERCENT_OR_MORE');}
  if(read*5>=b.read_cap*4||write*5>=b.write_cap*4){
   db.exec('COMMIT');return deny('WARNING_PAUSED','80_PERCENT_OR_MORE');
  }
  db.prepare('INSERT INTO fake_f22_reservations(account_id,batch_id,reads,writes,state) VALUES(?,?,?,?,?)')
   .run(req.accountId,req.batchId,req.reads,req.writes,'reserved');
  db.prepare('UPDATE fake_f22_budget SET reserved_read=reserved_read+?,reserved_write=reserved_write+? WHERE account_id=?')
   .run(req.reads,req.writes,req.accountId);
  db.exec('COMMIT');return{state:'SAFE_RESERVED',permitted:true,detail:'FAKE_ATOMIC_RESERVATION'};
 }catch(err){try{db.exec('ROLLBACK');}catch{}return deny('UNKNOWN_LOCKED','TRANSACTION_ERROR');}
}
/** No silent release on timeout; unknown work retains its reservation. */
export function markFakeUncertain(db:DatabaseSync,accountId:string,batchId:string){
 db.prepare("UPDATE fake_f22_reservations SET state='uncertain' WHERE account_id=? AND batch_id=? AND state='reserved'")
 .run(accountId,batchId);
}
export function fakeBudgetTotals(db:DatabaseSync,accountId:string){
 const x=db.prepare('SELECT observed_read,observed_write,reserved_read,reserved_write FROM fake_f22_budget WHERE account_id=?').get(accountId) as any;
 if(!x)throw Error('ACCOUNT_UNKNOWN');
 return{read:x.observed_read+x.reserved_read,write:x.observed_write+x.reserved_write,
  pendingRead:x.reserved_read,pendingWrite:x.reserved_write};
}
