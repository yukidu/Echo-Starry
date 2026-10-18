import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_TASK_CATALOG, INACTIVE_AI_TASKS, DEFAULT_AI_ORDER, validateAiOrder, mergeAiOrder } from '../worker/starryAiManagement';
import { renderStarryAiManagementPage } from '../worker/starryAiManagementPage';

test('central AI scheduler lists only active tasks across Echo and Mirror',()=>{
  assert.equal(AI_TASK_CATALOG.length,5);
  assert.equal(new Set(AI_TASK_CATALOG.map(t=>t.id)).size,6);
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='mirror.reading'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.qa'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.transcribe'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.normalize'));
  assert.ok(!AI_TASK_CATALOG.some(t=>t.id==='echo.translation'));
  assert.ok(INACTIVE_AI_TASKS.some(t=>t.id==='echo.translation'));
  assert.ok(AI_TASK_CATALOG.every(t=>t.url.startsWith('https://')));
});

test('all AI tasks can freely move across tiers and in-tier order',()=>{
  const moved=DEFAULT_AI_ORDER.map((entry,i)=>({
    ...entry,tier:i===0?3:i===4?1:entry.tier,order:i===0?0:i===4?0:i+1
  }));
  const result=validateAiOrder(moved);
  assert.equal(result.find(x=>x.id==='mirror.reading')?.tier,3);
  assert.equal(result.find(x=>x.id==='echo.transcribe')?.tier,1);
  assert.deepEqual(result.map(x=>x.order),[0,1,2,3,4]);
});

test('cannot remove, add, duplicate tasks or inject invalid priority tiers',()=>{
  assert.throws(()=>validateAiOrder(DEFAULT_AI_ORDER.slice(1)));
  assert.throws(()=>validateAiOrder([...DEFAULT_AI_ORDER.slice(0,-1),DEFAULT_AI_ORDER[0]]));
  assert.throws(()=>validateAiOrder(DEFAULT_AI_ORDER.map((t,i)=>i===0?{...t,tier:0 as any}:t)));
  assert.throws(()=>validateAiOrder(DEFAULT_AI_ORDER.map((t,i)=>i===0?{...t,id:'other'}:t)));
});

test('AI management page is noindex, contains cross-tier drag and read-only catalogue',async()=>{
  const res=renderStarryAiManagementPage();
  assert.equal(res.status,200);
  assert.match(res.headers.get('X-Robots-Tag')||'',/noindex/);
  const html=await res.text();
  assert.match(html,/AI 優先權/);
  assert.match(html,/AI 清單/);
  assert.match(html,/pointerdown/);
  assert.match(html,/儲存並套用/);
  assert.match(html,/還原推薦排序/);
  assert.match(html,/逐字稿繁中校正屬於錄音轉錄後的自動工作/);
  assert.match(html,/task.description/);
  assert.match(html,/defaults.map\(x=>\(\{\.\.\.x\}\)\)/);
  assert.match(html,/不參與 AI 優先權排序/);
});

test('new AI functions are registered without losing custom priorities',()=>{
  const prior=DEFAULT_AI_ORDER.slice(0,-1).map((x,i)=>({
    ...x,order:i,tier:x.id==='mirror.reading'?3:x.tier
  }));
  const next=mergeAiOrder(prior);
  assert.equal(next.length,DEFAULT_AI_ORDER.length);
  assert.equal(next.find(x=>x.id==='mirror.reading')?.tier,3);
  assert.ok(next.some(x=>x.id==='echo.normalize'));
  assert.equal(new Set(next.map(x=>x.id)).size,next.length);
});

test('old 6-item priority settings migrate without restoring retired AI translation',()=>{
  const previous=[...DEFAULT_AI_ORDER,{id:'echo.translation',tier:1 as const,order:5}];
  const next=mergeAiOrder(previous);
  assert.equal(next.length,5);
  assert.ok(!next.some(x=>x.id==='echo.translation'));
  assert.ok(next.some(x=>x.id==='echo.normalize'));
});

test('retired translation remains informational, while Cloudflare transcription normalization remains active',()=>{
  const active=AI_TASK_CATALOG.find(x=>x.id==='echo.normalize');
  assert.match(active?.title||'',/轉錄後自動/);
  assert.match(active?.description||'',/不翻譯成其他語言/);
  assert.match(INACTIVE_AI_TASKS[0].description,/瀏覽器處理/);
  const gateway=readFileSync('worker/transcriptV281Gateway.ts','utf8');
  assert.match(gateway,/aiTranslationDisabled: true/);
  const workflow=readFileSync('worker/transcriptWorkflowV282.ts','utf8');
  assert.match(workflow,/const TRADITIONAL_MODEL = '@cf\/openai\/gpt-oss-20b'/);
});
