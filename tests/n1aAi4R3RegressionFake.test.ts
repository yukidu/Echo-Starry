/** R3 P0/P1 regression tests — intentionally introduced BEFORE the S1 fake fix.
 * Every positive-release scenario stays productionAuthorized=false.
 * Only memory-only FakeAuthority; no Starry ID/R2/Workers/AI.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {MutableFakeAuthority,simulateProtectedQA} from '../n1a-ai4/searchCitationFake.ts';
import type {FakeSource,FakeHooks} from '../n1a-ai4/searchCitationFake.ts';
const ordinary:FakeSource = {trackId:'open-for-member',version:'v1',
 sourceRevision:'rev1',correctionRevision:'1',permissionRevision:'3',
 text:'虛構可讀逐字稿'};
const elite:FakeSource = {trackId:'restricted-vip',version:'v1',
 sourceRevision:'rev2',correctionRevision:'1',permissionRevision:'3',
 text:'虛構VIP私人逐字稿'};
const metadata=(s:FakeSource)=>{
 const {text:_privateText,...ref}=s;
 return ref;
};
const call=(auth:MutableFakeAuthority,refs:readonly ReturnType<typeof metadata>[],
 hooks:FakeHooks={})=>simulateProtectedQA({
 subjectId:auth.subjectId,requestId:'r3-unique',authority:auth,
 candidates:refs as unknown as FakeSource[],
 nowMs:()=>auth.clock,hooks
});
const deny=(r:Awaited<ReturnType<typeof simulateProtectedQA>>)=>{
 assert.deepEqual(r.released,[]);
 assert.equal(r.productionAuthorized,false);
 assert.equal(r.sideEffects,0);
 assert.notEqual(r.reason,'fake_admitted');
 assert.ok(!JSON.stringify(r).includes(elite.text));
};
test('R3-P0-01 active ordinary member cannot cite a higher entitlement resource',async()=>{
 const a=new MutableFakeAuthority([ordinary,elite]);
 (a as unknown as {setEntitlement(trackId:string,allowed:boolean):void})
 .setEntitlement(elite.trackId,false);
 const r=await call(a,[metadata(a.resources.get(elite.trackId)!)]);
 deny(r);assert.equal(r.stage,'T0');assert.equal(a.bodyReadCount,0);
});
test('R3-P0-02 one forbidden resource blocks whole two-source result',async()=>{
 const a=new MutableFakeAuthority([ordinary,elite]);
 (a as unknown as {setEntitlement(trackId:string,allowed:boolean):void})
 .setEntitlement(elite.trackId,false);
 const r=await call(a,[metadata(ordinary),metadata(a.resources.get(elite.trackId)!)]);
 deny(r);assert.equal(r.stage,'T0');
});
test('R3-P1-03 normal allowed output fetches private bytes only after T0 authorization',async()=>{
 const a=new MutableFakeAuthority([ordinary]);
 const r=await call(a,[metadata(ordinary)]);
 assert.deepEqual(r.released,[ordinary.text]);
 assert.equal(r.stage,'SEND');assert.equal(r.productionAuthorized,false);
 assert.equal(a.readCount,3);
});
test('R3-P1-04 attempts to pass private bytes as a search candidate are rejected at T0',async()=>{
 const a=new MutableFakeAuthority([ordinary]);
 const r=await simulateProtectedQA({
  subjectId:a.subjectId,requestId:'r3-unique',authority:a,
  candidates:[ordinary],nowMs:()=>a.clock
 });
 deny(r);assert.equal(r.stage,'T0');assert.equal(a.sentCount,0);
});
test('R3-P1-05 transcript contents mutate after T2 without version bump => refuse send',async()=>{
 const a=new MutableFakeAuthority([ordinary]);
 const r=await call(a,[metadata(ordinary)],{beforeSend:()=>{
  a.resources.set(ordinary.trackId,{...ordinary,text:'偷偷修改原文但ETag與版次不變'});
 }});
 deny(r);assert.equal(r.stage,'SEND');assert.equal(a.sentCount,0);
});
test('R3-P1-06 transcript contents mutate during SQL without version bump => refuse T1',async()=>{
 const a=new MutableFakeAuthority([ordinary]);
 const r=await call(a,[metadata(ordinary)],{afterSQL:()=>{
  a.resources.set(ordinary.trackId,{...ordinary,text:'SQL期間遭竄改且版次不變'});
 }});
 deny(r);assert.equal(r.stage,'T1');
});
for(const stage of ['T1','T2','SEND'] as const){
 test('R3-P0 entitlement revoked at '+stage+' => zero references',async()=>{
  const a=new MutableFakeAuthority([ordinary]);
  const hook=()=>{(a as unknown as {setEntitlement(trackId:string,allowed:boolean):void})
    .setEntitlement(ordinary.trackId,false);};
  const hooks:FakeHooks=stage==='T1'?{afterSQL:hook}:stage==='T2'?{afterT1:hook}:{beforeSend:hook};
  const r=await call(a,[metadata(ordinary)],hooks);
  deny(r);assert.equal(r.stage,stage);assert.equal(a.sentCount,0);
 });
}
