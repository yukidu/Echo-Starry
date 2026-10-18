import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {resolveSpeakerBiographyStatus,speakerBiographyStatusLabel} from '../shared/speakerBiographyStatus';
import {publiclyReadable} from '../worker/aiSpeakerProfileRouter';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('a completed speaker biography MUST contain meaningful text',()=>{
  assert.equal(resolveSpeakerBiographyStatus('ready',false),'missing_summary');
  assert.equal(resolveSpeakerBiographyStatus('ready',true),'ready');
  assert.equal(resolveSpeakerBiographyStatus('waiting_sources',false),'waiting_sources');
  assert.equal(resolveSpeakerBiographyStatus('processing',false),'processing');
  assert.equal(resolveSpeakerBiographyStatus('failed',false),'failed');
  assert.equal(speakerBiographyStatusLabel('waiting_sources'),'尚無可用的公開逐字稿');
  assert.equal(speakerBiographyStatusLabel('missing_summary'),'摘要內容缺失');
});

test('speaker summary source restrictions remain strict and do not require AI to label',()=>{
  assert.equal(publiclyReadable({requiredRank:'無',stickerUnlockCost:10}),false);
  assert.equal(publiclyReadable({requiredRank:'無',isPrivateVip:1}),false);
  assert.equal(publiclyReadable({requiredRank:'15%',stickerUnlockCost:0}),false);
  assert.equal(publiclyReadable({requiredRank:'無',stickerUnlockCost:0}),true);
  const scheduler=read('worker/aiSpeakerBiographyScheduler.ts');
  const router=read('worker/aiSpeakerProfileRouter.ts');
  const view=read('src/components/SpeakerProfilePage.tsx');
  const admin=read('src/components/AiSpeakerAdmin.tsx');
  assert.match(scheduler,/if\(!sources\.length\)\{[\s\S]*?bioStatus='waiting_sources'/);
  assert.doesNotMatch(scheduler,/biography='',bioStatus='ready'/);
  assert.match(router,/bioStatus:safeStatus/);
  assert.match(router,/resolveSpeakerBiographyStatus\(p\.bioStatus,!!safeBio\)/);
  assert.match(router,/AS hasBiography/);
  assert.match(router,/namesWithReview\.has\(profile\.displayName\)\?'review_required':resolveSpeakerBiographyStatus\(profile\.bioStatus,Boolean\(hasBiography\)\)/);
  assert.match(router,/if\(!sources\.length\)\{/);
  assert.match(view,/目前沒有可用的公開逐字稿/);
  assert.match(admin,/speakerBiographyStatusLabel\(p\?\.bioStatus\|\|'pending'\)/);
});

test('legacy empty ready summaries are normalized without touching completed bios or restricted sources',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE ai_speaker_profiles(id TEXT PRIMARY KEY,displayName TEXT,biography TEXT,bioStatus TEXT,bioUpdatedAt INTEGER,sourceRevision TEXT,error TEXT,updatedAt INTEGER);
    CREATE TABLE track_speakers(speakerName TEXT,trackId TEXT);
    CREATE TABLE tracks(id TEXT PRIMARY KEY,isPrivateVip INTEGER,authorizedOnlyVisible INTEGER,stickerUnlockCost INTEGER,requiredRank TEXT);
    CREATE TABLE transcript_index(trackId TEXT,status TEXT,r2Key TEXT);
    INSERT INTO ai_speaker_profiles VALUES
      ('ma','馬文修','','ready',123,'','',111),
      ('good','已完成','這是一段有效摘要','ready',123,'rev',NULL,111),
      ('public','可公開','','ready',123,'','',111),
      ('failed','失敗','','failed',0,'',NULL,111);
    INSERT INTO tracks VALUES ('locked',0,0,10,'無'),('open',0,0,0,'無');
    INSERT INTO track_speakers VALUES ('馬文修','locked'),('可公開','open');
    INSERT INTO transcript_index VALUES ('locked','ready','transcripts/locked.json'),('open','ready','transcripts/open.json');
  `);
  const migration=read('migrations/v319_speaker_bio_waiting_sources.sql');
  db.exec(migration);
  const rows=db.prepare('SELECT id,bioStatus,biography,bioUpdatedAt FROM ai_speaker_profiles ORDER BY id').all() as unknown as Array<{id:string;bioStatus:string;biography:string;bioUpdatedAt:number}>;
  assert.equal(rows.find(x=>x.id==='ma')?.bioStatus,'waiting_sources');
  assert.equal(rows.find(x=>x.id==='ma')?.bioUpdatedAt,0);
  assert.equal(rows.find(x=>x.id==='good')?.bioStatus,'ready');
  assert.equal(rows.find(x=>x.id==='good')?.biography,'這是一段有效摘要');
  assert.equal(rows.find(x=>x.id==='public')?.bioStatus,'ready');
  assert.equal(rows.find(x=>x.id==='failed')?.bioStatus,'failed');
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS total FROM ai_speaker_profiles WHERE bioStatus='waiting_sources'").get()?.total,1);
  db.close();
});
