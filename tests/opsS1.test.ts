import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDashboard, evaluateService, reconcileService, sanitizeIncident, HISTORICAL_EXAMPLE, SERVICES } from '../ops-s1/healthModel.ts';
import type { Observation } from '../ops-s1/healthModel.ts';
import { createReadOnlyOpsHandler, createMockRateLimiter } from '../ops-s1/readOnlyHandler.ts';

const NOW = Date.parse('2026-10-20T07:30:00.000Z');
const good = (service: (typeof SERVICES)[number] = 'workers', extras: Partial<Observation> = {}): Observation => ({
  service, access: 'granted', observedAt: new Date(NOW - 60_000).toISOString(),
  windowMinutes: 15, verified: true, source: 'fixture', requests: 200, serverErrors: 0,
  ...extras,
});
const url = (path: string) => new Request('https://fake.invalid' + path);
const validIdentity = () => ({subject: 'fake-superadmin', currentCentralSuperAdmin: true, verifiedByCentralId: true, expiresAt: NOW + 120000});
function harness(overrides: Record<string, unknown> = {}) {
  let reads = 0; let incidentReads = 0;
  const deps = {
    now: () => NOW,
    verifyCurrentCentralSuperAdmin: async () => validIdentity(),
    readMockObservations: async () => { reads++; return SERVICES.map(s => good(s)); },
    readMockIncidents: async () => { incidentReads++; return HISTORICAL_EXAMPLE; },
    allowRead: createMockRateLimiter(),
    ...overrides,
  };
  return {handle:createReadOnlyOpsHandler(deps), readCounts:()=>({reads,incidentReads})};
}

test('OPS-01 six missing / access denied metrics are unknown, never green', () => {
  const dashboard=buildDashboard([],NOW);
  assert.equal(dashboard.overall,'unknown');
  assert.equal(evaluateService(good('workers',{source:'untrusted'}),'workers',NOW).status,'unknown');
  assert.equal(dashboard.services.length,6);
  assert.ok(dashboard.services.every(s=>s.status==='unknown' && s.actionAllowed===false));
});

test('OPS-02 six fresh credible observations can be normal', () => {
  const dashboard=buildDashboard(SERVICES.map(s=>good(s)), NOW);
  assert.equal(dashboard.overall,'normal');
  assert.equal(dashboard.partialUnknown,false);
  assert.ok(dashboard.services.every(s=>s.status==='normal'));
});

test('OPS-03 observed verified fault is retained alongside unknown signals', () => {
  const d=buildDashboard([good('workflows',{confirmedFault:true})],NOW);
  assert.equal(d.overall,'fault'); assert.equal(d.partialUnknown,true);
  assert.equal(d.services.find(x=>x.service==='d1')?.status,'unknown');
});

test('OPS-04 historical error totals never count as current metric', () => {
  const dashboard=buildDashboard([],NOW);
  assert.equal(dashboard.overall,'unknown');
  assert.equal(HISTORICAL_EXAMPLE.reduce((t,i)=>t+i.count,0),46);
  assert.ok(HISTORICAL_EXAMPLE.every(i=>i.evidence==='historical'));
});

test('OPS-05 distinct affected, unlinked counts and data masking are explicit', () => {
  const result=sanitizeIncident({...HISTORICAL_EXAMPLE[0], trackId:'private-track', name:'PRIVATE', email:'test@example.com',raw:'SECRET'} as any);
  assert.equal(result.count,37); assert.equal(result.uniqueAffected,23); assert.equal(result.unidentified,3);
  const out=JSON.stringify(result); for(const secret of ['private-track','PRIVATE','example.com','SECRET']) assert.equal(out.includes(secret),false);
});

test('OPS-06 stale lease and queued unknown have no automatic repair action', async () => {
  const x=sanitizeIncident({service:'workflows',code:'QUEUE_INSTANCE_UNCONFIRMED',evidence:'observed',count:1});
  assert.equal(x.actionAllowed,false);
  assert.equal(evaluateService(good('workflows',{warning:true}),'workflows',NOW).status,'warning');
  const source=readFileSync(new URL('../ops-s1/readOnlyHandler.ts',import.meta.url),'utf8');
  assert.doesNotMatch(source,/\.createBatch\s*\(|\.terminate\s*\(|\.retry\s*\(|\.run\(\s*['"]@cf/);
});

test('OPS-07 inconsistency event cannot mutate existing ready state', () => {
  const incident=sanitizeIncident({service:'workflows',code:'INCONSISTENT_PUBLISH',evidence:'observed',count:1});
  assert.equal(incident.actionAllowed,false);
  assert.equal(evaluateService(good('workflows',{confirmedFault:true}),'workflows',NOW).status,'fault');
});

test('OPS-08 manifest/text mismatch treated as observation, never a publish action', () => {
  const incident=sanitizeIncident({service:'r2',code:'CANDIDATE_MANIFEST_MISMATCH',evidence:'observed',count:1});
  assert.equal(incident.actionAllowed,false);
  assert.equal(incident.service,'r2');
});

test('OPS-09 separate app failures do not turn all services red', () => {
  const d=buildDashboard([good('kv',{warning:true})],NOW);
  assert.equal(d.services.find(x=>x.service==='kv')?.status,'warning');
  assert.ok(d.services.filter(x=>x.service!=='kv').every(x=>x.status==='unknown'));
});

test('OPS-10 account quota boundary 79.9, 80.0, 100.0 and absent quota', () => {
  const mk=(used:number)=>evaluateService(good('d1',{requests:undefined,serverErrors:undefined,quotaUsed:used,quotaLimit:100000,quotaVerified:true}),'d1',NOW);
  assert.equal(mk(79900).status,'unknown');
  assert.equal(mk(80000).quotaState,'warning'); assert.equal(mk(80000).status,'unknown');
  assert.equal(mk(100000).quotaState,'stop_new'); assert.equal(mk(100000).status,'unknown');
  assert.equal(evaluateService(good('d1',{quotaUsed:80000,quotaLimit:100000,quotaVerified:true}),'d1',NOW).status,'warning');
  assert.equal(evaluateService(good('d1',{requests:undefined,serverErrors:undefined,quotaUsed:0,quotaLimit:100000,quotaVerified:false}),'d1',NOW).status,'unknown');
});

test('OPS-11 repeated manual reads throttled without adding a background timer', async () => {
  const {handle,readCounts}=harness();
  assert.equal((await handle(url('/admin/ops/health-summary'))).status,200);
  assert.equal((await handle(url('/admin/ops/health-summary'))).status,429);
  assert.equal(readCounts().reads,1);
});

test('OPS-12 unverified, nonadmin, expired and fake central roles all fail closed before reads', async () => {
  for(const id of [null,{...validIdentity(),verifiedByCentralId:false},{...validIdentity(),currentCentralSuperAdmin:false},{...validIdentity(),expiresAt:NOW-1}]){
    const {handle,readCounts}=harness({verifyCurrentCentralSuperAdmin:async()=>id});
    assert.equal((await handle(url('/admin/ops/health-summary'))).status,403);
    assert.deepEqual(readCounts(),{reads:0,incidentReads:0});
  }
});

test('OPS-13 draft-only candidate state is not asserted live by default', () => {
  const d=buildDashboard([],NOW);
  const payload=JSON.stringify(d);
  assert.equal(payload.includes('transcript_runs'),false);
  assert.equal(d.mode,'mock_only');
});

test('OPS-14 missing external authority or budget never triggers model in monitoring', async () => {
  const {handle}=harness();
  const resp=await handle(url('/admin/ops/health-summary'));
  assert.equal(resp.status,200);
  const text=await resp.text();
  assert.equal(text.includes('apiKey'),false);
  assert.equal(text.includes('WhisperCalls'),false);
  const code=readFileSync(new URL('../ops-s1/readOnlyHandler.ts',import.meta.url),'utf8');
  assert.doesNotMatch(code,/(?:fetch|AI\.run|R2_BUCKET|TRANSCRIPT_WORKFLOW)\s*\(/);
});

test('OPS-15 denied and old observations are unknown despite fault fields', () => {
  assert.equal(evaluateService(good('r2',{access:'denied',confirmedFault:true}),'r2',NOW).status,'unknown');
  assert.equal(evaluateService(good('r2',{observedAt:new Date(NOW-3600000).toISOString(),confirmedFault:true}),'r2',NOW).status,'unknown');
  assert.equal(evaluateService(good('r2',{observedAt:'invalid',confirmedFault:true}),'r2',NOW).status,'unknown');
});

test('OPS-16 incidents are paginated (max 25), redacted and GET only; preview is offline', async () => {
  const {handle}=harness({allowRead:()=>true,readMockIncidents:async()=>[...HISTORICAL_EXAMPLE,...HISTORICAL_EXAMPLE]});
  assert.equal((await handle(new Request('https://fake.invalid/admin/ops/health-incidents',{method:'POST'}))).status,405);
  assert.equal((await handle(url('/admin/ops/health-incidents?limit=26'))).status,400);
  const paged=await (await handle(url('/admin/ops/health-incidents?limit=5&cursor=5'))).json();
  assert.equal(paged.items.length,5);assert.equal(paged.nextCursor,null);
  const failSource=harness({allowRead:()=>true,readMockIncidents:async()=>{throw Error('fake source not available')}});
  const unavailable=await (await failSource.handle(url('/admin/ops/health-incidents'))).json();
  assert.equal(unavailable.sourceStatus,'unknown');
  assert.ok(paged.items.every((x:any)=>x.actionAllowed===false));
  const html=readFileSync(new URL('../ops-s1/mockPreview.html',import.meta.url),'utf8');
  assert.match(html,/viewport/);assert.match(html,/data-mode="unknown"/);
  assert.doesNotMatch(html,/<script\s+src|<iframe|\bfetch\s*\(|\bsetInterval\s*\(|new\s+WebSocket/);
});
 // CentralAI2 PR #462 S76 review: two independent safety regressions.
test('OPS-R1 quota-only low usage never manufactures green service health', () => {
  const card=evaluateService(good('d1',{requests:undefined,serverErrors:undefined,quotaUsed:1,quotaLimit:100000,quotaVerified:true}),'d1',NOW);
  assert.equal(card.status,'unknown'); assert.equal(card.healthVerified,false);
  assert.equal(card.healthStatus,'unknown');assert.equal(card.quotaState,'none');assert.equal(card.quotaPercent,0.001);
});

test('OPS-R2 quota-only >=80% and >=100% retain quota warnings without declaring service healthy', () => {
  for (const [used,expected] of [[79900,'none'],[80000,'warning'],[100000,'stop_new']] as const) {
    const c=evaluateService(good('d1',{requests:undefined,serverErrors:undefined,quotaUsed:used,quotaLimit:100000,quotaVerified:true}),'d1',NOW);
    assert.equal(c.status,'unknown'); assert.equal(c.healthStatus,'unknown');assert.equal(c.quotaState,expected);
    assert.equal(c.quotaPercent,used/1000);
  }
});

test('OPS-R3 trustworthy confirmed fault outranks quota normal and quota stop', () => {
  for (const used of [1,100000]) {
    const c=evaluateService(good('d1',{requests:undefined,serverErrors:undefined,confirmedFault:true,quotaUsed:used,quotaLimit:100000,quotaVerified:true}),'d1',NOW);
    assert.equal(c.status,'fault');assert.equal(c.quotaPercent,used/1000);
  }
});

test('OPS-R4 unknown health and another confirmed fault preserve the fault', () => {
  for(const observations of [
    [good('workers',{requests:undefined,serverErrors:undefined,quotaUsed:1,quotaLimit:100,quotaVerified:true}),good('workers',{confirmedFault:true})],
    [good('workers',{confirmedFault:true}),good('workers',{requests:undefined,serverErrors:undefined,quotaUsed:1,quotaLimit:100,quotaVerified:true})],
  ]) {
    const d=buildDashboard(observations,NOW);
    const card=d.services.find(c=>c.service==='workers')!;
    assert.equal(card.status,'fault');assert.equal(card.conflict,true);
    assert.equal(card.evidence,'observed');assert.equal(d.partialUnknown,true);
  }
});

test('OPS-R5 stale first and current fault second are order-independent', () => {
  const observations=[good('r2',{observedAt:new Date(NOW-3600000).toISOString()}),good('r2',{confirmedFault:true})];
  for(const items of [observations,observations.toReversed()]) {
    const card=reconcileService(items,'r2',NOW);
    assert.equal(card.status,'fault');assert.equal(card.conflict,true);
  }
});

test('OPS-R6 old normal and newer confirmed fault cannot become green when reversed', () => {
  const observations=[good('workflows'),good('workflows',{confirmedFault:true,observedAt:new Date(NOW-10_000).toISOString()})];
  for(const items of [observations,observations.toReversed()]) {
    const card=reconcileService(items,'workflows',NOW);
    assert.equal(card.status,'fault');assert.equal(card.conflict,true);
    assert.match(card.reason,/互相矛盾/);
  }
});

test('OPS-R7 same timestamp simultaneous normal and fault chooses fault in either order', () => {
  const normal=good('workers'); const fault=good('workers',{confirmedFault:true});
  for(const items of [[normal,fault],[fault,normal]]) {
    const card=reconcileService(items,'workers',NOW);
    assert.equal(card.status,'fault'); assert.equal(card.conflict,true);
  }
});

test('OPS-R8 contradictory credible status without confirmed fault is unknown, not green', () => {
  const normal=good('kv');const warning=good('kv',{warning:true});
  for(const items of [[normal,warning],[warning,normal]]) {
    const card=reconcileService(items,'kv',NOW);
    assert.equal(card.status,'unknown');assert.equal(card.conflict,true);
  }
});

test('OPS-R9 different sources and observation windows require independent verification', () => {
  const normal=good('workers');
  const fromOtherSource=good('workers',{source:'workers_metrics'});
  const fromOtherWindow=good('workers',{windowMinutes:5});
  assert.equal(reconcileService([normal,fromOtherSource],'workers',NOW).status,'unknown');
  assert.equal(reconcileService([normal,fromOtherWindow],'workers',NOW).status,'unknown');
});

test('OPS-R10 duplicate stable valid evidence remains normal, independent of input order', () => {
  const normal=good('workers');
  const x=reconcileService([normal,{...normal}],'workers',NOW);
  assert.equal(x.status,'normal');assert.equal(x.conflict,false);
  const y=reconcileService([{...normal},normal],'workers',NOW);
  assert.deepEqual(x,y);
});

test('OPS-R11 conflicting verified quota values are unknown, not an arbitrary first', () => {
  const x=good('d1',{quotaUsed:10,quotaLimit:100,quotaVerified:true});
  const y=good('d1',{quotaUsed:95,quotaLimit:100,quotaVerified:true});
  for(const items of [[x,y],[y,x]]) {
    const card=reconcileService(items,'d1',NOW);
    assert.equal(card.status,'unknown');assert.equal(card.conflict,true);
    assert.equal(card.quotaPercent,null);assert.equal(card.quotaState,'unknown');
  }
});

test('OPS-R12 low-health-sample plus quota never manufactures a normal state', () => {
  const c=reconcileService([good('workers',{requests:3,serverErrors:0,quotaUsed:1,quotaLimit:100,quotaVerified:true})],'workers',NOW);
  assert.equal(c.status,'unknown'); assert.equal(c.quotaState,'none');
});
