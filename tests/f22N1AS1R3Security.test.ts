import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,copyFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
 FakeStarryIdSource,newFakeDatabase,applyFakeEvent,
 fakeStats,FakePrivateStatsWitness,reserveFakeAcrossIsolatedDatabases,
 TEST_ONLY,productionAuthorized,F22_N1A_S1_GATE_ENABLED,
} from '../f22-n1a-s1/offlineModel.ts';
const NOW=Date.parse('2026-10-20T12:15:00Z');
const make=(source:FakeStarryIdSource,key:string)=>
 source.firstAccept({logicalSourceId:key,app:'echo',subject:'member',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'});

test('R3 P0 FAIL->PASS: no independent Fake authority denies reading private F22 counts',()=>{
 const db=newFakeDatabase(),source=new FakeStarryIdSource('FAKE_R3_ONLY');
 try{
  source.register('member');const event=make(source,'e1');
  assert.equal(applyFakeEvent(db,source,event),'APPLIED');
  assert.throws(()=>fakeStats(db,'all',NOW),/FAKE_PRIVATE_AUTH_REQUIRED/);
  assert.throws(()=>fakeStats(db,'all',NOW,null,{} as any),/FAKE_PRIVATE_AUTH_REQUIRED/);
 }finally{db.close();}
});
test('R3 P0 FAIL->PASS: old SQLite backup restored after independently sealed newer snapshot cannot read',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ai5-restore-'));
 const current=join(dir,'private.sqlite'),old=join(dir,'before.sqlite');
 const source=new FakeStarryIdSource('FAKE_R3_WITNESS');source.register('member');
 const witness=new FakePrivateStatsWitness();
 witness.enrollFakeSuperAdmin('fake-admin');
 const grant={witness,admin:'fake-admin'};
 let db:DatabaseSync|null=newFakeDatabase(current);
 try{
  const e1=make(source,'first');applyFakeEvent(db,source,e1);
  db.close();db=null;copyFileSync(current,old);
  db=new DatabaseSync(current);
  const e2=make(source,'second');applyFakeEvent(db,source,e2);
  witness.sealInitialFakeSnapshot(db);
  assert.equal(fakeStats(db,'all',NOW,null,grant).calls,2);
  db.close();db=null;copyFileSync(old,current);
  db=new DatabaseSync(current);
  const restoredDb=db;
  assert.throws(()=>fakeStats(restoredDb,'all',NOW,null,grant),/FAKE_PRIVATE_AUTH_REJECTED/);
  assert.throws(()=>witness.sealInitialFakeSnapshot(restoredDb),/FAKE_WITNESS_CANNOT_SEAL/);
 }finally{db?.close();rmSync(dir,{recursive:true,force:true});}
});
test('R3 P0 FAIL->PASS: newest member revocation tombstone stays outside restored old SQLite',()=>{
 const db=newFakeDatabase(),source=new FakeStarryIdSource('FAKE_R3_TOMBSTONE');
 const witness=new FakePrivateStatsWitness();
 try{
  source.register('member');const event=make(source,'member-event');
  applyFakeEvent(db,source,event);
  witness.enrollFakeSuperAdmin('fake-admin');
  witness.sealInitialFakeSnapshot(db);
  const grant={witness,admin:'fake-admin'};
  assert.equal(fakeStats(db,'all',NOW,null,grant).registeredMembers,1);
  witness.revokeFakeMember(event.registeredMemberHandle!);
  assert.throws(()=>fakeStats(db,'all',NOW,null,grant),/FAKE_PRIVATE_AUTH_REJECTED/);
  witness.setFakeAuthorityAvailable(false);
  assert.throws(()=>fakeStats(db,'all',NOW,null,grant),/FAKE_PRIVATE_AUTH_REJECTED/);
 }finally{db.close();}
});
test('R3 P0: lost admin membership and lost witness both fail closed; no stale cached allow',()=>{
 const db=newFakeDatabase(),source=new FakeStarryIdSource('FAKE_R3_ADMIN');
 const witness=new FakePrivateStatsWitness();
 try{
  source.register('member');applyFakeEvent(db,source,make(source,'member-event'));
  witness.enrollFakeSuperAdmin('fake-admin');witness.sealInitialFakeSnapshot(db);
  const grant={witness,admin:'fake-admin'};
  assert.equal(fakeStats(db,'all',NOW,null,grant).calls,1);
  witness.revokeFakeSuperAdmin('fake-admin');
  assert.throws(()=>fakeStats(db,'all',NOW,null,grant),/FAKE_PRIVATE_AUTH_REJECTED/);
  witness.enrollFakeSuperAdmin('fake-admin');witness.setFakeAuthorityAvailable(false);
  assert.throws(()=>fakeStats(db,'all',NOW,null,grant),/FAKE_PRIVATE_AUTH_REJECTED/);
 }finally{db.close();}
});
test('R3 P1 FAIL->PASS: guest-owned event cannot be reissued as member after registration',()=>{
 const issuer=new FakeStarryIdSource('FAKE_R3_ONLY');
 const first=issuer.firstAccept({logicalSourceId:'shared',app:'echo',subject:null,track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'});
 issuer.register('someone');
 assert.equal(first.identityKind,'guest');
 assert.throws(()=>issuer.firstAccept({logicalSourceId:'shared',app:'echo',subject:'someone',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'}),/ACTION_IDENTITY_CONFLICT/);
});
test('R3 P1 FAIL->PASS: existing member event cannot be reissued as guest or another member',()=>{
 const issuer=new FakeStarryIdSource('FAKE_R3_ONLY');issuer.register('member');issuer.register('other');
 issuer.firstAccept({logicalSourceId:'same',app:'echo',subject:'member',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'});
 for(const subject of [null,'other'])
  assert.throws(()=>issuer.firstAccept({logicalSourceId:'same',app:'echo',subject,track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'}),/ACTION_IDENTITY_CONFLICT/);
 issuer.revoke('member');
 assert.throws(()=>issuer.firstAccept({logicalSourceId:'same',app:'echo',subject:'member',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'}),/ACTION_IDENTITY_CONFLICT/);
});
test('R3 P1: distinct independent budget DBs are UNSUPPORTED, never assert global atomicity',()=>{
 assert.equal(TEST_ONLY,true);assert.equal(productionAuthorized,false);
 assert.equal(F22_N1A_S1_GATE_ENABLED,false);
 const a=newFakeDatabase(),b=newFakeDatabase();
 try{
  const result=reserveFakeAcrossIsolatedDatabases(a,b);
  assert.deepEqual(result,{state:'UNKNOWN_LOCKED',permitted:false,detail:'UNSUPPORTED_CROSS_DATABASE'});
 }finally{a.close();b.close();}
});
