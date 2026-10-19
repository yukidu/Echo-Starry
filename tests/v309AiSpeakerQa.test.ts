import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tier } from '../worker/aiSpeakerQaRouter';

const router = readFileSync(new URL('../worker/aiSpeakerQaRouter.ts', import.meta.url),'utf8');
const main = readFileSync(new URL('../worker/starryMainInlineLoginRouter.ts',import.meta.url),'utf8');
const comments = readFileSync(new URL('../src/components/CommentsSection.tsx',import.meta.url),'utf8');
const app = readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const admin = readFileSync(new URL('../src/components/AiQuestionSettingsAdmin.tsx',import.meta.url),'utf8');
const page = readFileSync(new URL('../src/components/AudioWorkspacePage.tsx',import.meta.url),'utf8');

test('the five member tiers do not accidentally treat visitors as registered members',()=>{
  assert.equal(tier(null),0);
  assert.equal(tier({rank:'21%',rankApproved:0}),1);
  assert.equal(tier({rank:'12%',rankApproved:1}),1);
  assert.equal(tier({rank:'15%',rankApproved:1}),2);
  assert.equal(tier({rank:'15%銅章',rankApproved:1}),2);
  assert.equal(tier({rank:'金章',rankApproved:1}),2);
  assert.equal(tier({rank:'創辦人白金',rankApproved:1}),3);
  assert.equal(tier({rank:'翡翠',rankApproved:1}),3);
  assert.equal(tier({rank:'創辦人鑽石',rankApproved:1}),4);
});
test('guest gets free quota; model is private, disabled initially; signed model saves validated',()=>{
  assert.match(router,/daily:3,free:3,cost:0/);
  assert.match(router,/enabled:map\.get\('enabled'\)==='true'/);
  assert.match(router,/globalDaily/);
  assert.match(router,/if\(!admin\)return json/);
  assert.match(router,/!MODELS\.some\(x=>x\.id===body\.model\)/);
  assert.doesNotMatch(router.slice(router.indexOf("if(path==='/api/qa/status'"),router.indexOf("if(!admin)return")),/model:cfg\.model/);
  assert.match(admin,/type="radio" name="qa-model"/);
});
test('AI is triggered only from successful first-party new comment POST, never PUT edits',()=>{
  assert.match(main,/request\.method\.toUpperCase\(\) === 'POST'/);
  assert.match(main,/response\.ok && \(payload\.qaMode === 'current' \|\| payload\.qaMode === 'all'\)/);
  assert.match(main,/processQaAfterComment/);
  assert.match(router,/if\(comment\.replyToId\)/);
  assert.match(router,/entry\.authorEmail/);
  assert.match(router,/rootClaim/);
  assert.match(router,/INSERT OR IGNORE INTO qa_claims/);
  assert.match(router,/INSERT OR IGNORE INTO battery_transactions/);
  assert.match(router,/ai_speaker_qa_refund/);
  assert.match(app,/qaMode: qaMode && qaMode !== 'off'/);
});
test('main comments keeps a single line speaker name with shared icon and inline edit notice',()=>{
  assert.match(comments,/rainbow-admin-text/);
  assert.match(comments,/ref=\{headingRef\}/);
  assert.match(comments,/heading\.scrollWidth>heading\.clientWidth/);
  assert.match(comments,/className="inline-flex items-center gap-1 font-bold/);
  assert.match(comments,/並無法知道你曾編輯此留言/);
  assert.match(comments,/請重新發起一篇新留言/);
  assert.match(comments,/value==='off'/);
  assert.match(comments,/AI_SPEAKER/);
  assert.match(comments,/c\.id\.startsWith\('qa-'\)/);
});
test('audio management has an actual dedicated transcript tab, full text, keyword search, and admin pricing',()=>{
  assert.match(page,/active==='transcript'/);
  assert.match(page,/<TranscriptQaAdmin \/>/);
  assert.match(page,/<AiQuestionSettingsAdmin \/>/);
  assert.match(router,/path==='\/api\/qa\/search'/);
  assert.ok(router.includes('const match=path.match('));
  assert.match(router,/chineseCount/);
  assert.match(readFileSync(new URL('../src/components/TranscriptQaAdmin.tsx',import.meta.url),'utf8'),/全文搜尋/);
  assert.match(admin,/每日上限/);
});
