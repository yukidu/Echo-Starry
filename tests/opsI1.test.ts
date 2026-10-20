import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICES } from '../ops-s1/healthModel.ts';
import type { Observation } from '../ops-s1/healthModel.ts';
import { composeSyntheticOps, createMockSnapshotReader } from '../ops-s1/syntheticEvents.ts';
import type { SyntheticInput, SyntheticKind, SyntheticOrigin } from '../ops-s1/syntheticEvents.ts';
import { createReadOnlyOpsHandler } from '../ops-s1/readOnlyHandler.ts';

const NOW = Date.parse('2026-10-20T09:30:00.000Z');
const fresh = new Date(NOW - 1000).toISOString();
const stale = new Date(NOW - 60*60*1000).toISOString();
function event(origin:SyntheticOrigin,kind:SyntheticKind, verified=true,observedAt=fresh):SyntheticInput {
  return {origin,kind,verified,observedAt};
}
const ai2 = event('ai2','dispatch_uncertain');
const ai3 = event('ai3','b07_uncertain_hold');
const ai7 = event('ai7','restore_locked');
const baseNormal=(service:(typeof SERVICES)[number]):Observation=>({
  service,source:'fixture',observedAt:fresh,windowMinutes:15,
  verified:true,access:'granted',requests:200,serverErrors:0,
});
const url=(path:string,init?:RequestInit)=>new Request('https://mock.invalid'+path,init);
const identity=(subject='test-admin')=>({subject,verifiedByCentralId:true,currentCentralSuperAdmin:true,expiresAt:NOW+60000});
const getCard=(e:readonly SyntheticInput[],service:(typeof SERVICES)[number],obs:readonly Observation[]=[])=>{
  const c=composeSyntheticOps(e,NOW,obs).dashboard.services.find(s=>s.service===service);
  assert.ok(c);return c;
};

test('I1-01 six cloud cards exist, no synthetic signal creates green health',()=>{
  const state=composeSyntheticOps([],NOW);
  assert.deepEqual(state.dashboard.services.map(s=>s.service),[...SERVICES]);
  assert.equal(state.dashboard.overall,'unknown');
  assert.ok(state.dashboard.services.every(s=>s.status==='unknown'));
  assert.equal(state.hasLiveCloudData,false);
});

test('I1-02 AI2 dispatch uncertainty appears on Workflows as a warning, never a retry',()=>{
  const state=composeSyntheticOps([ai2],NOW);
  assert.equal(getCard([ai2],'workflows').status,'warning');
  assert.equal(state.incidents[0].code,'WORKFLOW_DISPATCH_UNCERTAIN');
  assert.equal(state.retryAllowed,false);
});

test('I1-03 AI2 processing timeout is warning/manual review; verified failure is fault',()=>{
  assert.equal(getCard([event('ai2','processing_timeout')],'workflows').status,'warning');
  const state=composeSyntheticOps([event('ai2','workflow_failed')],NOW);
  assert.equal(state.dashboard.overall,'fault');
  assert.equal(getCard([event('ai2','workflow_failed')],'workflows').status,'fault');
  assert.equal(state.incidents[0].needsHumanReview,true);
});

test('I1-04 AI3 uncertain bill hold is a safety warning, NOT evidence of billed amount',()=>{
  const state=composeSyntheticOps([ai3],NOW);
  const card=state.dashboard.services.find(c=>c.service==='workers_ai');
  assert.equal(card?.status,'warning');
  assert.equal(card?.quotaPercent,null);
  assert.equal(card?.quotaState,'unknown');
  assert.match(state.incidents[0].message,/不是模型故障證據/);
});

test('I1-05 AI3 stop spending is safe blocked advisory, never invokes a model',()=>{
  const state=composeSyntheticOps([event('ai3','b07_stop_new_spend')],NOW);
  assert.equal(state.dashboard.services.find(c=>c.service==='workers_ai')?.status,'warning');
  assert.equal(state.newSpendingAllowed,false);
  assert.equal(state.actionsAllowed,false);
});

test('I1-06 AI7 backup anomaly is R2 warning without claiming R2 outage',()=>{
  const state=composeSyntheticOps([event('ai7','backup_anomaly')],NOW);
  assert.equal(state.dashboard.services.find(c=>c.service==='r2')?.status,'warning');
  assert.match(state.incidents[0].message,/不等於 R2 服務當機/);
});

test('I1-07 AI7 restore lock maps to D1 warning but does not unlock restores',()=>{
  const state=composeSyntheticOps([ai7],NOW);
  assert.equal(state.dashboard.services.find(c=>c.service==='d1')?.status,'warning');
  assert.equal(state.restoreAllowed,false);
  assert.match(state.incidents[0].message,/不等於 D1 服務當機/);
});

test('I1-08 AI7 truly verified backup integrity failure maps R2 to fault',()=>{
  const state=composeSyntheticOps([event('ai7','backup_integrity_fault')],NOW);
  assert.equal(state.dashboard.services.find(c=>c.service==='r2')?.status,'fault');
});

test('I1-09 all three parties together preserve four independently affected services',()=>{
  const state=composeSyntheticOps([ai2,event('ai2','processing_timeout'),ai3,
    event('ai3','b07_stop_new_spend'),event('ai7','backup_anomaly'),ai7],NOW);
  const status=Object.fromEntries(state.dashboard.services.map(c=>[c.service,c.status]));
  assert.deepEqual(status,{workers:'unknown',workflows:'warning',d1:'warning',r2:'warning',kv:'unknown',workers_ai:'warning'});
  assert.equal(state.incidents.length,6);
  assert.equal(state.dashboard.overall,'warning');
  assert.equal(state.dashboard.partialUnknown,true);
});

test('I1-10 verified fault beats a normal metric regardless input order',()=>{
  const fault=event('ai2','workflow_failed');
  for(const baseline of [baseNormal('workflows'),{...baseNormal('workflows'),observedAt:new Date(NOW-30000).toISOString()}]){
    const state=composeSyntheticOps([fault],NOW,[baseline]);
    assert.equal(state.dashboard.services.find(c=>c.service==='workflows')?.status,'fault');
    assert.equal(state.dashboard.overall,'fault');
  }
});

test('I1-11 conflicting synthetic warning and normal is unknown, never green',()=>{
  const card=getCard([ai2],'workflows',[baseNormal('workflows')]);
  assert.equal(card.status,'unknown');assert.equal(card.conflict,true);
});

test('I1-12 stale and unverified source become unknown',()=>{
  for(const item of [event('ai2','dispatch_uncertain',true,stale),
                     event('ai2','dispatch_uncertain',false,fresh),
                     event('ai2','dispatch_uncertain',true,'not a date')]){
    assert.equal(getCard([item],'workflows').status,'unknown');
    assert.equal(composeSyntheticOps([item],NOW).incidents[0].evidence,'unverified');
  }
});

test('I1-13 untrusted origin/kind pairing fails closed even with healthy baseline',()=>{
  const wrong={...ai2,origin:'ai7'} as unknown as SyntheticInput;
  const state=composeSyntheticOps([wrong],NOW,SERVICES.map(baseNormal));
  for(const service of ['workflows','d1','r2','workers_ai']) {
    assert.equal(state.dashboard.services.find(c=>c.service===service)?.status,'unknown');
  }
  assert.equal(state.incidents[0].code,'SYNTHETIC_SOURCE_UNVERIFIED');
});

test('I1-14 confirmed fault persists even when another record is stale/untrusted',()=>{
  const state=composeSyntheticOps([event('ai2','workflow_failed'),event('ai2','dispatch_uncertain',false,stale)],NOW,[baseNormal('workflows')]);
  const card=state.dashboard.services.find(s=>s.service==='workflows');
  assert.equal(card?.status,'fault'); assert.equal(card?.conflict,true);
});

test('I1-15 quota-only information never proves model healthy during uncertain bill',()=>{
  const quota={...baseNormal('workers_ai'),requests:undefined,serverErrors:undefined,
    quotaUsed:1,quotaLimit:100000,quotaVerified:true};
  const state=composeSyntheticOps([event('ai3','b07_uncertain_hold',false)],NOW,[quota]);
  assert.equal(state.dashboard.services.find(c=>c.service==='workers_ai')?.status,'unknown');
  assert.equal(state.newSpendingAllowed,false);
});

test('I1-16 sanitized event messages cannot reveal arbitrary provided private metadata',()=>{
  const malicious={...ai2,memberName:'FAKE-SECRET-NAME',trackId:'FAKE-SECRET-AUDIO',
    email:'FAKE-EMAIL',token:'FAKE-TOKEN',rawTranscript:'FAKE-TRANSCRIPT',
    providerPayload:'FAKE-PRIVATE-PAYLOAD'} as unknown as SyntheticInput;
  const state=composeSyntheticOps([malicious],NOW);
  const serialized=JSON.stringify(state);
  for(const secret of ['FAKE-SECRET-NAME','FAKE-SECRET-AUDIO','FAKE-EMAIL',
    'FAKE-TOKEN','FAKE-TRANSCRIPT','FAKE-PRIVATE-PAYLOAD']) assert.equal(serialized.includes(secret),false);
  assert.equal(state.incidents[0].actionAllowed,false);
});

test('I1-17 repeat synthetic events aggregate anonymously without duplicate member IDs',()=>{
  const state=composeSyntheticOps(Array.from({length:200},()=>ai2),NOW);
  assert.equal(state.incidents.length,1);
  assert.equal(state.incidents[0].count,200);
  assert.equal(state.incidents[0].correlationCode,'REDACTED');
});

test('I1-18 over-limit batch fails closed without a false green baseline',()=>{
  const events=Array.from({length:4097},()=>event('ai7','backup_anomaly'));
  const state=composeSyntheticOps(events,NOW,SERVICES.map(baseNormal));
  assert.equal(state.overflow,true);
  assert.notEqual(state.dashboard.services.find(c=>c.service==='r2')?.status,'normal');
  assert.ok(state.incidents.some(c=>c.code==='SYNTHETIC_INPUT_OVERFLOW'));
  assert.ok(state.incidents.length<=25);
});

test('I1-19 2000 fake non-admin users cannot read data even once',async()=>{
  let obs=0,synthetic=0,incidents=0;
  const handler=createReadOnlyOpsHandler({
    now:()=>NOW,verifyCurrentCentralSuperAdmin:async()=>({...identity('anonymous'),verifiedByCentralId:false}),
    readMockObservations:async()=>{obs++;return SERVICES.map(baseNormal);},
    readMockIncidents:async()=>{incidents++;return[];},
    readMockSyntheticEvents:async()=>{synthetic++;return[ai2];},allowRead:()=>true,
  });
  const status=await Promise.all(Array.from({length:2000},()=>handler(url('/admin/ops/health-summary'))));
  assert.ok(status.every(x=>x.status===403));
  assert.deepEqual([obs,synthetic,incidents],[0,0,0]);
});

test('I1-20 2000 concurrent fake admins use ONE in-isolate injected read',async()=>{
  let obs=0,synthetic=0;
  const handler=createReadOnlyOpsHandler({
    now:()=>NOW,verifyCurrentCentralSuperAdmin:async(req)=>identity(req.headers.get('X-Fake-User')||'test'),
    readMockObservations:async()=>{obs++;return SERVICES.map(baseNormal);},
    readMockIncidents:async()=>[],
    readMockSyntheticEvents:async()=>{synthetic++;return[ai2];},
    allowRead:()=>true,
  });
  const responses=await Promise.all(Array.from({length:2000},(_,i)=>handler(
    url('/admin/ops/health-summary',{headers:{'X-Fake-User':'synthetic-admin-'+i}}))));
  assert.ok(responses.every(x=>x.status===200));
  assert.equal(obs,1); assert.equal(synthetic,1);
  const data=await responses[1999].json();
  assert.equal(data.mode,'mock_only');
  assert.equal(data.services.find((c:any)=>c.service==='workflows').status,'unknown'); // conflicting mock normal + dispatch warning
});

test('I1-21 2000 simultaneous incident requests read one injected source each',async()=>{
  let obs=0,synthetic=0,history=0;
  const handler=createReadOnlyOpsHandler({
    now:()=>NOW,verifyCurrentCentralSuperAdmin:async()=>identity(),
    readMockObservations:async()=>{obs++;return[];},
    readMockIncidents:async()=>{history++;return[];},
    readMockSyntheticEvents:async()=>{synthetic++;return[ai2,ai3,ai7];},
    allowRead:()=>true,
  });
  const responses=await Promise.all(Array.from({length:2000},()=>handler(url('/admin/ops/health-incidents?limit=3'))));
  assert.ok(responses.every(x=>x.status===200));
  assert.equal(history,1);assert.equal(synthetic,1);assert.equal(obs,0);
  const body=await responses[0].json();
  assert.equal(body.items.length,3);assert.ok(body.items.every((i:any)=>i.needsHumanReview===true));
});

test('I1-22 failure of fake source must not expose error or preserve green status',async()=>{
  const handler=createReadOnlyOpsHandler({
    now:()=>NOW,verifyCurrentCentralSuperAdmin:async()=>identity(),
    readMockObservations:async()=>SERVICES.map(baseNormal),
    readMockIncidents:async()=>[],
    readMockSyntheticEvents:async()=>{throw Error('FAKE-SECRET-PROVIDER');},
    allowRead:()=>true,
  });
  const summary=await(await handler(url('/admin/ops/health-summary'))).json();
  assert.equal(summary.services.find((c:any)=>c.service==='workflows').status,'unknown');
  assert.equal(summary.services.find((c:any)=>c.service==='d1').status,'unknown');
  assert.equal(JSON.stringify(summary).includes('FAKE-SECRET-PROVIDER'),false);
});

test('I1-23 event paging still capped at 25 and GET only',async()=>{
  const handler=createReadOnlyOpsHandler({
    now:()=>NOW,verifyCurrentCentralSuperAdmin:async()=>identity(),
    readMockObservations:async()=>[],readMockIncidents:async()=>[],
    readMockSyntheticEvents:async()=>Array.from({length:300},(_,i)=>event('ai2',
      i%2===0?'dispatch_uncertain':'processing_timeout')),allowRead:()=>true,
  });
  assert.equal((await handler(url('/admin/ops/health-incidents?limit=26'))).status,400);
  assert.equal((await handler(url('/admin/ops/health-incidents',{method:'POST'}))).status,405);
  const payload=await(await handler(url('/admin/ops/health-incidents?limit=1'))).json();
  assert.equal(payload.items.length,1);assert.equal(payload.nextCursor,'1');
});

test('I1-24 snapshot expires lazily but never schedules a timer',async()=>{
  let reads=0;
  const reader=createMockSnapshotReader(async()=>++reads,60_000);
  const values=await Promise.all(Array.from({length:2000},()=>reader(NOW)));
  assert.ok(values.every(v=>v===1)); assert.equal(reads,1);
  assert.equal(await reader(NOW+59_000),1);
  assert.equal(await reader(NOW+60_000),2); assert.equal(reads,2);
});

test('I1-25 offline UI has six cards, fake AI2/AI3/AI7 scenarios and no network polling',()=>{
  const html=readFileSync(new URL('../ops-s1/mockPreview.html',import.meta.url),'utf8');
  assert.match(html,/data-mode="integrated"/);assert.match(html,/data-mode="integratedFault"/);
  for(const word of ['AI2','AI3','AI7','WORKFLOW_DISPATCH_UNCERTAIN','B07_BILLING_UNCERTAIN_HOLD','BACKUP_RESTORE_LOCKED'])
    assert.ok(html.includes(word),word);
  assert.doesNotMatch(html,/<script\s+src|<iframe|\bfetch\s*\(|\bsetInterval\s*\(|new\s+WebSocket/);
});

test('I1-26 standalone adapter and handler cannot auto retry, change data, charge models or probe Cloudflare',()=>{
  const adapter=readFileSync(new URL('../ops-s1/syntheticEvents.ts',import.meta.url),'utf8');
  const handler=readFileSync(new URL('../ops-s1/readOnlyHandler.ts',import.meta.url),'utf8');
  for(const raw of [adapter,handler]){
    assert.doesNotMatch(raw,/\.createBatch\s*\(|\.terminate\s*\(|\.retry\s*\(|\bAI\.run\s*\(|\bR2_BUCKET\.|\.put\s*\(|\bfetch\s*\(|\bsetInterval\s*\(/);
  }
});
