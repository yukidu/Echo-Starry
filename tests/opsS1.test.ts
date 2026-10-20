import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildDashboard, evaluateService, sanitizeIncident, HISTORICAL_EXAMPLE, SERVICES } from '../ops-s1/healthModel.ts';
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
  assert.equal(mk(79900).status,'normal');
  assert.equal(mk(80000).quotaState,'warning'); assert.equal(mk(80000).status,'warning');
  assert.equal(mk(100000).quotaState,'stop_new'); assert.equal(mk(100000).status,'warning');
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