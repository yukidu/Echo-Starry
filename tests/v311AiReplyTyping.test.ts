import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aiText } from '../worker/aiSpeakerQaRouter';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const qa=read('worker/aiSpeakerQaRouter.ts');
const comments=read('src/components/CommentsSection.tsx');
const app=read('src/App.tsx');
const badge=read('src/components/AiBadge.tsx');
const badgeCss=read('src/components/AiBadge.css');

test('Workers AI replies parse correctly for regular and structured chat completions',()=>{
  assert.equal(aiText({response:'已找到逐字稿'}),'已找到逐字稿');
  assert.equal(aiText({result:{response:'可引用的段落'}}),'可引用的段落');
  assert.equal(aiText({choices:[{message:{content:'直接回答'}}]}),'直接回答');
  assert.equal(aiText({choices:[{message:{content:[{type:'text',text:'第一段'},{text:'第二段'}]}}]}),'第一段\n第二段');
  assert.equal(aiText({choices:[{message:{reasoning:'只有思考',content:null}}]}),'');
});
test('typing uses real server state and only checks status for the requesting identity',()=>{
  assert.match(qa,/path==='\/api\/qa\/progress'/);
  assert.match(qa,/WHERE commentId=\? AND identity=\?/);
  assert.match(qa,/status:state==='done'\?'done':state==='failed'\?'failed':'pending'/);
  assert.match(comments,/echostars:qa-comment-sent/);
  assert.match(comments,/echostars:qa-refresh/);
  assert.match(comments,/正在輸入訊息中/);
  assert.match(comments,/本次回答未成功/);
  assert.match(comments,/90000/);
  assert.match(app,/echostars:qa-comment-sent/);
  assert.match(app,/echostars:qa-refresh/);
  assert.doesNotMatch(app,/for \(const wait of \[6500, 16000\]\)/);
});
test('answer model has room for reasoning and does not spend user batteries on failed reply',()=>{
  assert.match(qa,/max_tokens:1400/);
  assert.match(qa,/if\(!reply\)\{await fail/);
  assert.match(qa,/if\(!await charge/);
  assert.match(qa,/if\(!replyInserted && charged\)await refund/);
});
test('reusable transparent Ai emblem has mixed-case letters and animated rainbow outline',()=>{
  assert.match(badge,/>Ai<\/span>/);
  assert.match(badgeCss,/conic-gradient/);
  assert.match(badgeCss,/hue-rotate/);
  assert.match(badgeCss,/prefers-reduced-motion/);
  assert.match(comments,/AiBadge/);
});
