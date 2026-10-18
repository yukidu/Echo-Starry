import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quota,reserve,isSuper,formatQaAnswer} from '../worker/aiSpeakerQaRouter';

const get=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const router=get('worker/aiSpeakerQaRouter.ts');
const admin=get('src/components/TranscriptQaAdmin.tsx');
const comments=get('src/components/CommentsSection.tsx');
const profile=get('src/components/SpeakerProfilePage.tsx');
const app=get('src/App.tsx');
const badge=get('src/components/AiBadge.css');
const defaultPolicies=Array.from({length:5},()=>({daily:1,free:1,cost:100}));

test('super admin bypasses both daily and site-wide caps without even reading counters',async()=>{
  let reads=0;
  const env:any={DB:{prepare(){reads++;throw Error('counter touched for super admin');}}};
  const user={id:'admin-1',email:'yukidu@gmail.com',role:'超級管理員'};
  const q=await quota(new Request('https://echo.starry.phd/api/qa/status'),env,user,{
    enabled:true,policies:defaultPolicies,globalDaily:1
  });
  assert.ok(isSuper(user));
  assert.equal(q.unlimited,true);
  assert.equal(q.reason,'');
  assert.equal(q.costUnits,0);
  assert.equal(q.left,0);
  assert.equal(reads,0);
  let recorded=0;
  const claimEnv:any={DB:{prepare(sql:string){
    assert.match(sql,/qa_claims/);
    return {bind:()=>({run:async()=>{recorded++;return {meta:{changes:1}};}})};
  }}};
  assert.equal(await reserve(claimEnv,q,{globalDaily:1},'c-test','track','current'),true);
  assert.equal(recorded,1);
});
test('regular members still keep their per-tier and site-wide limits',()=>{
  assert.match(router,/global\?\.used\|\|0\)>=cfg\.globalDaily/);
  assert.match(router,/used<\?/);
  assert.match(router,/if\(q\.unlimited\)/);
  assert.match(router,/if\(q\.unlimited\|\|!q\.costUnits\)return true/);
  assert.match(router,/globalUsed:Number\(used\?\.used\|\|0\)/);
  assert.match(admin,/全站今日已使用/);
  assert.match(comments,/超級管理員：網站內召喚不限次數、不扣電池/);
});
test('AI answer is readable and ends with trusted recording source titles only',()=>{
  const out=formatQaAnswer('演講最重要的是互相扶持。\n參考資料：12:35 第4段\n（12:35）',['堅持的力量','人生的轉折']);
  assert.match(out,/演講最重要的是互相扶持/);
  assert.match(out,/參考資料：《堅持的力量》、《人生的轉折》/);
  assert.doesNotMatch(out,/12:35/);
  assert.doesNotMatch(out,/第4段/);
  assert.match(router,/replyDirections/);
  assert.match(admin,/AI 回答格式自訂指令/);
  assert.match(router,/max_tokens:1400/);
});
test('speaker recordings require confirmation and play through existing bubble, preserving view',()=>{
  assert.match(profile,/role="alertdialog"/);
  assert.match(profile,/onPlayTrack\|\|onOpenTrack/);
  assert.match(app,/onPlayTrack=\{id=>/);
  assert.match(app,/handlePlayTrack\(target,'bubble'\)/);
  assert.match(app,/if\(!isPlaying\)void handleTogglePlay\(\)/);
});
test('reusable rainbow Ai icon aligns with normal line height without shrinking its lettering',()=>{
  assert.match(badge,/width: 0\.9em/);
  assert.match(badge,/height: 0\.9em/);
  assert.match(badge,/font-size: 1em/);
  assert.match(badge,/padding: 1px/);
  assert.match(badge,/mask-composite: exclude/);
});
