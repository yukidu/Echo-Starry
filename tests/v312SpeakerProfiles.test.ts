import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {speakerKey,publiclyReadable} from '../worker/aiSpeakerProfileRouter';
const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const schema=read('migrations/v312_ai_speaker_profiles.sql');
const router=read('worker/aiSpeakerProfileRouter.ts');
const cron=read('worker/aiSpeakerBiographyScheduler.ts');
const worker=read('worker/starryMainInlineLoginRouter.ts');
const transcript=read('worker/transcriptWorkflowV282.ts');
const app=read('src/App.tsx');
const comments=read('src/components/CommentsSection.tsx');
const speaker=read('src/components/SpeakerProfilePage.tsx');
const admin=read('src/components/AiSpeakerAdmin.tsx');
const audio=read('src/components/AudioWorkspacePage.tsx');
const tabs=read('src/components/AudioWorkspacePage.tsx');
const badge=read('src/components/AiBadge.tsx');
const badgeStyle=read('src/components/AiBadge.css');

test('transparent mixed-case Ai emblem is a reusable accessibility-aware component',()=>{
  assert.match(badge,/>Ai<\/span>/);
  assert.match(badgeStyle,/mask-composite: exclude/);
  assert.match(badgeStyle,/prefers-reduced-motion/);
  assert.doesNotMatch(badgeStyle,/background: #101827/);
  assert.match(badgeStyle,/starry-ai-border-flow/);
});
test('closed AI uses gradient battery reward heading with original controls intact',()=>{
  assert.match(comments,/qaMode === 'off'/);
  assert.match(comments,/分享學習心得獲得/);
  assert.match(comments,/rainbow-admin-text font-black shrink-0">電池/);
  assert.match(comments,/onViewSpeaker\?\./);
  assert.match(app,/onViewSpeaker=\{name=>/);
});
test('profiles use new indexed tables; existing member and audio tables remain unchanged',()=>{
  assert.match(schema,/CREATE TABLE IF NOT EXISTS ai_speaker_profiles/);
  assert.match(schema,/nameKey TEXT NOT NULL UNIQUE/);
  assert.match(schema,/ai_speaker_generation_daily/);
  assert.doesNotMatch(schema,/ALTER TABLE (?:users|tracks|comments)/i);
  assert.equal(speakerKey(' 張  小明 '),speakerKey('張小明'));
});
test('speaker identity, restricted recordings and public summaries remain isolated',()=>{
  assert.equal(publiclyReadable({requiredRank:'無'}),true);
  assert.equal(publiclyReadable({requiredRank:'15%'}),false);
  assert.equal(publiclyReadable({requiredRank:'無',isPrivateVip:1}),false);
  assert.equal(publiclyReadable({requiredRank:'無',authorizedOnlyVisible:1}),false);
  assert.equal(publiclyReadable({requiredRank:'無',stickerUnlockCost:5}),false);
  assert.match(router,/await mayUseTranscript\(env,u,track\)/);
  assert.match(router,/await mayUseTranscript\(env,u,item\)/);
  assert.match(router,/FROM track_speakers/);
  assert.match(router,/speakerRank/);
  assert.match(speaker,/查看原始留言對話/);
  assert.match(speaker,/speaker\.biography/);
});
test('transcript completion schedules a single background biography without daily caps',()=>{
  assert.match(transcript,/markSpeakerBiosDirty\(this\.env, trackId\)/);
  assert.match(worker,/generateNextSpeakerBiography\(env as any\)/);
  assert.doesNotMatch(cron,/ai_speaker_generation_daily|dailyLimit|const day=/);
  assert.match(cron,/mayStartAiBackground/);
  assert.match(cron,/UPDATE ai_speaker_profiles SET bioStatus='processing'/);
  assert.match(cron,/sources\.slice\(0,24\)/);
  assert.match(router,/path==='\/api\/speaker-profiles\/view'/);
  assert.match(router,/path==='\/api\/speaker-profiles\/settings'/);
  assert.match(router,/if\(!isSuper\(u\)\)return result/);
});
test('speaker page is browser navigable and has a separate super-admin audio tab',()=>{
  assert.match(app,/aria-modal="true" aria-label=\{speakerProfileName/);
  assert.match(app,/#\/speaker\//);
  assert.match(app,/<SpeakerProfilePage/);
  assert.match(tabs,/name:'AI演講者'/);
  assert.match(audio,/active==='speaker'&&<AiSpeakerAdmin\/>/);
  assert.match(admin,/value=\{cfg\.maxChars\}/);
  assert.match(admin,/摘要關鍵字與重點/);
});
