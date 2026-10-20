import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SERVICES } from '../ops-s1/healthModel.ts';
import type { Observation } from '../ops-s1/healthModel.ts';
import { buildN1aMockDashboard, buildUnknownN1aMock } from '../ops-s1/n1aS1Console.ts';
import type { MockPositiveCheck } from '../ops-s1/n1aS1Console.ts';
import type { SyntheticInput, SyntheticOrigin, SyntheticKind } from '../ops-s1/syntheticEvents.ts';
import { createN1aOfflineReadOnlyHandler } from '../ops-s1/n1aS1ReadOnly.ts';
import { createMockRateLimiter } from '../ops-s1/readOnlyHandler.ts';

const NOW=Date.parse('2026-10-20T10:35:00Z'), FRESH=new Date(NOW-1000).toISOString();
const old=new Date(NOW-3600000).toISOString();
type Service = typeof SERVICES[number];
const platform=(service:Service,extra:Partial<Observation>={}):Observation=>({
 service,access:'granted',source:'fixture',verified:true,
 observedAt:FRESH,windowMinutes:15,requests:300,serverErrors:0,...extra,
});
const allPlatforms=()=>SERVICES.map(s=>platform(s));
const incident=(origin:SyntheticOrigin,kind:SyntheticKind,verified=true,at=FRESH):SyntheticInput=>
 ({origin,kind,verified,observedAt:at});
const positives=():MockPositiveCheck[]=>([
 {domain:'app_security',observedAt:FRESH,fixtureComplete:true,fixtureConfirmsNoIncidents:true},
 {domain:'ai_billing',observedAt:FRESH,fixtureComplete:true,fixtureConfirmsNoIncidents:true},
 {domain:'backup_restore',observedAt:FRESH,fixtureComplete:true,fixtureConfirmsNoIncidents:true},
]);
const dashboard=(events:readonly SyntheticInput[]=[],cloud:readonly Observation[]=[],checks:readonly MockPositiveCheck[]=[])=>
 buildN1aMockDashboard(cloud,events,NOW,checks);
const card=(domain:'app_security'|'ai_billing'|'backup_restore',events:readonly SyntheticInput[]=[],cloud:readonly Observation[]=[],checks:readonly MockPositiveCheck[]=[])=>dashboard(events,cloud,checks).domains[domain];
const identity=()=>({subject:'synthetic-central-admin',centralSuperAdmin:true,starryIdCheckedInFixture:true,expiresAt:NOW+30000});
const req=(path='/admin/ops/n1a-s1-offline',options?:RequestInit)=>new Request('https://fake.invalid'+path,options);

test('N1A6-01 default all six platforms and all three business domains remain unknown',()=>{
 const d=buildUnknownN1aMock(NOW);
 assert.equal(d.cloud.overall,'unknown');assert.equal(d.cloud.services.length,6);
 assert.ok(d.cloud.services.every(s=>s.status==='unknown'));
 assert.deepEqual(Object.values(d.domains).map(x=>x.status),['unknown','unknown','unknown']);
 assert.equal(d.showUnverifiedBanner,true);assert.equal(d.mode,'offline_mock_only');
});
test('N1A6-02 all four panel categories support normal ONLY with complete fake evidence',()=>{
 const d=dashboard([],allPlatforms(),positives());
 assert.equal(d.cloud.overall,'normal');
 assert.ok(Object.values(d.domains).every(x=>x.status==='normal'));
 assert.equal(d.productionAuthorized,false);assert.ok(Object.values(d.domains).every(x=>x.locked));
});
test('N1A6-03 one bad backup cannot alter R2 platform status',()=>{
 const d=dashboard([incident('ai7','backup_integrity_fault')],allPlatforms());
 assert.equal(d.cloud.services.find(x=>x.service==='r2')?.status,'normal');
 assert.equal(d.domains.backup_restore.status,'fault');
 assert.equal(d.domains.app_security.status,'unknown');
 assert.equal(d.anyConfirmedFault,true);
});
test('N1A6-04 B07 uncertain bill does not alter Workers AI health',()=>{
 const d=dashboard([incident('ai3','b07_uncertain_hold')],allPlatforms());
 assert.equal(d.cloud.services.find(x=>x.service==='workers_ai')?.status,'normal');
 assert.equal(d.domains.ai_billing.status,'warning');
 assert.equal(d.newAiSpendingAllowed,false);
});
test('N1A6-05 AI2 queue disconnect does not alter Cloudflare Workflow health',()=>{
 const d=dashboard([incident('ai2','dispatch_uncertain')],allPlatforms());
 assert.equal(d.cloud.services.find(x=>x.service==='workflows')?.status,'normal');
 assert.equal(d.domains.app_security.status,'warning');assert.equal(d.retriesAllowed,false);
});
test('N1A6-06 platform fault remains fault despite App positive checks',()=>{
 const cloud=allPlatforms().map(x=>x.service==='r2'?platform('r2',{serverErrors:30}):x);
 const d=dashboard([],cloud,positives());
 assert.equal(d.cloud.services.find(x=>x.service==='r2')?.status,'fault');
 assert.equal(d.domains.backup_restore.status,'normal');
});
test('N1A6-07 confirmed App failure cannot be buried by fake normal evidence',()=>{
 const d=dashboard([incident('ai2','workflow_failed')],allPlatforms(),positives());
 assert.equal(d.domains.app_security.status,'fault');assert.equal(d.domains.app_security.conflict,true);
 assert.equal(d.cloud.services.find(x=>x.service==='workflows')?.status,'normal');
});
test('N1A6-08 confirmed backup fault dominates stale/contradictory proof',()=>{
 const d=dashboard([incident('ai7','backup_anomaly',false,old),
   incident('ai7','backup_integrity_fault')],[],positives());
 assert.equal(d.domains.backup_restore.status,'fault');assert.equal(d.domains.backup_restore.conflict,true);
});
test('N1A6-09 normal fixture and current warning conflict => unknown and locked',()=>{
 const d=dashboard([incident('ai3','b07_stop_new_spend')],[],positives());
 assert.equal(d.domains.ai_billing.status,'unknown');
 assert.equal(d.domains.ai_billing.reasonCode,'CONFLICT_REVIEW_REQUIRED');
 assert.equal(d.domains.ai_billing.locked,true);
});
test('N1A6-10 stale event marked unknown not warning',()=>{
 assert.equal(card('app_security',[incident('ai2','processing_timeout',true,old)]).status,'unknown');
});
test('N1A6-11 event verified=false alone cannot assert an incident is confirmed',()=>{
 assert.equal(card('backup_restore',[incident('ai7','backup_integrity_fault',false)]).status,'unknown');
});
test('N1A6-12 incorrect event origin cannot create fault or a green light',()=>{
 assert.equal(card('ai_billing',[incident('ai2','b07_uncertain_hold') as SyntheticInput]).status,'unknown');
});
test('N1A6-13 unknown event schema fails closed for all three business domains',()=>{
 const invalid={origin:'ai8',kind:'unapproved',verified:true,observedAt:FRESH} as unknown as SyntheticInput;
 const d=dashboard([invalid],allPlatforms(),positives());
 assert.ok(Object.values(d.domains).every(x=>x.status==='unknown'));
 assert.equal(d.cloud.overall,'normal');
});
test('N1A6-14 absent, bad and future evidence never become green',()=>{
 const expired={...positives()[0],observedAt:old};
 const future={...positives()[1],observedAt:new Date(NOW+1000).toISOString()};
 assert.equal(card('app_security',[],[],[expired]).status,'unknown');
 assert.equal(card('ai_billing',[],[],[future]).status,'unknown');
 assert.equal(card('backup_restore').status,'unknown');
});
test('N1A6-15 unavailable Cloudflare source makes platform unknown only',()=>{
 const d=buildN1aMockDashboard(allPlatforms(),[incident('ai2','workflow_failed')],NOW,[],
   {cloudSourceAvailable:false});
 assert.equal(d.cloud.overall,'unknown');assert.equal(d.domains.app_security.status,'fault');
});
test('N1A6-16 unavailable event source prevents all three business greens',()=>{
 const d=buildN1aMockDashboard(allPlatforms(),[],NOW,positives(),{eventSourceAvailable:false});
 assert.ok(Object.values(d.domains).every(x=>x.status==='unknown'));
 assert.equal(d.cloud.overall,'normal');
});
test('N1A6-17 unavailable positive source prevents normal even if no events exist',()=>{
 const d=buildN1aMockDashboard(allPlatforms(),[],NOW,positives(),{positiveSourceAvailable:false});
 assert.ok(Object.values(d.domains).every(x=>x.status==='unknown'));
});
test('N1A6-18 verified fault survives another failed source; locked always',()=>{
 const d=buildN1aMockDashboard([], [incident('ai7','backup_integrity_fault')],NOW,positives(),
   {positiveSourceAvailable:false});
 assert.equal(d.domains.backup_restore.status,'fault');assert.equal(d.restoreAllowed,false);
});
test('N1A6-19 malicious extra fields are never emitted in view or incidents',()=>{
 const malicious={...incident('ai2','dispatch_uncertain'),email:'PRIVATE@invalid',
  memberId:'MEMBER-PRIVATE',rawAudio:'AUDIO-PRIVATE',token:'TOKEN-PRIVATE',
  r2Key:'R2-PRIVATE',rawTranscript:'WORDS-PRIVATE'} as unknown as SyntheticInput;
 const raw=JSON.stringify(dashboard([malicious]));
 for(const secret of ['PRIVATE@invalid','MEMBER-PRIVATE','AUDIO-PRIVATE','TOKEN-PRIVATE','R2-PRIVATE','WORDS-PRIVATE'])
  assert.equal(raw.includes(secret),false);
});
test('N1A6-20 repeated fake incidents only return redacted codes, 25 or fewer rows',()=>{
 const events=Array.from({length:100},(_,i)=>i%2?incident('ai2','workflow_failed'):incident('ai3','b07_uncertain_hold'));
 const d=dashboard(events);
 assert.ok(d.incidents.length<=25);
 assert.ok(d.incidents.every(x=>Object.keys(x).sort().join(',')==='code,count,domain,observedAt,status'));
 assert.equal(d.incidents.find(x=>x.code==='APP_TRANSCRIPT_FAILED')?.count,50);
});
test('N1A6-21 4097 fake entries cannot yield green business statuses',()=>{
 const events=Array.from({length:4097},()=>incident('ai7','backup_anomaly'));
 const d=dashboard(events,allPlatforms(),positives());
 assert.equal(d.domains.backup_restore.status,'unknown');
 assert.equal(d.domains.app_security.status,'unknown');
 assert.equal(d.cloud.overall,'normal'); // business overflow cannot pollute platform health
});
test('N1A6-22 all action gates are disabled even in an all-green FAKE scenario',()=>{
 const d=dashboard([],allPlatforms(),positives());
 for(const k of ['actionsAllowed','retriesAllowed','newAiSpendingAllowed','restoreAllowed','productionAuthorized'] as const)
  assert.equal(d[k],false);
});
test('N1A6-23 no fake admin auth => 403 before any datasource read',async()=>{
 let reads=0;
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>null,
  readFakeCloud:async()=>{reads++;return allPlatforms();},
  readFakeEvents:async()=>{reads++;return[];},
  readFakePositiveChecks:async()=>{reads++;return positives();},
  mayRead:()=>true,
 });
 assert.equal((await handler(req())).status,403);assert.equal(reads,0);
});
test('N1A6-24 stale, revoked, app-only and fake-role admins all fail closed',async()=>{
 for(const bad of [
  {...identity(),centralSuperAdmin:false},
  {...identity(),starryIdCheckedInFixture:false},
  {...identity(),expiresAt:NOW-1},
 ]) {
  let reads=0;
  const handler=createN1aOfflineReadOnlyHandler({
   now:()=>NOW,checkFakeAdmin:async()=>bad,
   readFakeCloud:async()=>{reads++;return allPlatforms();},
   readFakeEvents:async()=>{reads++;return[];},
   readFakePositiveChecks:async()=>{reads++;return positives();},
   mayRead:()=>true,
  });
  assert.equal((await handler(req())).status,403);assert.equal(reads,0);
 }
});
test('N1A6-25 session revoked after a cached good read still returns 403',async()=>{
 let enabled=true,reads=0;
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>enabled?identity():{...identity(),centralSuperAdmin:false},
  readFakeCloud:async()=>{reads++;return allPlatforms();},
  readFakeEvents:async()=>[],
  readFakePositiveChecks:async()=>positives(),
  mayRead:()=>true,
 });
 assert.equal((await handler(req())).status,200);
 enabled=false;
 assert.equal((await handler(req())).status,403);
 assert.equal(reads,1);
});
test('N1A6-26 2000 fake ordinary users never read monitoring fixtures',async()=>{
 let reads=0;
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>({...identity(),centralSuperAdmin:false}),
  readFakeCloud:async()=>{reads++;return allPlatforms();},
  readFakeEvents:async()=>{reads++;return[];},
  readFakePositiveChecks:async()=>{reads++;return positives();},
  mayRead:()=>true,
 });
 const outputs=await Promise.all(Array.from({length:2000},()=>handler(req())));
 assert.ok(outputs.every(x=>x.status===403));assert.equal(reads,0);
});
test('N1A6-27 2000 concurrent fake admins share one local snapshot read per source',async()=>{
 let cloud=0,events=0,positive=0;
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>identity(),
  readFakeCloud:async()=>{cloud++;return allPlatforms();},
  readFakeEvents:async()=>{events++;return[incident('ai7','backup_anomaly')];},
  readFakePositiveChecks:async()=>{positive++;return[];},
  mayRead:()=>true,
 });
 const outputs=await Promise.all(Array.from({length:2000},()=>handler(req())));
 assert.ok(outputs.every(x=>x.status===200));
 assert.deepEqual([cloud,events,positive],[1,1,1]);
});
test('N1A6-28 repeated manual refresh blocked for 60 seconds in one fake isolate',async()=>{
 let now=NOW;const limiter=createMockRateLimiter(60000);
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>now,checkFakeAdmin:async()=>({...identity(),expiresAt:NOW+200000}),
  readFakeCloud:async()=>[],readFakeEvents:async()=>[],readFakePositiveChecks:async()=>[],
  mayRead:limiter,
 });
 assert.equal((await handler(req())).status,200);
 assert.equal((await handler(req())).status,429);
 now+=60000;assert.equal((await handler(req())).status,200);
});
test('N1A6-29 fake sources rejected or unavailable remain unknown, never return error secrets',async()=>{
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>identity(),
  readFakeCloud:async()=>{throw Error('SECRET-CLOUD-KEY');},
  readFakeEvents:async()=>{throw Error('SECRET-BILLING');},
  readFakePositiveChecks:async()=>{throw Error('SECRET-BACKUP');},
  mayRead:()=>true,
 });
 const res=await handler(req());assert.equal(res.status,200);
 const data=await res.json();
 assert.equal(data.cloud.overall,'unknown');assert.equal(data.domains.app_security.status,'unknown');
 const body=JSON.stringify(data);
 assert.ok(!body.includes('SECRET-'));
});
test('N1A6-30 only GET /admin/ops/n1a-s1-offline accepted, response cannot cache',async()=>{
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>identity(),
  readFakeCloud:async()=>[],readFakeEvents:async()=>[],readFakePositiveChecks:async()=>[],
  mayRead:()=>true,
 });
 assert.equal((await handler(req('/random'))).status,404);
 assert.equal((await handler(req(undefined,{method:'POST'}))).status,405);
 const res=await handler(req());assert.equal(res.status,200);
 assert.equal(res.headers.get('cache-control'),'no-store');
});
test('N1A6-31 offline HTML has four separate domains, 6 services, mobile layout and demo flags',()=>{
 const html=readFileSync(new URL('../ops-s1/n1aS1OfflinePreview.html',import.meta.url),'utf8');
 for(const text of ['Cloudflare 六服務健康','會員／逐字稿安全','AI 費用／待對帳',
    '備份還原／雙人批准','Workflows','Workers AI','data-scenario="isolated"','非正式網站',
    'max-width:750px','BACKUP_INTEGRITY_FAILED'])assert.ok(html.includes(text),text);
 assert.doesNotMatch(html,/<script\s+src=|<iframe|\bfetch\s*\(|\bsetInterval\s*\(|new\s+WebSocket/);
});
test('N1A6-32 new adapter contains no real network, paid service or database calls',()=>{
 const model=readFileSync(new URL('../ops-s1/n1aS1Console.ts',import.meta.url),'utf8');
 const adapter=readFileSync(new URL('../ops-s1/n1aS1ReadOnly.ts',import.meta.url),'utf8');
 for(const text of [model,adapter])assert.doesNotMatch(text,/\bfetch\s*\(|\bAI\.run\s*\(|\.terminate\s*\(|\.retry\s*\(|\.createBatch\s*\(|\bsetInterval\s*\(|\bR2_BUCKET\.|\bD1\.prepare\s*\(/);
});

test('N1A6-R3-03 untrusted stale positive fixtures may NEVER turn an admin GET App/AI/backup green',async()=>{
 let positiveReads=0;
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,checkFakeAdmin:async()=>identity(),
  readFakeCloud:async()=>allPlatforms(),
  readFakeEvents:async()=>[],
  readFakePositiveChecks:async()=>{positiveReads++;return positives();},
  mayRead:()=>true,
 });
 const first=await(await handler(req())).json();
 assert.equal(first.mode,'offline_mock_only');
 assert.ok(Object.values(first.domains).every((x:any)=>x.status==='unknown'));
 assert.equal(positiveReads,0,'untrusted positive source should not even be queried');
 assert.equal(first.cloud.overall,'normal','separate platform fake fixture unchanged');
});
test('N1A6-R3-04 revocation after green cached fake cloud must deny even with shared snapshot',async()=>{
 let enabled=true,cloudReads=0,eventReads=0;
 const handler=createN1aOfflineReadOnlyHandler({
  now:()=>NOW,
  checkFakeAdmin:async()=>enabled?identity():{...identity(),centralSuperAdmin:false},
  readFakeCloud:async()=>{cloudReads++;return allPlatforms();},
  readFakeEvents:async()=>{eventReads++;return[];},
  readFakePositiveChecks:async()=>{throw Error('PRIVATE-OLD-PROOF');},
  mayRead:()=>true,
 });
 const first=await handler(req());assert.equal(first.status,200);
 assert.equal((await first.json()).cloud.overall,'normal');
 enabled=false;
 const rejected=await handler(req());assert.equal(rejected.status,403);
 assert.deepEqual(await rejected.json(),{error:'access_denied'});
 assert.deepEqual([cloudReads,eventReads],[1,1]);
 assert.equal(rejected.headers.get('Cache-Control'),'no-store');
});
