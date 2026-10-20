import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {
 deriveI1AudioIdentity,attemptI1FakeProvider,
 type I1FakeAttempt,type I1FakeClaimPort,type I1FakeProvider
} from './support/s3Gate2B07I1FakeAdapter';

const now=Date.now();
const run=()=>({
  runId:'fake-safe-run-0001',trackId:'fake-track-01',generation:1,
  state:'processing' as const,intent:'relisten' as const,
  sourceAudioEtag:'a'.repeat(64),approvalGrantDigest:'b'.repeat(64),
  leaseUntil:now+600_000,sourceMatches:true,
  centralPermissionVerified:true,restoreEpochVerified:true,approvalVerified:true
});
const sample=(key='request-one'):I1FakeAttempt=>({
  run:run(),segmentIndex:0,modelId:'@cf/fake/whisper',requestKey:key
});
function fakePorts(timeout=false){
 const keys=new Set<string>(),unknown=new Set<string>();
 let sends=0;
 const claimPort:I1FakeClaimPort={
  async insertOnce({identityDigest}){
   if(keys.has(identityDigest))return 'duplicate';
   keys.add(identityDigest);return 'inserted';
  },
  async markUnknown(key){unknown.add(key)}
 };
 const provider:I1FakeProvider={async send(){
   sends++;return timeout?'timeout':'confirmed';
 }};
 return {claimPort,provider,keys,unknown,get sends(){return sends}};
}
test('I1-01 source approval and segment identity ignores requestKey',()=>{
 const a=deriveI1AudioIdentity(sample('one-key'),now);
 const b=deriveI1AudioIdentity(sample('totally-different'),now);
 assert.equal(a.allowed,true);assert.deepEqual(a,b);
});
test('I1-02 changing runId and generation without new signed approval does not reset one-use identity',()=>{
 const a=deriveI1AudioIdentity(sample(),now);
 const b=sample('second-key');
 b.run.runId='other-run-id';b.run.generation=99;
 assert.deepEqual(deriveI1AudioIdentity(b,now),a);
});
test('I1-03 genuinely new trusted source/grant and distinct segment are separate identities',()=>{
 const a=deriveI1AudioIdentity(sample(),now);
 const b=sample();b.run.approvalGrantDigest='c'.repeat(64);
 const c=sample();c.run.sourceAudioEtag='d'.repeat(64);
 const d=sample();d.segmentIndex=1;
 for(const changed of [b,c,d])assert.notDeepEqual(deriveI1AudioIdentity(changed,now),a);
});
test('I1-04 FakeProvider receives exactly 1 of 80 parallel rekeyed requests',async()=>{
 const f=fakePorts();
 const results=await Promise.all(Array.from({length:80},(_,i)=>attemptI1FakeProvider(
  sample('completely-different-key-'+i),now,f.claimPort,f.provider)));
 assert.equal(results.filter(x=>x.state==='settled').length,1);
 assert.equal(results.filter(x=>x.state==='denied').length,79);
 assert.equal(f.sends,1);assert.equal(f.keys.size,1);
});
test('I1-05 ambiguous provider timeout freezes identity, unknown never triggers new send',async()=>{
 const f=fakePorts(true);
 const first=await attemptI1FakeProvider(sample(),now,f.claimPort,f.provider);
 assert.equal(first.state,'uncertain');assert.equal(f.unknown.size,1);
 const replay=await attemptI1FakeProvider(sample('rekey'),now,f.claimPort,f.provider);
 assert.equal(replay.state,'denied');assert.equal(f.sends,1);
});
test('I1-06 central claim outage is fail-closed and FakeProvider sees 0 requests',async()=>{
 const f=fakePorts();
 f.claimPort.insertOnce=async()=>{throw Error('fake central D1 503')};
 const result=await attemptI1FakeProvider(sample(),now,f.claimPort,f.provider);
 assert.equal(result.state,'denied');assert.equal(f.sends,0);
});
test('I1-07 missing trusted permission, restore epoch, source, stale lease and queued state fail closed',async()=>{
 const f=fakePorts();
 for(const altered of [
  {centralPermissionVerified:false},{restoreEpochVerified:false},
  {sourceMatches:false},{approvalVerified:false},
  {leaseUntil:now-1},{state:'queued' as const}
 ]){
  const input=sample();Object.assign(input.run,altered);
  const result=await attemptI1FakeProvider(input,now,f.claimPort,f.provider);
  assert.equal(result.state,'denied');
 }
 assert.equal(f.sends,0);
});
test('I1-08 2000 logical mock members contend for a single fake SQLite daily cap',()=>{
 const child=spawnSync('python3',['tests/b07-i1-offline-integration.py'],{
  encoding:'utf8',timeout:180_000,maxBuffer:1024*1024,
  env:{PATH:process.env.PATH||'/usr/bin:/bin',PYTHONDONTWRITEBYTECODE:'1'}
 });
 assert.equal(child.status,0,'Offline I1 SQLite failed:\n'+String(child.stderr).slice(0,1200));
 const row=child.stdout.split('\n').find(x=>x.startsWith('B07_I1_OFFLINE_OK '));
 assert.ok(row,'missing fake SQLite proof: '+child.stdout.slice(0,500));
 const report=JSON.parse(row.slice('B07_I1_OFFLINE_OK '.length));
 assert.ok(report.cases>=19);
 assert.equal(report.fakeIdentities,2000);
 assert.equal(report.submittedFakeRequests,2000);
 assert.equal(report.accepted,40);
 assert.equal(report.denied,1960);
 assert.ok(report.observedMaxActive<=24);
 assert.equal(report.rekeyProviderTickets,1);
 assert.equal(report.realProviderCalls,0);
 assert.equal(report.remoteNetworkRequests,0);
 assert.equal(report.productionMigrations,0);
 assert.equal(report.accountFreeBalanceFromRealProvider,'UNKNOWN');
 assert.equal(report.cloudflare2000ConcurrentUsersVerified,false);
 console.log(row);
});
test('I1-09 independent PR #461 Worker and Whisper block remain untouched',()=>{
 const fake=readFileSync('tests/support/s3Gate2B07I1FakeAdapter.ts','utf8');
 assert.doesNotMatch(fake,/env\.AI\.run\(|\bfetch\(['"]https?:\/\//);
 const code=readFileSync('worker/starryAiB07S3Safety.ts','utf8');
 assert.doesNotMatch(code,/WhisperBlocked\s*=|AI\.run\(/);
});
