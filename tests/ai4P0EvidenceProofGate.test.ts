import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { prepareQaEvidenceOffline, type QaProofRequest, type QaEvidenceCandidate,
  type QaFreshSnapshot, type QaProofPorts } from '../shared/qaEvidenceProofGate.ts';

const ANSWER = '報名前請確認日期，完成線上報名表單。';
const SOURCE = '【純合成資料】講者提醒：' + ANSWER + '謝謝大家。';
const NOW = 1780000000000;
const HINT = '怎麼完成報名？';
async function sha(text: string) {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return 'sha256:' + [...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('');
}

type Harness = Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE current_evidence (
    trackId TEXT NOT NULL,segmentId TEXT NOT NULL,payload TEXT NOT NULL,
    PRIMARY KEY(trackId,segmentId))`);
  const citation = {
    trackId: 'SYN-TRACK', segmentId: 'SYN-SEGMENT-1',
    sourceRevision: 7,resourceRevision: 4,transcriptVersion: 'synthetic-v7',
    permissionRevision: 12,revocationWatermark: 31,restoreEpoch: 3,
    startMs: 1000,endMs: 6500,
    sourceDigest: await sha(SOURCE),evidenceTextDigest: await sha(ANSWER),
  };
  const snapshot: QaFreshSnapshot = {
    issuer: 'starry-id', audience: 'echo.qa.answer',
    subjectId: 'SYN-USER',sessionId: 'SYN-SESSION',appId: 'echostars',
    authorized: true,revoked: false,deleted: false,expiresAtMs: NOW + 120000,
    citation,excerptText: ANSWER,sourceText: SOURCE,
  };
  const request: QaProofRequest = {
    subjectId: snapshot.subjectId,sessionId: snapshot.sessionId,
    appId: 'echostars',action: 'echo.qa.answer',question: HINT,terms: ['報名'],
  };
  const candidate: QaEvidenceCandidate = {
    score: 5,title: '純合成活動提醒',part: '【純合成活動提醒】'+ANSWER,
    excerptText: ANSWER,citation,
  };
  const store = (value: QaFreshSnapshot) => db.prepare(`INSERT INTO current_evidence(trackId,segmentId,payload)
    VALUES (?,?,?) ON CONFLICT(trackId,segmentId) DO UPDATE SET payload=excluded.payload`)
    .run(value.citation.trackId,value.citation.segmentId,JSON.stringify(value));
  store(snapshot);
  let reads=0, assessments=0;
  let support: QaProofPorts['assessSupport'] = async (question, excerpt) => ({
    status:'SUPPORTED',questionDigest:await sha(question),
    evidenceTextDigest:await sha(excerpt),quote:ANSWER,
  });
  const ports: QaProofPorts = {
    now:()=>NOW,
    readCurrent:async (_req,trackId,segmentId) => {
      reads++;
      const row=db.prepare('SELECT payload FROM current_evidence WHERE trackId=? AND segmentId=?')
        .get(trackId,segmentId) as {payload:string}|undefined;
      return row?JSON.parse(row.payload):null;
    },
    assessSupport: async (question, excerpt) => {assessments++;return support(question,excerpt);},
  };
  return {db,snapshot,request,candidate,ports,store,
    setSupport:(v:QaProofPorts['assessSupport'])=>{support=v;},
    reads:()=>reads,assessments:()=>assessments};
}
const DENY = (result: Awaited<ReturnType<typeof prepareQaEvidenceOffline>>) => {
  assert.equal(result.status,'DENY');
  assert.equal(result.prompt,'');
  assert.deepEqual(result.citations,[]);
  assert.equal(result.canSend,false);
};
const run = (h:Harness, enabled=true) => prepareQaEvidenceOffline(h.request,h.candidate,h.ports,enabled);
const edit = (h:Harness, changes:Partial<QaFreshSnapshot>, cite:Record<string,unknown>={}) => h.store({
  ...h.snapshot,...changes,citation:{...h.snapshot.citation,...cite}
} as QaFreshSnapshot);

test('OFF by default: no SQL authority reads, no support review, 0 paid SEND',async()=>{
  const h=await fixture();DENY(await prepareQaEvidenceOffline(h.request,h.candidate,h.ports));
  assert.equal(h.reads(),0);assert.equal(h.assessments(),0);h.db.close();
});
test('no source always abstains before reading source or invoking provider',async()=>{
  const h=await fixture();DENY(await prepareQaEvidenceOffline(h.request,null,h.ports,true));
  assert.equal(h.reads(),0);h.db.close();
});
test('zero lexical overlap cannot authorize a prompt',async()=>{
  const h=await fixture();const c={...h.candidate,score:0};
  DENY(await prepareQaEvidenceOffline(h.request,c,h.ports,true));assert.equal(h.reads(),0);h.db.close();
});
test('positive lexical hit is insufficient without independent support',async()=>{
  const h=await fixture();h.setSupport(async(q,t)=>({status:'INSUFFICIENT',
    questionDigest:await sha(q),evidenceTextDigest:await sha(t),quote:''}));
  DENY(await run(h));assert.equal(h.reads(),1);h.db.close();
});
test('only hash-verified current synthetic quote creates PREPARED_OFFLINE, never SEND permit',async()=>{
  const h=await fixture();const result=await run(h);
  assert.equal(result.status,'PREPARED_OFFLINE');
  assert.equal(result.canSend,false);
  if(result.status==='PREPARED_OFFLINE') {
    assert.equal(result.quote,ANSWER);
    assert.deepEqual(result.citations,[h.snapshot.citation]);
    assert.equal(result.prompt,ANSWER);
  }
  assert.equal(h.reads(),2);assert.equal(h.assessments(),1);h.db.close();
});
test('missing independent reviewer refuses to use lexical scores',async()=>{
  const h=await fixture();DENY(await prepareQaEvidenceOffline(h.request,h.candidate,
    {...h.ports,assessSupport:undefined},true));h.db.close();
});
test('reviewer unavailable/UNKNOWN fails closed',async()=>{
  const h=await fixture();h.setSupport(async()=>null);
  DENY(await run(h));assert.equal(h.reads(),1);h.db.close();
});
test('reviewer throwing fails closed without leaking candidate text',async()=>{
  const h=await fixture();h.setSupport(async()=>{throw Error('synthetic private data')});
  DENY(await run(h));h.db.close();
});
test('cannot authorize answer quote absent from actual source segment',async()=>{
  const h=await fixture();h.setSupport(async(q,t)=>({status:'SUPPORTED',
    questionDigest:await sha(q),evidenceTextDigest:await sha(t),quote:'不存在的神奇處方'}));
  DENY(await run(h));h.db.close();
});
test('reject answer reviewer bound to a different question digest',async()=>{
  const h=await fixture();h.setSupport(async(_q,t)=>({status:'SUPPORTED',
    questionDigest:await sha('其他問題'),evidenceTextDigest:await sha(t),quote:ANSWER}));
  DENY(await run(h));h.db.close();
});
test('reject reviewer bound to different segment digest',async()=>{
  const h=await fixture();h.setSupport(async(q,_t)=>({status:'SUPPORTED',
    questionDigest:await sha(q),evidenceTextDigest:await sha('其他逐字稿'),quote:ANSWER}));
  DENY(await run(h));h.db.close();
});
test('reject source tamper even if lexical ranking remains positive',async()=>{
  const h=await fixture();edit(h,{sourceText:SOURCE+'遭修改'});
  DENY(await run(h));h.db.close();
});
test('reject excerpt tamper even if original source includes it',async()=>{
  const h=await fixture();edit(h,{excerptText:'報名前請確認日期'});
  DENY(await run(h));h.db.close();
});
test('reject citation claiming another track',async()=>{
  const h=await fixture();const bad={...h.candidate,citation:{...h.candidate.citation,trackId:'OTHER-TRACK'}};
  DENY(await prepareQaEvidenceOffline(h.request,bad,h.ports,true));h.db.close();
});
test('reject wrong segment and timecodes',async()=>{
  const h=await fixture();edit(h,{}, {startMs:2000});DENY(await run(h));h.db.close();
});
test('reject stale source revision',async()=>{
  const h=await fixture();edit(h,{}, {sourceRevision:8});DENY(await run(h));h.db.close();
});
test('reject stale permission revision',async()=>{
  const h=await fixture();edit(h,{}, {permissionRevision:13});DENY(await run(h));h.db.close();
});
test('reject resource revision changes',async()=>{
  const h=await fixture();edit(h,{}, {resourceRevision:5});DENY(await run(h));h.db.close();
});
test('reject revocation watermark change',async()=>{
  const h=await fixture();edit(h,{}, {revocationWatermark:32});DENY(await run(h));h.db.close();
});
test('reject restoreEpoch rollback',async()=>{
  const h=await fixture();edit(h,{}, {restoreEpoch:2});DENY(await run(h));h.db.close();
});
test('reject deleted / revoked resources immediately',async()=>{
  for(const change of [{deleted:true},{revoked:true},{authorized:false}]){
    const h=await fixture();edit(h,change);DENY(await run(h));h.db.close();
  }
});
test('reject cross-user / cross-session mismatches',async()=>{
  for(const change of [{subjectId:'OTHER'},{sessionId:'OTHER'}]){
    const h=await fixture();edit(h,change);DENY(await run(h));h.db.close();
  }
});
test('reject wrong Starry ID issuer, application, and audience',async()=>{
  for(const change of [{issuer:'other'},{appId:'download'},{audience:'stats.private.read'}]){
    const h=await fixture();edit(h,change as any);DENY(await run(h));h.db.close();
  }
});
test('reject expired session without consulting support assessor',async()=>{
  const h=await fixture();edit(h,{expiresAtMs:NOW-1});
  DENY(await run(h));assert.equal(h.assessments(),0);h.db.close();
});
test('revocation between first read and second read leaks ZERO prompt bytes',async()=>{
  const h=await fixture();h.setSupport(async(q,t)=>{
    edit(h,{revoked:true});
    return {status:'SUPPORTED',questionDigest:await sha(q),evidenceTextDigest:await sha(t),quote:ANSWER};
  });
  DENY(await run(h));assert.equal(h.reads(),2);h.db.close();
});
test('delete between first read and second read leaks ZERO citation bytes',async()=>{
  const h=await fixture();h.setSupport(async(q,t)=>{
    edit(h,{deleted:true});
    return {status:'SUPPORTED',questionDigest:await sha(q),evidenceTextDigest:await sha(t),quote:ANSWER};
  });
  DENY(await run(h));h.db.close();
});
test('source version change between reads invalidates earlier support decision',async()=>{
  const h=await fixture();h.setSupport(async(q,t)=>{
    edit(h,{}, {sourceRevision:8});
    return {status:'SUPPORTED',questionDigest:await sha(q),evidenceTextDigest:await sha(t),quote:ANSWER};
  });
  DENY(await run(h));h.db.close();
});
test('authority I/O error fails closed and no content leaves',async()=>{
  const h=await fixture();DENY(await prepareQaEvidenceOffline(h.request,h.candidate,
    {...h.ports,readCurrent:async()=>{throw Error('failed authority read')}},true));h.db.close();
});
test('invalid metadata, expired quote, and no permission remain denied',async()=>{
  const h=await fixture();let c={...h.candidate,citation:{...h.candidate.citation,endMs:1000}};
  DENY(await prepareQaEvidenceOffline(h.request,c,h.ports,true));
  assert.equal(h.reads(),0);h.db.close();
});
test('source and excerpt digest must use full SHA-256 not unverified hashes',async()=>{
  const h=await fixture();const c={...h.candidate,citation:{...h.candidate.citation,sourceDigest:'test'}};
  DENY(await prepareQaEvidenceOffline(h.request,c,h.ports,true));h.db.close();
});
