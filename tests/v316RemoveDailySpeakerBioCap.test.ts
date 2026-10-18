import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {speakerSummaryOptions} from '../worker/aiSpeakerProfileRouter';

const read=(file:string)=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
const ui=read('src/components/AiSpeakerAdmin.tsx');
const router=read('worker/aiSpeakerProfileRouter.ts');
const scheduler=read('worker/aiSpeakerBiographyScheduler.ts');

test('admin no longer offers or submits a daily biography count',()=>{
  assert.doesNotMatch(ui,/每日最多生成篇數|dailyLimit/);
  assert.match(ui,/摘要文字上限/);
  assert.match(ui,/摘要關鍵字與重點/);
  assert.match(ui,/彙整方向與寫作要求/);
});

test('scheduler processes one pending speaker per run without a per-day quota',()=>{
  assert.doesNotMatch(scheduler,/ai_speaker_generation_daily|dailyLimit|今日摘要額度已達上限/);
  assert.match(scheduler,/mayStartAiBackground/);
  assert.match(scheduler,/LIMIT 1/);
  assert.match(scheduler,/SET bioStatus='processing'/);
  assert.match(scheduler,/ai_speaker_profiles/);
});

test('server ignores obsolete dailyLimit sent by cached mobile clients',()=>{
  assert.doesNotMatch(router,/Number\(b\?\.dailyLimit\)|dailyLimit<|map\.get\('dailyLimit'\)/);
  assert.doesNotMatch(router,/每日生成限1/);
  assert.doesNotMatch(router,/INSERT INTO ai_speaker_summary_settings\(key,value\) VALUES \('dailyLimit'/);
  assert.match(router,/已排入摘要更新，系統將依序處理/);
});

test('settings response excludes obsolete dailyLimit even if old settings rows exist',async()=>{
  const env:any={DB:{prepare:(sql:string)=>{
    assert.match(sql,/ai_speaker_summary_settings/);
    return {all:async()=>({results:[
      {key:'keywords',value:'人物經歷'},
      {key:'direction',value:'客觀整理'},
      {key:'maxChars',value:'500'},
      {key:'dailyLimit',value:'3'}
    ]})};
  }}};
  assert.deepEqual(await speakerSummaryOptions(env),{
    keywords:'人物經歷',direction:'客觀整理',maxChars:500
  });
});
