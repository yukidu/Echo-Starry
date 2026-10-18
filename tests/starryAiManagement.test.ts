import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TASK_CATALOG, DEFAULT_AI_ORDER, validateAiOrder } from '../worker/starryAiManagement';
import { renderStarryAiManagementPage } from '../worker/starryAiManagementPage';

test('central AI catalogue enumerates all six known tasks across Echo and Mirror',()=>{
  assert.equal(AI_TASK_CATALOG.length,6);
  assert.equal(new Set(AI_TASK_CATALOG.map(t=>t.id)).size,6);
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='mirror.reading'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.qa'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.transcribe'));
  assert.ok(AI_TASK_CATALOG.every(t=>t.url.startsWith('https://')));
});

test('all AI tasks can freely move across tiers and in-tier order',()=>{
  const moved=DEFAULT_AI_ORDER.map((entry,i)=>({
    ...entry,tier:i===0?3:i===4?1:entry.tier,order:i===0?0:i===4?0:i+1
  }));
  const result=validateAiOrder(moved);
  assert.equal(result.find(x=>x.id==='mirror.reading')?.tier,3);
  assert.equal(result.find(x=>x.id==='echo.transcribe')?.tier,1);
  assert.deepEqual(result.map(x=>x.order),[0,1,2,3,4,5]);
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
});
