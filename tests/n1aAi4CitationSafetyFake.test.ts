import test from 'node:test';
import assert from 'node:assert/strict';
import {MutableFakeAuthority,N1A_AI4_FAKE_ONLY,N1A_AI4_PRODUCTION_ENABLED,simulateProtectedQA,validateFakeProof}
  from '../n1a-ai4/searchCitationFake.ts';
import type {FakeSource} from '../n1a-ai4/searchCitationFake.ts';
const privateText='虛構的受保護逐字稿：訪客不應看見這一段';
const docs:FakeSource[]=[
 {trackId:'fake-track-a',version:'v1',sourceRevision:'etag.v1',
  correctionRevision:'1',permissionRevision:'2',text:privateText},
 {trackId:'fake-track-b',version:'v1',sourceRevision:'etag.second',
  correctionRevision:'1',permissionRevision:'2',text:'第二份完全虛構的受保護內容'}
];
function setup(){
 const auth=new MutableFakeAuthority(docs,docs.map(s=>s.trackId));
 const run=(hooks?:Parameters<typeof simulateProtectedQA>[0]['hooks'],
   candidates:readonly FakeSource[]=[docs[0]],subjectId=auth.subjectId,requestId='request-123')=>
   simulateProtectedQA({authority:auth,candidates:candidates.map(({text:_neverT0,...ref})=>ref),subjectId,requestId,nowMs:()=>auth.clock,hooks});
 return {auth,run};
}
const blocked=(r:Awaited<ReturnType<typeof simulateProtectedQA>>)=>{
 assert.deepEqual(r.released,[]);
 assert.equal(r.productionAuthorized,false);assert.equal(r.sideEffects,0);
 assert.notEqual(r.reason,'fake_admitted');
 assert.equal(JSON.stringify(r).includes(privateText),false);
};
test('AI4-S1-01 OFF flag and 3 genuine fake-stage reads + final fake SEND',async()=>{
 assert.equal(N1A_AI4_FAKE_ONLY,true);
 assert.equal(N1A_AI4_PRODUCTION_ENABLED,false);
 const {auth,run}=setup();const r=await run();
 assert.equal(r.reason,'fake_admitted');assert.equal(r.stage,'SEND');
 assert.deepEqual(r.released,[privateText]);assert.equal(r.productionAuthorized,false);
 assert.equal(r.sideEffects,0);assert.equal(auth.readCount,3);assert.equal(auth.sentCount,1);
});
test('AI4-S1-02 T0 missing authority does not release protected text',async()=>{
 const {auth,run}=setup();auth.offline=true;
 const r=await run();blocked(r);assert.equal(r.stage,'T0');assert.equal(auth.readCount,1);
});
test('AI4-S1-03 member revoked during SQL rejected at T1',async()=>{
 const {auth,run}=setup();const r=await run({afterSQL:()=>auth.suspendMember()});
 blocked(r);assert.equal(r.stage,'T1');
});
test('AI4-S1-04 pending resource revocation after T0 rejected at T1',async()=>{
 const {auth,run}=setup();
 const r=await run({afterT0:()=>auth.block(docs[0].trackId)});
 blocked(r);assert.equal(r.stage,'T1');
});
test('AI4-S1-05 deletion after T1 rejected at T2',async()=>{
 const {auth,run}=setup();
 const r=await run({afterT1:()=>auth.remove(docs[0].trackId)});
 blocked(r);assert.equal(r.stage,'T2');
});
test('AI4-S1-06 correction change after T1 rejects old answer',async()=>{
 const {auth,run}=setup();
 const r=await run({afterT1:()=>auth.correct(docs[0].trackId)});
 blocked(r);assert.equal(r.stage,'T2');
});
test('AI4-S1-07 source replacement during SQL rejects old quote',async()=>{
 const {auth,run}=setup();
 const r=await run({afterSQL:()=>auth.replace(docs[0].trackId)});
 blocked(r);assert.equal(r.stage,'T1');
});
test('AI4-S1-08 stale witness behind independent checkpoint blocked',async()=>{
 const {auth,run}=setup();auth.witnessSeq='19';blocked(await run());
});
test('AI4-S1-09 restoreEpoch differs after T1 then T2 rejects',async()=>{
 const {auth,run}=setup();
 const r=await run({afterT1:()=>{auth.epoch='7';}});
 blocked(r);
});
test('AI4-S1-10 witness offline after T1 means no output',async()=>{
 const {auth,run}=setup();
 const r=await run({afterT1:()=>{auth.offline=true;}});
 blocked(r);
});
test('AI4-S1-11 other member or changed request bound to proof denied',async()=>{
 const {run}=setup();
 blocked(await run(undefined,[docs[0]],'other-member'));
});
test('AI4-S1-12 revocation between T2 and SEND denies',async()=>{
 const {auth,run}=setup();
 const r=await run({beforeSend:()=>auth.revoke(docs[0].trackId)});
 blocked(r);assert.equal(r.stage,'SEND');assert.equal(auth.sentCount,0);
});
test('AI4-S1-13 deletion between T2 and SEND denies',async()=>{
 const {auth,run}=setup();
 blocked(await run({beforeSend:()=>auth.remove(docs[0].trackId)}));
});
test('AI4-S1-14 correction between T2 and SEND denies',async()=>{
 const {auth,run}=setup();
 blocked(await run({beforeSend:()=>auth.correct(docs[0].trackId)}));
});
test('AI4-S1-15 source version change between T2 and SEND denies',async()=>{
 const {auth,run}=setup();
 blocked(await run({beforeSend:()=>auth.replace(docs[0].trackId)}));
});
test('AI4-S1-16 partly revoked multi-source response never leaks remaining text',async()=>{
 const {auth,run}=setup();
 const r=await run({afterT1:()=>auth.revoke(docs[1].trackId)},docs);
 blocked(r);
});
test('AI4-S1-17 malformed or expired proof and delayed SEND blocked',async()=>{
 const {auth,run}=setup();
 const p=await auth.read(auth.subjectId,'request-123',[docs[0].trackId]);
 assert.ok(p);
 const expected={subjectId:auth.subjectId,requestId:'request-123',sources:[docs[0]]};
 assert.equal(validateFakeProof({...p!,expiresAtMs:auth.clock},expected,auth.clock),false);
 assert.equal(validateFakeProof({...p!,restoreEpoch:'01'},expected,auth.clock),false);
 assert.equal(validateFakeProof({...p!,requestId:'old-request'},expected,auth.clock),false);
 blocked(await run({beforeSend:()=>{auth.clock+=10_000;}}));
});
test('AI4-S1-18 buffering prevents streaming before last permission gate',async()=>{
 const {auth,run}=setup();let gates=0;
 const r=await run({beforeSend:()=>{gates++;auth.block(docs[0].trackId);}});
 blocked(r);assert.equal(gates,1);assert.equal(auth.sentCount,0);
});
test('AI4-S1-19 missing member, deleted source, permission revision changed all blocked',async()=>{
 const a=setup();a.auth.active=false;blocked(await a.run());
 const b=setup();b.auth.remove(docs[0].trackId);blocked(await b.run());
 const c=setup();c.auth.resources.set(docs[0].trackId,{...docs[0],permissionRevision:'3'});
 blocked(await c.run());
});
test('AI4-S1-20 2000 fake concurrent queries and witness offline => zero release',async()=>{
 const {auth,run}=setup();auth.offline=true;
 const results=await Promise.all(Array.from({length:2000},(_,i)=>
  run(undefined,[docs[0]],auth.subjectId,'req-'+i)));
 assert.equal(results.filter(r=>r.released.length>0).length,0);
 assert.ok(results.every(r=>r.productionAuthorized===false&&r.sideEffects===0));
 assert.equal(auth.sentCount,0);
});
