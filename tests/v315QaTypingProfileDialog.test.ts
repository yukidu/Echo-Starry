import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {quota} from '../worker/aiSpeakerQaRouter';
import {formatSpeakerRecordingDate} from '../src/utils/speakerRecordingDate';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const profile=read('src/components/SpeakerProfilePage.tsx');
const comments=read('src/components/CommentsSection.tsx');
const app=read('src/App.tsx');
const sw=read('public/sw.js');

test('super administrators are unlimited without negative counters',async()=>{
  const request=new Request('https://echo.starry.phd/api/qa/status');
  const env:any={DB:{prepare:()=>({bind:()=>({first:async()=>null})})}};
  const admin={id:'super-id',email:'super@example.com',role:'超級管理員'};
  const cfg={enabled:true,policies:Array.from({length:5},()=>({daily:1,free:0,cost:10})),globalDaily:1};
  const q=await quota(request,env,admin,cfg);
  assert.equal(q.unlimited,true);
  assert.equal(q.reason,'');
  assert.equal(q.freeLeft,0);
  assert.equal(q.left,0);
  assert.equal(q.cost,0);
  assert.equal(q.costUnits,0);
  assert.match(comments,/qaStatus\.unlimited \? '超級管理員：網站內召喚不限次數、不扣電池'/);
});
test('typing indicator cannot squeeze text into vertical glyphs for long speaker names',()=>{
  assert.match(comments,/rainbow-admin-text min-w-0 flex-1 font-bold break-all whitespace-normal/);
  assert.match(comments,/className="mt-2 whitespace-nowrap text-sm leading-6"/);
  assert.match(comments,/正在輸入訊息中/);
  assert.match(comments,/正在準備回答/);
});
test('speaker recordings display normal Taiwan dates and gracefully handle bad values',()=>{
  assert.equal(formatSpeakerRecordingDate('2026-10-02T09:43:55.277Z'),'2026/10/02 17:43');
  assert.equal(formatSpeakerRecordingDate('2026-10-11'),'2026/10/11');
  assert.equal(formatSpeakerRecordingDate('invalid'),'日期未設定');
  assert.equal(formatSpeakerRecordingDate(''),'日期未設定');
  assert.match(profile,/formatSpeakerRecordingDate\(t\.uploadDate\)/);
});
test('speaker playback uses an in-app confirmation instead of a browser alert',()=>{
  assert.doesNotMatch(profile,/window\.confirm/);
  assert.match(profile,/role="alertdialog"/);
  assert.match(profile,/是否播放這場錄音/);
  assert.match(profile,/setConfirmTrack\(t\)/);
  assert.match(profile,/onPlayTrack\|\|onOpenTrack/);
  assert.match(profile,/確認播放/);
  assert.match(profile,/event\.key==='Escape'/);
  assert.match(app,/handlePlayTrack\(target,'bubble'\)/);
  assert.match(app,/setPlayerMode\('bubble'\)/);
});
test('mobile service worker refreshes outdated screens with the corrected quota view',()=>{
  assert.match(sw,/const CACHE_NAME = 'echostars-shell-v\d+'/);
  assert.match(sw,/upgradingExistingClient/);
});
