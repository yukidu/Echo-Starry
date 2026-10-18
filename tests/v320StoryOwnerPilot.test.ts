import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {
 parseStoryClaims,pilotReady,pilotSourceRevision,expandedApprovedOwners,
 selectQaSpeaker,completeSentence
} from '../shared/storyAttribution';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

const named='張先生&王女士';
const segs=[
  {id:'s1',start:0,end:4,text:'我先生以前在公司當業務'},
  {id:'s2',start:5,end:10,text:'我跟太太一起創業，後來我們合作'},
  {id:'s3',start:11,end:14,text:'我以前是一名老師'}
];
test('owner inference is evidence backed, not blindly assigned by first-person pronouns',()=>{
  const facts=parseStoryClaims(JSON.stringify([
    {segmentId:'s1',owner:'張先生',narrator:'unknown',kind:'retold',summary:'張先生曾擔任業務'},
    {segmentId:'s2',owner:'shared',narrator:'unknown',kind:'shared',summary:'兩人一起創業'},
    {segmentId:'s3',owner:'unknown',narrator:'unknown',kind:'unknown',summary:'有人曾擔任老師'}
  ]),segs,named);
  assert.equal(facts.length,3);
  assert.equal(facts[0].owner,'張先生');
  assert.equal(facts[0].narrator,'unknown');
  assert.deepEqual(expandedApprovedOwners(facts[1].owner,named),['張先生','王女士']);
  assert.deepEqual(expandedApprovedOwners(facts[2].owner,named),[]);
  assert.ok(facts.every(x=>!!x.evidence&&x.start>=0&&!!x.segmentId));
});
test('reject hallucinated speaker, missing evidence, contradictory ownership and broken JSON',()=>{
  const cases=[
    [{segmentId:'s1',owner:'其他講者',kind:'personal',summary:'虛構'}],
    [{segmentId:'does-not-exist',owner:'張先生',kind:'personal',summary:'虛構'}],
    [{segmentId:'s1',owner:'shared',kind:'personal',summary:'分類錯誤'}],
    [{segmentId:'s1',owner:'張先生',kind:'unknown',summary:'分類錯誤'}]
  ];
  for(const c of cases)assert.throws(()=>parseStoryClaims(JSON.stringify(c),segs,named));
  assert.throws(()=>parseStoryClaims('{bad json',segs,named));
});
test('pilot approval invalidates on transcript or speaker list change, no guess of target speaker',()=>{
  const revision=pilotSourceRevision(123,'transcripts/a.json',named);
  assert.equal(pilotReady({status:'approved',revision},123,'transcripts/a.json',named),true);
  assert.equal(pilotReady({status:'pending',revision},123,'transcripts/a.json',named),false);
  assert.equal(pilotReady({status:'approved',revision},124,'transcripts/a.json',named),false);
  assert.equal(pilotReady({status:'approved',revision},123,'transcripts/a.json','王女士&張先生'),false);
  assert.equal(selectQaSpeaker('@王女士 她的教學經歷？',named),'王女士');
  assert.equal(selectQaSpeaker('你們誰當過老師？',named),'');
  assert.equal(selectQaSpeaker('@不存在的名字 怎麼做？',named),'');
  assert.equal(completeSentence('第一句完整。第二句最後被截',5),'');
  assert.equal(completeSentence('這是完整的摘要。這是沒有結尾的摘要',15),'這是完整的摘要。');
});
test('non-destructive D1 pilot has exactly five known publicly eligible test tracks and is idempotent',()=>{
  const db=new DatabaseSync(':memory:');
  const sql=read('migrations/v320_story_attribution_pilot.sql');
  db.exec(sql);db.exec(sql);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_story_pilots').get()?.n,5);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ai_story_pilots WHERE status='pending'").get()?.n,5);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM ai_story_facts').get()?.n,0);
  assert.doesNotMatch(sql,/ALTER TABLE (?:tracks|comments|users)|DROP TABLE/i);
  db.close();
});
test('speaker biography and QA both require approved owner evidence, not raw multi-speaker text',()=>{
  const worker=read('worker/aiSpeakerStoryRouter.ts');
  const api=read('worker/aiSpeakerQaRouter.ts');
  const biography=read('worker/aiSpeakerBiographyScheduler.ts');
  const profile=read('worker/aiSpeakerProfileRouter.ts');
  const ui=read('src/components/CommentsSection.tsx');
  assert.match(worker,/isSuper\(user\)/);
  assert.match(worker,/status='approved'/);
  assert.match(worker,/parseStoryClaims/);
  assert.match(worker,/markSpeakerBiosDirty\(env,id\)/);
  assert.match(api,/pilotReady\(pilot,pilot\.updatedAt,pilot\.r2Key,pilot\.speaker\)/);
  assert.match(api,/ai_story_facts WHERE trackId=\? AND owner=\? AND sourceRevision=\?/);
  assert.match(api,/await mayUseTranscript\(env,u,row\)/);
  assert.match(api,/await charge\(env,u,q,comment\.id\)/);
  assert.match(profile,/pilotReady/);
  assert.match(profile,/storyPilotStatus/);
  assert.match(profile,/speakerNeedsStoryReview/);
  assert.match(biography,/ai_story_facts WHERE trackId=\? AND owner=\? AND sourceRevision=\?/);
  assert.match(ui,/選擇要召喚的演講者/);
});
