import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {effectiveStoryFacts,isStoryPilotId,STORY_PILOT_IDS,storyRevision} from '../worker/aiSpeakerStoryAutoScheduler';
const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const people='張先生&王女士';
const draft={done:true,revision:'123:transcripts/a.json:張先生&王女士',items:[
 {id:'f1',segmentId:'s1',owner:'張先生',kind:'personal',narrator:'unknown',summary:'張先生經營餐館',evidence:'張先生原先經營餐館',start:10},
 {id:'f2',segmentId:'s2',owner:'shared',kind:'shared',narrator:'unknown',summary:'夫妻共同創業',evidence:'夫妻共同創業',start:25},
 {id:'f3',segmentId:'s3',owner:'unknown',kind:'unknown',narrator:'unknown',summary:'不明人士擔任教師',evidence:'我以前是老師',start:50}
]};
test('only five existing approved pilot IDs can be scheduled or edited',()=>{
 assert.equal(STORY_PILOT_IDS.length,5);
 assert.equal(new Set(STORY_PILOT_IDS).size,5);
 assert.equal(STORY_PILOT_IDS.every(isStoryPilotId),true);
 assert.equal(isStoryPilotId('different-multi-speaker-track'),false);
});
test('automatic release indexes verified owners, expands shared stories and excludes unknown',()=>{
 const facts=effectiveStoryFacts(draft,new Map(),people);
 assert.equal(facts.length,3);
 assert.equal(facts.filter(f=>f.segmentId==='s2').length,2);
 assert.deepEqual(facts.filter(f=>f.segmentId==='s2').map(f=>f.owner),['張先生','王女士']);
 assert.equal(facts.some(f=>f.segmentId==='s3'),false);
 assert.equal(facts.find(f=>f.segmentId==='s1')?.owner,'張先生');
});
test('human override takes precedence over original AI, can exclude or recover uncertain story',()=>{
 const override=new Map([['s1','王女士'],['s2','unknown'],['s3','張先生']]);
 const facts=effectiveStoryFacts(draft,override,people);
 assert.equal(facts.length,2);
 assert.deepEqual(facts.map(f=>f.owner),['王女士','張先生']);
 assert.equal(facts.some(f=>f.segmentId==='s2'),false);
 assert.equal(facts.find(f=>f.segmentId==='s3')?.kind,'personal');
});
test('revision must match R2 transcript and speaker list',()=>{
 assert.equal(storyRevision({transcriptUpdatedAt:123,transcriptR2Key:'transcripts/a.json',speaker:people}),draft.revision);
 assert.notEqual(storyRevision({transcriptUpdatedAt:124,transcriptR2Key:'transcripts/a.json',speaker:people}),draft.revision);
});
test('manual overrides and edit history are persisted separately and rerunning migration cannot seed extra pilots',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec(read('migrations/v320_story_attribution_pilot.sql'));
 db.exec(read('migrations/v322_story_auto_run.sql'));
 const first=db.prepare('SELECT COUNT(*) AS n FROM ai_story_pilots').get() as any;
 assert.equal(first.n,5);
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM ai_story_pilots WHERE autoRun=1').get() as any).n,0);
 db.prepare('INSERT INTO ai_story_manual_overrides(trackId,segmentId,owner,editedBy,editedAt) VALUES (?,?,?,?,?)')
   .run(STORY_PILOT_IDS[0],'s3','張先生','admin',10);
 db.prepare('INSERT INTO ai_story_owner_edits(id,trackId,segmentId,factId,oldOwner,newOwner,editedBy,editedAt) VALUES (?,?,?,?,?,?,?,?)')
   .run('edit-1',STORY_PILOT_IDS[0],'s3','f3','unknown','張先生','admin',10);
 assert.equal((db.prepare('SELECT owner FROM ai_story_manual_overrides WHERE segmentId=?').get('s3') as any).owner,'張先生');
 assert.equal((db.prepare('SELECT COUNT(*) AS n FROM ai_story_owner_edits').get() as any).n,1);
 db.close();
});
test('background processing can continue after page closed while preserving original transcript and permissions',()=>{
 const entry=read('worker/starryMainInlineLoginRouter.ts');
 const timer=read('wrangler.toml');
 const scheduler=read('worker/aiSpeakerStoryAutoScheduler.ts');
 const router=read('worker/aiSpeakerStoryRouter.ts');
 const admin=read('src/components/AiSpeakerAdmin.tsx');
 const stories=read('src/components/AiSpeakerStoryAdmin.tsx');
 const qa=read('worker/aiSpeakerQaRouter.ts');
 const bio=read('worker/aiSpeakerBiographyScheduler.ts');
 assert.match(entry,/ctx\.waitUntil\(runNextStoryAttribution/);
 assert.match(entry,/controller\.cron==='\*\/5 \* \* \* \*'/);
 assert.match(timer,/\*\/5 \* \* \* \*/);
 assert.match(timer,/\*\/15 \* \* \* \*/);
 assert.match(scheduler,/STORY_PILOT_IDS/);
 assert.match(scheduler,/mayStartAiBackground/);
 assert.match(scheduler,/status='processing'/);
 assert.match(scheduler,/await inferStoryBatch/);
 assert.match(scheduler,/await storyPut\(env,storyDraftKey\(id\),draft\)/);
 assert.match(scheduler,/status='approved'/);
 assert.match(scheduler,/ai_story_owner_edits/);
 assert.match(scheduler,/autoRun=0/);
 assert.doesNotMatch(scheduler,/\.put\(current\.transcriptR2Key/);
 assert.match(router,/\/api\/speaker-stories\/start/);
 assert.match(router,/\/api\/speaker-stories\/pause/);
 assert.match(router,/\/api\/speaker-stories\/edit/);
 assert.match(admin,/role="tablist"/);
 assert.match(admin,/>個人摘要<\/button>/);
 assert.match(admin,/>多人演講<\/button>/);
 assert.match(stories,/開始整場 AI 分析/);
 assert.match(stories,/儲存人物歸屬修正/);
 assert.match(qa,/await mayUseTranscript\(env,u,row\)/);
 assert.match(qa,/await charge\(env,u,q,comment\.id\)/);
 assert.match(bio,/ai_story_facts/);
});
