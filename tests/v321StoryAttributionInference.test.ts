import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {storyBatch,storyAiResponseText,inferStoryBatch,STORY_AI_MODEL,STORY_BATCH_MAX_SEGMENTS} from '../worker/aiSpeakerStoryInference';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const segments=Array.from({length:81},(_,i)=>({id:'s-'+i,start:i*4,end:i*4+4,text:'這是第 '+i+' 段，提到夫妻的故事但沒有明確證據'}));
const item=(id:string)=>({segmentId:id,owner:'unknown',narrator:'unknown',kind:'unknown',summary:'尚不能確定故事主人'});

test('safe batch reads 25 or fewer R2 transcript segments without dropping or modifying originals',()=>{
  const original=JSON.stringify(segments);
  const a=storyBatch(segments,0);
  const b=storyBatch(segments,a.part.length);
  assert.ok(a.part.length>0&&a.part.length<=STORY_BATCH_MAX_SEGMENTS);
  assert.equal(a.part.length,25);
  assert.equal(b.part[0].id,'s-25');
  assert.equal(a.part[0],segments[0]);
  assert.equal(JSON.stringify(segments),original);
  assert.ok(a.snippets.includes('[s-0]'));
  assert.ok(a.snippets.includes('[s-24]'));
  assert.ok(!a.snippets.includes('[s-25]'));
});
test('very long transcript paragraphs are batched by character budget without changing source',()=>{
  const long=Array.from({length:25},(_,i)=>({id:'long-'+i,text:'文'.repeat(1700),start:i,end:i+1}));
  const b=storyBatch(long,0);
  assert.ok(b.part.length>=1&&b.part.length<25);
  assert.equal(b.part[0].text,long[0].text);
  assert.ok(b.snippets.length<=5400);
});
test('story JSON is never cut to the comment-answer 4,000 character limit',()=>{
  const obj={response:JSON.stringify({claims:[item('s-0')],padding:'測'.repeat(4500)})};
  const full=storyAiResponseText(obj);
  assert.ok(full.length>4000);
  assert.equal(JSON.parse(full).padding.length,4500);
  assert.equal(storyAiResponseText({output:[{type:'reasoning',text:'private'},{type:'message',content:[{type:'output_text',text:'[]'}]}]}),'[]');
});
test('valid story result uses one GLM call, never Whisper or a replacement model',async()=>{
  let called=0;
  const ai={run:async(model:string,args:any)=>{
    called++;
    assert.equal(model,STORY_AI_MODEL);
    assert.deepEqual(args.chat_template_kwargs,{enable_thinking:false});
    assert.equal(args.messages[1].role,'user');
    return {response:JSON.stringify([item('s-0')])};
  }};
  const r=await inferStoryBatch(ai,segments.slice(0,10),'張先生&王女士','[s-0] 對夫妻故事仍無可靠辨識');
  assert.equal(called,1);
  assert.equal(r.length,1);
  assert.equal(r[0].owner,'unknown');
});
test('invalid or truncated first answer triggers exactly one retry on same segment batch',async()=>{
  const models:string[]=[];
  const ai={run:async(model:string,args:any)=>{
    models.push(model);
    if(models.length===1)return {response:'[{"segmentId":"s-0","owner":"unknown"'};
    assert.match(args.messages[0].content,/上一份 JSON 不合法/);
    return {response:JSON.stringify({claims:[item('s-0')]})};
  }};
  const r=await inferStoryBatch(ai,segments.slice(0,10),'張先生&王女士','[s-0] 逐字稿');
  assert.deepEqual(models,[STORY_AI_MODEL,STORY_AI_MODEL]);
  assert.equal(r[0].segmentId,'s-0');
});
test('two invalid outputs fail closed; provider exception is not retried',async()=>{
  let calls=0;
  const ai={run:async()=>{calls++;return {response:'{"claims":[{"segmentId":'};}};
  await assert.rejects(()=>inferStoryBatch(ai,segments.slice(0,10),'張先生&王女士','text'),/已自動重試一次/);
  assert.equal(calls,2);
  let failedCalls=0;
  await assert.rejects(()=>inferStoryBatch({run:async()=>{failedCalls++;throw Error('provider unavailable');}},segments.slice(0,10),'張先生&王女士','text'),/provider unavailable/);
  assert.equal(failedCalls,1);
});
test('workflow advances cursor only after the draft has been saved, not after failed AI',()=>{
  const router=read('worker/aiSpeakerStoryRouter.ts');
  assert.match(router,/await inferStoryBatch\(env\.AI,part,row\.speaker,snippets\)/);
  const aiIndex=router.indexOf('await inferStoryBatch(');
  const persistIndex=router.indexOf('await put(env,draftKey(id),draft);');
  const cursorIndex=router.indexOf('SET status=?,cursor=?');
  assert.ok(aiIndex<persistIndex&&persistIndex<cursorIndex);
  assert.match(router,/status='failed',error=\?,updatedAt=\?/);
  assert.match(router,/CASE WHEN revision=\? THEN cursor ELSE 0 END/);
  assert.doesNotMatch(router,/aiText\(output\)/);
  assert.match(router,/STORY_AI_MODEL/);
  assert.doesNotMatch(router,/\.put\(row\.transcriptR2Key/);
});

test('live GLM JSON response shape is supported, including Cloudflare chat.completion wrappers',async()=>{
  const ai={run:async(_model:string,args:any)=>{
    assert.equal(args.chat_template_kwargs.enable_thinking,false);
    return {id:'chatcmpl-example',object:'chat.completion',choices:[{message:{role:'assistant',content:'```json\n[]\n```',reasoning:null}}]};
  }};
  const out=await inferStoryBatch(ai,segments.slice(0,5),'張先生&王女士','[s-0] 無確定證據');
  assert.deepEqual(out,[]);
});
