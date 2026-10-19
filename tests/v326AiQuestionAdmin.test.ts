import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {DEFAULT_QA_RULES,parseQaRules,validateQaRules,buildQaSystemInstructions,checkQaAnswer,qaRepairMessages} from '../shared/qaAnswerRules';
import {generateQaWithQuality,formatQaAnswer} from '../worker/aiSpeakerQaRouter';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('three editable instruction layers preserve existing production legacy directions in the style field',()=>{
 const original='你就是演講者本人；回答要使用大量 emoji，最後反問學員';
 const old=new Map([['replyDirections',original]]);
 const restored=parseQaRules(old);
 assert.equal(restored.styleDirections,original);
 assert.match(restored.roleDirections,/第一人稱/);
 assert.equal(restored.qualityEnabled,true);
 assert.equal(restored.emojiMin,3);
 assert.equal(validateQaRules(restored).styleDirections,original);
 assert.throws(()=>validateQaRules({...restored,qualityDirections:'字'.repeat(2401)}),/2400/);
 assert.throws(()=>validateQaRules({...restored,emojiMin:9}),/品質設定無效/);
});
test('system prompt reconciles first-person simulated teacher with non-impersonation and truthful sources',()=>{
 const system=buildQaSystemInstructions(DEFAULT_QA_RULES);
 assert.match(system,/第一人稱/);
 assert.match(system,/並非真人本人/);
 assert.match(system,/不得捏造個人經歷/);
 assert.match(system,/配偶/);
 assert.match(system,/會員權限優先/);
 assert.match(system,/至少 3 個 Emoji/);
});
test('checks emoji count, positive encouragement, forbidden transcript jargon and end question',()=>{
 const correct='我剛剛分享過，持續學習很重要。我相信你能做到！🌟😊💪 你想先從哪一件事開始呢？';
 assert.deepEqual(checkQaAnswer(correct,DEFAULT_QA_RULES),[]);
 const invalid='根據逐字稿，你應該努力。';
 assert.deepEqual(checkQaAnswer(invalid,DEFAULT_QA_RULES),['first_person','backend_jargon','emoji','follow_up']);
 assert.deepEqual(checkQaAnswer(invalid,{...DEFAULT_QA_RULES,qualityEnabled:false}),[]);
 const prompt=qaRepairMessages([{role:'system',content:'s'},{role:'user',content:'q'}],invalid,['emoji','follow_up'],DEFAULT_QA_RULES);
 assert.equal(prompt.length,4);
 assert.match(prompt[3].content,/不得新增事實/);
});
test('failed first answer triggers at most one same-model repair, not a second battery reservation',async()=>{
 let calls=0;
 const initial='這場分享提到學習的重要。';
 const repaired='我剛剛說過要持續學習！我相信你一定做得到。🌱😊💪 你打算今天開始練習什麼呢？';
 const fake={AI:{run:async()=>({response:calls++?repaired:initial})}} as any;
 const ans=await generateQaWithQuality(fake,'@cf/qwen/qwen3-30b-a3b-fp8',[{role:'system',content:'instruction'},{role:'user',content:'question'}],DEFAULT_QA_RULES);
 assert.equal(calls,2);
 assert.equal(ans.repaired,true);
 assert.equal(ans.reply,repaired);
 assert.ok(formatQaAnswer(ans.reply,[]).endsWith('<本留言由ai回覆，僅供參考，非本人回覆！>'));
});
test('two answers still invalid do not publish, rather than charging user for poor quality',async()=>{
 let calls=0;
 const fake={AI:{run:async()=>{calls++;return {response:'根據逐字稿的資料，沒有更多資訊。'};}}} as any;
 const result=await generateQaWithQuality(fake,'@cf/qwen/qwen3-30b-a3b-fp8',[{role:'system',content:'s'},{role:'user',content:'q'}],DEFAULT_QA_RULES);
 assert.equal(calls,2);
 assert.equal(result.reply,'');
 assert.ok(result.qualityIssues.includes('backend_jargon'));
});
test('dedicated subtab, no duplicate settings in transcript, preview and audit restore are admin-only',()=>{
 const page=read('src/components/AudioWorkspacePage.tsx');
 const transcript=read('src/components/TranscriptQaAdmin.tsx');
 const qa=read('src/components/AiQuestionSettingsAdmin.tsx');
 const route=read('worker/aiSpeakerQaRouter.ts');
 assert.match(page,/active==='ai-question'/);
 assert.match(page,/active==='ai-question'&&<AiQuestionSettingsAdmin\/>/);
 assert.doesNotMatch(transcript,/演講者問答設定/);
 assert.match(qa,/第一層｜演講者角色與說話視角/);
 assert.match(qa,/歷史設定與還原/);
 assert.match(qa,/測試回答（不公開）/);
 assert.match(qa,/不發佈留言/);
 assert.match(route,/if\(!admin\)return json/);
 assert.match(route,/path==='\/api\/qa\/preview'/);
 assert.match(route,/path==='\/api\/qa\/settings\/restore'/);
 assert.match(route,/qa_admin_preview_daily/);
 assert.match(route,/used<10 RETURNING used/);
 assert.match(route,/qa_settings_history/);
 assert.match(route,/qaRules:parseQaRules\(map\)/);
 assert.match(route,/generateQaWithQuality/);
 assert.ok(route.indexOf('if(!reply){await fail(')<route.indexOf('if(!await charge('));
});
test('history/preview schema stores only settings & counters; no comment or permission changes',()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE qa_settings_history(id TEXT PRIMARY KEY,createdAt INTEGER NOT NULL,actorId TEXT NOT NULL,changeType TEXT NOT NULL,configJson TEXT NOT NULL)');
 db.exec('CREATE TABLE qa_admin_preview_daily(day TEXT NOT NULL,owner TEXT NOT NULL,used INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(day,owner))');
 db.prepare('INSERT INTO qa_settings_history(id,createdAt,actorId,changeType,configJson) VALUES(?,?,?,?,?)').run('a',Date.now(),'owner','save',JSON.stringify(DEFAULT_QA_RULES));
 const one=db.prepare('SELECT configJson FROM qa_settings_history WHERE id=?').get('a') as any;
 assert.equal(JSON.parse(one.configJson).emojiMin,3);
 db.close();
});
