import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseReplyDirectionsUpdate} from '../worker/aiSpeakerQaRouter';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const router=read('worker/aiSpeakerQaRouter.ts');
const admin=read('src/components/TranscriptQaAdmin.tsx');
const badge=read('src/components/AiBadge.css');
const serviceWorker=read('public/sw.js');

test('older mobile/PWA version may save five tier settings without replyDirections',()=>{
  const legacy={enabled:true,model:'@cf/qwen/qwen3-30b-a3b-fp8',globalDaily:12,policies:[{daily:10,free:5,cost:0}]};
  assert.equal(parseReplyDirectionsUpdate(legacy),undefined);
  assert.equal(parseReplyDirectionsUpdate({...legacy,replyDirections:undefined}),undefined);
  assert.match(router,/if\(replyDirections!==undefined\) updatedSettings\.replyDirections=replyDirections/);
  assert.match(router,/Object\.entries\(updatedSettings\)/);
});
test('new client can save, clear, and safely validate response instructions',()=>{
  assert.equal(parseReplyDirectionsUpdate({replyDirections:'溫暖精簡地回答'}),'溫暖精簡地回答');
  assert.equal(parseReplyDirectionsUpdate({replyDirections:''}),'');
  assert.equal(parseReplyDirectionsUpdate({replyDirections:'答'.repeat(2000)}).length,2000);
  assert.throws(()=>parseReplyDirectionsUpdate({replyDirections:'答'.repeat(2001)}),/不得超過2000字/);
  assert.throws(()=>parseReplyDirectionsUpdate({replyDirections:null}),/不得超過2000字/);
  assert.match(admin,/value=\{data\?\.replyDirections\|\|''\}/);
  assert.match(admin,/maxLength=\{2000\}/);
  assert.match(admin,/replyDirections:data\.replyDirections\|\|''/);
});
test('new service worker shell updates existing mobile tabs once after release',()=>{
  assert.match(serviceWorker,/echostars-shell-v179/);
  assert.match(serviceWorker,/upgradingExistingClient/);
  assert.match(serviceWorker,/await client\.navigate\(client\.url\)/);
});
test('Ai emblem matches text height and keeps full-size rainbow Ai letters',()=>{
  assert.match(badge,/width: 0\.9em/);
  assert.match(badge,/height: 0\.9em/);
  assert.match(badge,/font-size: 1em/);
  assert.match(badge,/padding: 1px/);
  assert.match(badge,/starry-ai-letter-flow/);
  assert.doesNotMatch(badge,/background: #101827/);
});
