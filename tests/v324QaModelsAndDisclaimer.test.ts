import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatQaAnswer,QA_REPLY_DISCLAIMER,generateQaAnswer} from '../worker/aiSpeakerQaRouter';
import {requestOpenAiSpeakerQa,OPENAI_SPEAKER_QA_MODEL,OPENAI_SPEAKER_QA_ENDPOINT} from '../worker/aiSpeakerQaOpenaiProvider';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const router=read('worker/aiSpeakerQaRouter.ts');

test('QA models display exactly the selected first three without replacing saved choice',()=>{
  const models=router.split("const MODELS = [")[1].split("] as const")[0];
  const p1=models.indexOf("'@cf/qwen/qwen3-30b-a3b-fp8'");
  const p2=models.indexOf("id:OPENAI_SPEAKER_QA_MODEL");
  const p3=models.indexOf("'@cf/qwen/qwen3.8-27b'");
  const p4=models.indexOf("'@cf/zai-org/glm-4.7-flash'");
  assert.ok(p1>=0&&p1<p2&&p2<p3&&p3<p4);
  assert.match(router,/const model=map\.get\('model'\)\|\|MODELS\[0\]\.id/);
  assert.match(router,/MODELS\.some\(x=>x\.id===model\)\?model/);
  assert.match(router,/!MODELS\.some\(x=>x\.id===body\.model\)/);
  assert.match(router,/body\.model===OPENAI_SPEAKER_QA_MODEL&&!String\(env\.OPENAI_API_KEY/);
});
test('fixed literal footer once: no visible references, notes or source recording names',()=>{
  const text='真正的領導來自關懷。\n參考資料：《成功之路》\n來源：《成長故事》\n（根據逐字稿整理，非講者本人回覆）';
  const once=formatQaAnswer(text,['成功之路','成長故事']);
  assert.equal(once,'真正的領導來自關懷。\n'+QA_REPLY_DISCLAIMER);
  const twice=formatQaAnswer(once+'\n'+QA_REPLY_DISCLAIMER,['新增引用']);
  assert.equal(twice,once);
  assert.equal(twice.split(QA_REPLY_DISCLAIMER).length-1,1);
  assert.equal(formatQaAnswer('主要是互相扶持。\n來源：音檔一',['音檔二']),'主要是互相扶持。\n'+QA_REPLY_DISCLAIMER);
  assert.equal(formatQaAnswer('',[]),'');
});
test('ChatGPT API provider uses existing private key, no-store Responses API, effort none',async()=>{
  let calls=0;
  const mock=async(url:RequestInfo|URL,options?:RequestInit):Promise<Response>=>{
    calls++;
    assert.equal(String(url),OPENAI_SPEAKER_QA_ENDPOINT);
    assert.equal(options?.headers&& (options.headers as Record<string,string>).Authorization,'Bearer secure-key-test');
    const body=JSON.parse(String(options?.body));
    assert.deepEqual(Object.keys(body).sort(),['input','instructions','max_output_tokens','model','reasoning','store']);
    assert.equal(body.model,OPENAI_SPEAKER_QA_MODEL);
    assert.equal(body.instructions,'勿編造');
    assert.equal(body.input,'請解說');
    assert.equal(body.store,false);
    assert.equal(body.reasoning.effort,'none');
    assert.equal(body.max_output_tokens,750);
    return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:'回答內容'}]}]}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const result:any=await requestOpenAiSpeakerQa({OPENAI_API_KEY:'secure-key-test'},[{role:'system',content:'勿編造'},{role:'user',content:'請解說'}],750,mock as typeof fetch);
  assert.equal(calls,1);
  assert.ok(result.output);
});
test('missing key or OpenAI non-2xx raises safely without displaying secret or body',async()=>{
  let calls=0;
  const mock=async()=>{calls++;return new Response('raw private details',{status:429});};
  await assert.rejects(()=>requestOpenAiSpeakerQa({},[{role:'user',content:'a'}],750,mock as typeof fetch),/not configured/);
  assert.equal(calls,0);
  await assert.rejects(()=>requestOpenAiSpeakerQa({OPENAI_API_KEY:'secure-key-test'},[{role:'user',content:'a'}],750,mock as typeof fetch),/HTTP 429/);
  assert.equal(calls,1);
  assert.doesNotMatch(read('worker/aiSpeakerQaOpenaiProvider.ts'),/console\.(log|error)/);
});
test('OpenAI failure only creates a charge if another model successfully answered',async()=>{
  const candidates=['@cf/qwen/qwen3-30b-a3b-fp8','@cf/meta/llama-3.1-8b-instruct-fp8'];
  let called=0;
  const env:any={AI:{run:async(model:string)=>{called++;assert.equal(model,candidates[called-1]);return {response:''};}}};
  const response=await generateQaAnswer(env,OPENAI_SPEAKER_QA_MODEL,[{role:'system',content:'rules'},{role:'user',content:'question'}]);
  assert.equal(response.reply,'');
  assert.equal(response.attempts,3);
  assert.equal(called,2);
  const code=read('worker/aiSpeakerQaRouter.ts');
  assert.ok(code.indexOf("if(!reply){await fail(")<code.indexOf("if(!await charge("));
  assert.match(code,/if\(!replyInserted && charged\)await refund/);
  assert.match(code,/await releaseCounters\(env,q\)/);
});
test('official replies never add sources back via prompt or admin guidance',()=>{
  const admin=read('src/components/AiQuestionSettingsAdmin.tsx');
  assert.match(admin,/AI問問題/);
  assert.match(read('src/components/TranscriptQaAdmin.tsx'),/AI問問題/);
  assert.match(read('shared/qaAnswerRules.ts'),/系統會另行附上固定 AI 免責聲明/);
  assert.match(router,/formatQaAnswer\(reply,source\.sources\)/);
  assert.match(router,/mayUseTranscript/);
  assert.match(router,/battery_transactions/);
  assert.match(router,/globalDaily/);
});
