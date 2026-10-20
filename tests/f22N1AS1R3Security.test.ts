import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {FakeStarryIdSource,newFakeDatabase,applyFakeEvent,fakeStats,setupFakeAccount,reserveFakeBatch} from '../f22-n1a-s1/offlineModel.ts';
const NOW=Date.parse('2026-10-20T12:15:00Z');
test('R3 P0 NEGATIVE: restored old SQLite must not release private F22 counts without independent witness',()=>{
 const db=newFakeDatabase(),source=new FakeStarryIdSource('FAKE_R3_ONLY');
 try{
  source.register('member');
  const event=source.firstAccept({logicalSourceId:'e1',app:'echo',subject:'member',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'});
  assert.equal(applyFakeEvent(db,source,event),'APPLIED');
  // Before fix, fakeStats(db, ...) returned private counts with no proof.
  // After fix, a missing witness MUST reject, including on restored SQLite.
  assert.throws(()=>fakeStats(db,'all',NOW),/FAKE_PRIVATE_AUTH_REQUIRED/);
 }finally{db.close();}
});
test('R3 P1 NEGATIVE: guest-owned event cannot be reissued as member after registration',()=>{
 const issuer=new FakeStarryIdSource('FAKE_R3_ONLY');
 const first=issuer.firstAccept({logicalSourceId:'shared',app:'echo',subject:null,track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'});
 issuer.register('someone');
 assert.equal(first.identityKind,'guest');
 assert.throws(()=>issuer.firstAccept({logicalSourceId:'shared',app:'echo',subject:'someone',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'}),/ACTION_IDENTITY_CONFLICT/);
});
test('R3 P1 NEGATIVE: existing member identity cannot be swapped to anonymous using same event ID',()=>{
 const issuer=new FakeStarryIdSource('FAKE_R3_ONLY');issuer.register('member');
 issuer.firstAccept({logicalSourceId:'same',app:'echo',subject:'member',track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'});
 assert.throws(()=>issuer.firstAccept({logicalSourceId:'same',app:'echo',subject:null,track:'t1',acceptedAtUtcMs:NOW-1000,state:'done'}),/ACTION_IDENTITY_CONFLICT/);
});
