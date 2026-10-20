import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {B07Error} from '../worker/starryAiB07Budget';
import {
 reserveRunMax,claimProviderAttempt,completeOrHoldUncertain,finalizeRunMax,
 cancelNeverSentRun,reconcileByProof,type S3Env,type S3Plan
} from '../worker/starryAiB07S3Safety';

function driver(file:string,action:'init'|'exec',body?:object){
 const proc=spawnSync('python3',['tests/b07-s3-fake-d1.py',file,action],{
  encoding:'utf8',input:body?JSON.stringify(body):'',timeout:15_000,maxBuffer:1024*1024
 });
 if(proc.status!==0)throw new Error('FAKE_LOCAL_SQLITE_FAILURE: '+String(proc.stderr||'').slice(0,400));
 return JSON.parse(proc.stdout);
}
function setup(t:any,paidLimit=0){
 const dir=mkdtempSync(join(tmpdir(),'s3-b07-fake-')),file=join(dir,'fake.sqlite');
 t.after(()=>rmSync(dir,{recursive:true,force:true}));
 driver(file,'init');
 const execute=(sql:string,args:any[],mode:'first'|'run'|'all')=>{
  const r=driver(file,'exec',{sql,args,mode});
  return mode==='first'?r.row:mode==='all'?{results:r.rows}:r;
 };
 const db={
  prepare(sql:string){
   return {
    bind(...args:any[]){
     return {first:async()=>execute(sql,args,'first'),
      run:async()=>execute(sql,args,'run'),all:async()=>execute(sql,args,'all')};
    },
    first:async()=>execute(sql,[],'first'),
    run:async()=>execute(sql,[],'run'),
    all:async()=>execute(sql,[],'all')
   };
  }
 };
 const env:S3Env={STARRY_ID_DB:db};
 const limit=(n:number)=>{for(const scope of ['global','member:default','app:echostars','task:echostars:echo.qa']){
  execute('UPDATE starry_ai_b07_policies SET max_micro_twd=? WHERE scope_key=?',[n,scope],'run');
 }};
 limit(paidLimit);
 const quote=(tag:string,maxUnits=1,modelId='@cf/fake/priced')=>({
   requestKey:'test-s3-'+tag, fingerprint:'b'.repeat(64),appId:'echostars',taskId:'echo.qa',
   memberKey:'a'.repeat(64),modelId,maxUnits
 });
 const plan=(n=1,attempts=1,units=1):S3Plan=>({segmentCount:n,maxAttemptsPerSegment:attempts,maxUnitsPerAttempt:units});
 const permit=(verified=true)=>({verified,expiresAt:Date.now()+60_000,revision:'fake-rev-001'});
 const row=(table:string,where='1=1',args:any[]=[])=>execute('SELECT * FROM '+table+' WHERE '+where,args,'first');
 return {env,db,execute,quote,plan,permit,row,limit};
}
test('S3-01 priced provider at NT$0 is denied even with a valid-looking human approval',async t=>{
 const s=setup(t,0);
 await assert.rejects(()=>reserveRunMax(s.env,s.quote('zero',3),s.plan(1,3,1)),B07Error);
 assert.equal(s.row('starry_ai_b07_calls'),null);
});
test('S3-02 unverified free account-wide remaining is denied; fake authoritative meter is bounded',async t=>{
 const s=setup(t);
 const q=s.quote('free',5,'@cf/fake/free');
 await assert.rejects(()=>reserveRunMax(s.env,q,s.plan(1,1,5)),/s3_official_free_balance_unknown/);
 s.env.B07_ACCOUNT_FREE_AUTHORITY={verify:async()=>({
  verified:true,accountRemaining:4,validUntil:Date.now()+100000,provenance:'fake-official-meter'
 })};
 await assert.rejects(()=>reserveRunMax(s.env,q,s.plan(1,1,5)),/s3_official_free_balance_unknown/);
 s.env.B07_ACCOUNT_FREE_AUTHORITY={verify:async()=>({
  verified:true,accountRemaining:100,validUntil:Date.now()+100000,provenance:'fake-official-meter'
 })};
 const a=await reserveRunMax(s.env,q,s.plan(1,1,5));
 assert.equal(a.state,'reserved');assert.equal(a.reservedMicroTwd,0);
 const duplicate=await reserveRunMax(s.env,q,s.plan(1,1,5));
 assert.equal(duplicate.duplicate,true);assert.equal(duplicate.requestId,a.requestId);
});
test('S3-03 80 HTTP-equivalent same-key replays authorize precisely ONE fake provider call',async t=>{
 const s=setup(t,2000),q=s.quote('80-replays',30),p=s.plan(2,3,5);
 const ids=await Promise.all(Array.from({length:80},()=>reserveRunMax(s.env,q,p)));
 assert.equal(new Set(ids.map(x=>x.requestId)).size,1);
 assert.equal(ids.filter(x=>x.duplicate===false).length,1);
 const runId=ids[0].requestId;
 const tickets=await Promise.all(Array.from({length:80},()=>claimProviderAttempt(s.env,{
  requestId:runId,segmentIndex:0,attemptOrdinal:0,runAuthority:s.permit()
 })));
 let fakeProviderCalls=0;
 for(const ticket of tickets)if(ticket.allowed)fakeProviderCalls++;
 assert.equal(fakeProviderCalls,1);
 assert.equal(s.execute('SELECT COUNT(*) AS n FROM starry_ai_b07_s3_attempts',[],'first').n,1);
 assert.equal(s.execute('SELECT COUNT(*) AS n FROM starry_ai_b07_calls',[],'first').n,1);
});
test('S3-04 once a provider may have seen the request, retrying SAME OR NEXT attempt is denied',async t=>{
 const s=setup(t,400),id=(await reserveRunMax(s.env,s.quote('unknown',6),s.plan(2,3,1))).requestId;
 const first=await claimProviderAttempt(s.env,{requestId:id,segmentIndex:0,attemptOrdinal:0,runAuthority:s.permit()});
 assert.equal(first.allowed,true);
 const uncertain=await completeOrHoldUncertain(s.env,{requestId:id,attemptKey:(first as any).attemptKey,kind:'unknown'});
 assert.equal(uncertain.heldOnUnknown,true);
 assert.equal(s.row('starry_ai_b07_calls').status,'uncertain');
 assert.equal((await claimProviderAttempt(s.env,{requestId:id,segmentIndex:0,attemptOrdinal:1,runAuthority:s.permit()})).allowed,false);
 assert.equal((await claimProviderAttempt(s.env,{requestId:id,segmentIndex:1,attemptOrdinal:0,runAuthority:s.permit()})).allowed,false);
 const used=s.row('starry_ai_b07_usage',"scope_key='global'");
 assert.equal(used.held_micro_twd,12);assert.equal(used.settled_micro_twd,0);
});
test('S3-05 two independently verified reviewers append one durable adjustment, no double settlement',async t=>{
 const s=setup(t,1000),id=(await reserveRunMax(s.env,s.quote('review',6),s.plan(2,3,1))).requestId;
 const first=await claimProviderAttempt(s.env,{requestId:id,segmentIndex:0,attemptOrdinal:0,runAuthority:s.permit()});
 await completeOrHoldUncertain(s.env,{requestId:id,attemptKey:(first as any).attemptKey,kind:'unknown'});
 const input={requestId:id,evidenceSource:'provider_invoice' as const,evidenceDigest:'c'.repeat(64),
  firstReviewer:'reviewer-one',secondReviewer:'reviewer-two',actualUnits:2};
 await assert.rejects(()=>reconcileByProof(s.env,input),/s3_review_authority_unavailable/);
 s.env.B07_REVIEW_AUTHORITY={verify:async({firstReviewer,secondReviewer})=>
  firstReviewer==='reviewer-one'&&secondReviewer==='reviewer-two'};
 await assert.rejects(()=>reconcileByProof(s.env,{...input,secondReviewer:'reviewer-one'}),
  /s3_two_independent_reviewers_required/);
 const firstResult=await reconcileByProof(s.env,input);
 assert.equal(firstResult.idempotent,false);
 const again=await reconcileByProof(s.env,input);assert.equal(again.idempotent,true);
 await assert.rejects(()=>reconcileByProof(s.env,{...input,actualUnits:3}),/s3_invoice_conflict/);
 const global=s.row('starry_ai_b07_usage',"scope_key='global'");
 assert.equal(global.held_micro_twd,0);assert.equal(global.settled_micro_twd,4);
 assert.equal(s.row('starry_ai_b07_calls').status,'uncertain');
 assert.equal(s.execute('SELECT COUNT(*) AS n FROM starry_ai_b07_s3_reconciliations',[],'first').n,1);
});
test('S3-06 each segment is settled before next; finalization returns spare hold',async t=>{
 const s=setup(t,1000),id=(await reserveRunMax(s.env,s.quote('final',12),s.plan(2,3,2))).requestId;
 for(let i=0;i<2;i++){
   const ticket=await claimProviderAttempt(s.env,{requestId:id,segmentIndex:i,attemptOrdinal:0,runAuthority:s.permit()});
   assert.equal(ticket.allowed,true);
   const finish=await completeOrHoldUncertain(s.env,{requestId:id,
    attemptKey:(ticket as any).attemptKey,kind:'confirmed_used',actualUnits:1,receiptDigest:'d'.repeat(64)});
   assert.equal(finish.idempotent,false);
 }
 const end=await finalizeRunMax(s.env,id);
 assert.equal(end.settledMicroTwd,4);
 assert.equal(s.row('starry_ai_b07_calls').status,'settled');
 assert.equal(s.row('starry_ai_b07_usage',"scope_key='global'").held_micro_twd,0);
 assert.equal(s.row('starry_ai_b07_usage',"scope_key='global'").settled_micro_twd,4);
 await assert.rejects(()=>cancelNeverSentRun(s.env,id),/s3_provider_may_have_been_called/);
});
test('S3-07 incomplete sequence cannot finalize or silently refund potentially sent calls',async t=>{
 const s=setup(t,100),id=(await reserveRunMax(s.env,s.quote('incomplete',2),s.plan(2,1,1))).requestId;
 const claimed=await claimProviderAttempt(s.env,{requestId:id,segmentIndex:0,attemptOrdinal:0,runAuthority:s.permit()});
 assert.equal(claimed.allowed,true);
 await assert.rejects(()=>finalizeRunMax(s.env,id),/s3_run_not_fully_accounted/);
 await assert.rejects(()=>cancelNeverSentRun(s.env,id),/s3_provider_may_have_been_called/);
 assert.equal(s.row('starry_ai_b07_calls').status,'reserved');
});
test('S3-08 never-sent run may be voided; extra status mutation and row deletion are forbidden',async t=>{
 const s=setup(t,100),id=(await reserveRunMax(s.env,s.quote('cancel',1),s.plan())).requestId;
 await cancelNeverSentRun(s.env,id);
 assert.equal(s.row('starry_ai_b07_calls').status,'void');
 assert.equal(s.row('starry_ai_b07_usage',"scope_key='global'").held_micro_twd,0);
 assert.throws(()=>s.execute("DELETE FROM starry_ai_b07_calls WHERE id=?",[id],'run'));
});
test('S3-09 spoofed run authority, wrong segment, duplicate fingerprints never grant a send ticket',async t=>{
 const s=setup(t,100),q=s.quote('proof',1),id=(await reserveRunMax(s.env,q,s.plan())).requestId;
 await assert.rejects(()=>claimProviderAttempt(s.env,{requestId:id,segmentIndex:0,attemptOrdinal:0,
  runAuthority:s.permit(false)}),/s3_run_authority_unverified/);
 assert.equal((await claimProviderAttempt(s.env,{requestId:id,segmentIndex:9,attemptOrdinal:0,
  runAuthority:s.permit()})).allowed,false);
 await assert.rejects(()=>reserveRunMax(s.env,{...q,fingerprint:'e'.repeat(64)},s.plan()),
  /idempotency_key_reused/);
});
test('S3-10 missing central DB and unknown rate fail closed without a provider request',async t=>{
 const s=setup(t,100);
 await assert.rejects(()=>reserveRunMax({} as S3Env,s.quote('offline',1),s.plan()),
  /b07_central_database_unavailable/);
 await assert.rejects(()=>reserveRunMax(s.env,s.quote('no-price',1,'@cf/fake/missing'),s.plan()),
  /s3_tariff_unknown/);
});
test('S3-11 SQL bypass cannot invent an attempt or modify immutable reconciliation',async t=>{
 const s=setup(t,100),id=(await reserveRunMax(s.env,s.quote('sql-guard',1),s.plan())).requestId;
 assert.throws(()=>s.execute('INSERT INTO starry_ai_b07_s3_attempts '+
  "(attempt_key,request_id,segment_index,attempt_ordinal,max_units,status,created_at,updated_at) VALUES (?,?,0,0,10,'may_have_sent',1,1)",
  ['false',id],'run'));
 assert.throws(()=>s.execute('UPDATE starry_ai_b07_s3_run_plans SET segment_count=2 WHERE request_id=?',[id],'run'));
 assert.throws(()=>s.execute('DELETE FROM starry_ai_b07_s3_run_plans WHERE request_id=?',[id],'run'));
});
test('S3-12 patched local HTTP harness cannot echo stack, paths or arbitrary exception strings',()=>{
 const source=readFileSync('tests/b07-offline-http-fake-users.mjs','utf8');
 assert.match(source,/invalid_local_request/);
 assert.match(source,/local_simulation_failed/);
 assert.doesNotMatch(source,/res\.end\(JSON\.stringify\(\{error:String\(err\)\}\)\)/);
 const service=readFileSync('worker/starryAiB07S3Safety.ts','utf8');
 assert.doesNotMatch(service,/\.AI\.run\s*\(|fetch\s*\(\s*['"]https?:\/\//);
});
test('S3-13 legacy SQLite baseline handles 2000 submissions offline',()=>{
 const r=spawnSync('python3',['tests/b07-budget-sqlite-safety.py'],{encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
 assert.equal(r.status,0,'offline SQLite failed: '+r.stderr.slice(0,500));
 assert.match(r.stdout,/B07_SQLITE_SAFETY_OK/);
});
test('S3-14 legacy localhost HTTP only: 2000 fake identities, <=96 connections; no real AI',()=>{
 const r=spawnSync('node',['tests/b07-offline-http-fake-users.mjs'],{encoding:'utf8',timeout:180000,maxBuffer:1024*1024});
 assert.equal(r.status,0,'loopback only: '+r.stderr.slice(0,400));
 assert.match(r.stdout,/B07_OFFLINE_HTTP_FAKE_USERS_OK/);
 assert.match(r.stdout,/"paidProviderCalls":0/);
});
