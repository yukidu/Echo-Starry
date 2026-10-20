/** S2367A AI4 independent Q2 acceptance test — never changes Q1 algorithm.
 * Fixture created + SHA256 frozen before fetching Q1 search.ts.
 * A passing test runner does NOT imply the blind-quality gate passed; see logs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {filterAuthorizedEvidence,makeParagraphs,searchQ1WithAuthority} from '../c09q1/search.ts';
import type {SearchDoc,Candidate,LiveAuthority} from '../c09q1/search.ts';

type GoldQuestion={id:string;type:string;question:string;gold:string[]};
type GoldDoc={id:string;speaker:string;text:string};
const frozen=readFileSync(new URL('./fixtures/c09q2BlindFrozenV1.json',import.meta.url));
const frozenHash=createHash('sha256').update(frozen).digest('hex');
const EXPECTED_SHA='389b5ef7b4998a0ac40a3f74c3b25bcb0e45d315440492f56e84e14061f48d69';
const fixture=JSON.parse(frozen.toString('utf8')) as {documents:GoldDoc[];questions:GoldQuestion[]};
const docs:SearchDoc[]=fixture.documents.map((d,i)=>({
  trackId:d.id,version:'v1',sourceKey:'offline/fake-'+d.id+'.json',sourceUpdatedAt:1000+i,
  permissionsRevision:'r1',epoch:'fake-epoch-5',
  segments:[{id:'line1',start:0,end:12,text:d.text}]
}));
const candidates:Candidate[]=docs.map(d=>({paragraph:makeParagraphs(d)[0],state:{
  trackId:d.trackId,version:d.version,generation:'g1',sourceKey:d.sourceKey,
  sourceUpdatedAt:d.sourceUpdatedAt,permissionsRevision:d.permissionsRevision,
  epoch:d.epoch,invalidated:0
}}));
const sources=Object.fromEntries(docs.map(d=>[d.trackId,{version:d.version,sourceKey:d.sourceKey,sourceUpdatedAt:d.sourceUpdatedAt}]));
const proof={epoch:'fake-epoch-5',allowedTrackIds:docs.map(d=>d.trackId),
  sourceVersions:Object.fromEntries(docs.map(d=>[d.trackId,'v1'])),
  permissionsRevisions:Object.fromEntries(docs.map(d=>[d.trackId,'r1']))};

test('BLIND-00: source-unseen question set is fixed and verifiable',()=>{
  assert.equal(frozenHash,EXPECTED_SHA,'blind corpus must not change after Q1 inspection');
  assert.equal(docs.length,35);
  assert.equal(fixture.questions.length,48);
  assert.equal(new Set(fixture.questions.map(x=>x.id)).size,48);
  assert.equal(new Set(docs.map(x=>x.trackId)).size,35);
  const legal=new Set(docs.map(d=>d.trackId));
  for(const q of fixture.questions)for(const id of q.gold)assert.ok(legal.has(id));
});

test('BLIND-01: report ALL unseen Top1/Top5, miss, unrelated evidence, reject (not trained-to-fit)',()=>{
  const typeMetrics:Record<string,{total:number;positive:number;top1:number;top5:number;wrongWhenNoAnswer:number}>={};
  let positive=0,top1=0,top5=0,wrongWhenNoAnswer=0,noanswer=0,noanswerRefused=0,unrelatedTop1=0;
  const failures:unknown[]=[];
  for(const q of fixture.questions){
    const hits=filterAuthorizedEvidence({query:q.question,candidates,authorityResponse:proof,currentSources:sources});
    const gold=q.gold[0]||null;
    const m=typeMetrics[q.type]??={total:0,positive:0,top1:0,top5:0,wrongWhenNoAnswer:0};m.total++;
    if(gold){
      positive++;m.positive++;
      if(hits[0]?.trackId===gold){top1++;m.top1++;}
      else if(hits.length)unrelatedTop1++;
      if(hits.some(x=>x.trackId===gold)){top5++;m.top5++;}
      else failures.push({id:q.id,type:q.type,question:q.question,gold,predicted:hits.map(x=>x.trackId)});
    }else{
      noanswer++;
      if(hits.length){wrongWhenNoAnswer++;m.wrongWhenNoAnswer++;failures.push({id:q.id,type:q.type,gold:[],predicted:hits.map(x=>x.trackId)});}
      else noanswerRefused++;
    }
  }
  const report={fixtureSHA256:frozenHash,positive,top1,top5,blindTop1Percent:Number((100*top1/positive).toFixed(1)),
    blindTop5Percent:Number((100*top5/positive).toFixed(1)),blindQualityGateTop5AtLeast90:top5/positive>=0.9,
    unrelatedTop1,noanswer,noanswerRefused,wrongWhenNoAnswer,typeMetrics,failures};
  console.log('AI4_Q2_BLIND_SCORECARD='+JSON.stringify(report));
  assert.equal(positive,40);assert.equal(noanswer,8);
  assert.equal(Object.values(typeMetrics).reduce((a,b)=>a+b.total,0),48);
  // Quality thresholds are explicitly reported as PASS/FAIL without editing code.
  // This test merely certifies the scorecard calculation, not Q1 readiness.
});

test('SAFE-01: current revocation, user deletion, stale source and changed permissions deny evidence',()=>{
  const base=candidates[2],target=base.paragraph.trackId;
  const term='圖書館的借書期限是二十一天';
  const run=(authorityResponse:any,currentSources=sources,candidate=base)=>filterAuthorizedEvidence({
    query:term,candidates:[candidate],authorityResponse,currentSources});
  assert.equal(run(proof)[0]?.trackId,target);
  assert.equal(run({...proof,allowedTrackIds:proof.allowedTrackIds.filter(x=>x!==target)}).length,0,'revoked membership');
  assert.equal(run({...proof,allowedTrackIds:[]}).length,0,'deleted member/empty authority');
  assert.equal(run(null).length,0,'no reliable current authority');
  assert.equal(run({...proof,epoch:'fake-epoch-6'}).length,0,'restore epoch change');
  assert.equal(run({...proof,permissionsRevisions:{...proof.permissionsRevisions,[target]:'r2'}}).length,0,'rights change');
  assert.equal(run({...proof,sourceVersions:{...proof.sourceVersions,[target]:'v2'}}).length,0,'audio version change');
  assert.equal(run(proof,{...sources,[target]:{...sources[target],sourceKey:'different-version'}}).length,0,'R2 key change');
  assert.equal(run(proof,{...sources,[target]:{...sources[target],sourceUpdatedAt:2222}}).length,0,'source timestamp change');
  assert.equal(run(proof,Object.fromEntries(Object.entries(sources).filter(([id])=>id!==target))).length,0,'deleted source');
  assert.equal(run(proof,sources,{...base,state:{...base.state,invalidated:1}}).length,0,'approved correction / deletion invalidation');
});

test('SAFE-02: post-query ACL revocation, deletion, correction watermark or timeout rejects all',async()=>{
  const d=docs[2];let checkCalls=0,queryCalls=0;
  const fakeSqlRow={trackId:d.trackId,version:'v1',ordinal:0,fromSegment:'line1',toSegment:'line1',
    startMs:0,endMs:12000,content:d.segments[0].text,generation:'g1',sourceVersion:'v1',
    sourceKey:d.sourceKey,sourceUpdatedAt:d.sourceUpdatedAt,permissionsRevision:'r1',epoch:'fake-epoch-5',invalidated:0};
  const db={prepare:()=>({bind:()=>({all:async()=>{queryCalls++;return {results:[fakeSqlRow]};}})})};
  const revoking:LiveAuthority={check:async()=>{
    checkCalls++;return checkCalls===1?{...proof,allowedTrackIds:[d.trackId]}:{...proof,allowedTrackIds:[]};
  }};
  assert.deepEqual(await searchQ1WithAuthority(db,'圖書館借書期限',[d.trackId],revoking,sources),[]);
  assert.equal(checkCalls,2);assert.equal(queryCalls,1);
  checkCalls=0;
  const disappearing:LiveAuthority={check:async()=>checkCalls++===0?{...proof,allowedTrackIds:[d.trackId]}:null};
  assert.deepEqual(await searchQ1WithAuthority(db,'圖書館借書期限',[d.trackId],disappearing,sources),[]);
  checkCalls=0;
  const updated:LiveAuthority={check:async()=>checkCalls++===0?{...proof,allowedTrackIds:[d.trackId]}:
    {...proof,allowedTrackIds:[d.trackId],sourceVersions:{...proof.sourceVersions,[d.trackId]:'v2'}}};
  assert.deepEqual(await searchQ1WithAuthority(db,'圖書館借書期限',[d.trackId],updated,sources),[]);
  const unavailable:LiveAuthority={check:async()=>{throw Error('fake authority offline');}};
  const queriesBefore=queryCalls;
  assert.deepEqual(await searchQ1WithAuthority(db,'圖書館借書期限',[d.trackId],unavailable,sources),[]);
  assert.equal(queryCalls,queriesBefore,'unreliable authority never makes SQL request');
});

test('SAFE-03: no actual cloud binding and known 70-track cap',async()=>{
  let queryCalls=0;
  const db={prepare:()=>{queryCalls++;throw Error('query must not run');}};
  const auth:LiveAuthority={check:async()=>proof};
  assert.deepEqual(await searchQ1WithAuthority(db,'借書期限',Array.from({length:71},(_,i)=>'many'+i),auth,sources),[]);
  assert.equal(queryCalls,0);
});

test('COST-01: independent long 2,000-track SQLite indexing, cost and backup rehearsal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'ai4q2-scale-'));
  try{
    const dest=join(dir,'results.json');
    const child=spawnSync('python3',[new URL('./c09q2SqliteScale.py',import.meta.url).pathname,dest],
      {encoding:'utf8',timeout:170000,maxBuffer:2_000_000});
    assert.equal(child.status,0,(child.stdout||'')+'\n'+(child.stderr||''));
    const result=JSON.parse(readFileSync(dest,'utf8'));
    assert.deepEqual(result.measures.map((m:any)=>m.tracks),[30,112,500,2000]);
    for(const m of result.measures){
      assert.equal(m.index_used,true);
      assert.equal(m.restore_postings_ok,true);
      assert.equal(m.revoked_blocks,true);
      assert.equal(m.stale_version_blocks,true);
      assert.equal(m.deleted_blocks,true);
      assert.equal(m.real_ai_calls,0);
      assert.equal(m.real_cloudflare_calls,0);
    }
    console.log('AI4_Q2_SQLITE_COST='+JSON.stringify(result));
    // This script independently approximates index terms and generates unrelated
    // synthetic scale data; its counts are NOT production D1 rows read/written.
  }finally{rmSync(dir,{recursive:true,force:true});}
});
