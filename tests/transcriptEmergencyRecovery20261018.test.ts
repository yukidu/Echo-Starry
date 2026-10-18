import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aiText,generateQaAnswer} from '../worker/aiSpeakerQaRouter';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('QA handles structured final response without exposing private reasoning',()=>{
  assert.equal(aiText({choices:[{message:{content:[{type:'text',text:'答案一'}],reasoning_content:'秘密'}}]}),'答案一');
  assert.equal(aiText({output:[{type:'reasoning',content:[{text:'秘密'}]},{type:'message',content:[{type:'output_text',text:'答案二'}]}]}),'答案二');
  assert.equal(aiText({choices:[{message:{content:'  最終回答 '}}]}),'最終回答');
  assert.equal(aiText({output:[{type:'reasoning',content:'不應顯示的內容'}]}),'');
});

test('QA tries no more than three distinct models and stops on first final answer',async()=>{
  const seen:string[]=[];
  const env:any={AI:{run:async(model:string)=>{seen.push(model);return seen.length===3?{response:'已成功'}:{response:''};}}};
  const r=await generateQaAnswer(env,'@cf/zai-org/glm-4.7-flash',[]);
  assert.equal(r.reply,'已成功');assert.equal(r.attempts,3);
  assert.equal(new Set(seen).size,3);
  const next:any={AI:{run:async()=>{throw Error('temporarily busy');}}};
  const failed=await generateQaAnswer(next,'@cf/zai-org/glm-4.7-flash',[]);
  assert.equal(failed.reply,'');assert.ok(failed.attempts<=3);
});

test('No failed comment replay and no battery charge on empty AI output',()=>{
  const qa=read('worker/aiSpeakerQaRouter.ts');
  assert.match(qa,/if\(!reply\)\{await fail\(/);
  assert.ok(qa.indexOf('if(!reply){await fail(')<qa.indexOf('if(!await charge('));
  assert.match(qa,/INSERT OR IGNORE INTO qa_claims/);
  assert.match(qa,/processQaAfterComment/);
  assert.doesNotMatch(qa,/UPDATE qa_claims SET status='pending' WHERE status='failed'/);
});

test('Transcription fallback saves Whisper output rather than failing the recording',()=>{
  const workflow=read('worker/transcriptWorkflowV282.ts');
  const scheduler=read('worker/transcriptSequentialSchedulerV293.ts');
  assert.match(workflow,/return values;/);
  assert.match(workflow,/preserving original recognized text/);
  assert.doesNotMatch(workflow,/R2_BUCKET\.head\(key\)/);
  assert.match(scheduler,/options\.includeFailed === true/);
  assert.match(scheduler,/i\.status='pending'/);
});
