import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AI_TASK_CATALOG, DEFAULT_AI_ORDER, validateAiOrder, mergeAiOrder } from '../worker/starryAiManagement';
import { renderStarryAiManagementPage } from '../worker/starryAiManagementPage';

test('central AI catalogue registers only real cloud AI tasks across Echo and Mirror',()=>{
  assert.equal(AI_TASK_CATALOG.length,5);
  assert.equal(new Set(AI_TASK_CATALOG.map(t=>t.id)).size,6);
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='mirror.reading'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.qa'));
  assert.ok(AI_TASK_CATALOG.some(t=>t.id==='echo.transcribe'));
  assert.ok(!AI_TASK_CATALOG.some(t=>t.id==='echo.translation'));
  assert.match(AI_TASK_CATALOG.find(t=>t.id==='echo.normalize')!.title,/轉錄後自動/);
  assert.equal(DEFAULT_AI_ORDER.find(t=>t.id==='echo.transcribe')?.tier,3);
  assert.equal(DEFAULT_AI_ORDER.find(t=>t.id==='echo.normalize')?.tier,3);
  assert.ok(AI_TASK_CATALOG.every(t=>t.url.startsWith('https://')));
});

test('all AI tasks can freely move across tiers and in-tier order',()=>{
  const moved=DEFAULT_AI_ORDER.map((entry,i)=>({
    ...entry,tier:i===0?3:i===3?1:entry.tier,order:i===0?0:i===3?0:i+1
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
  assert.match(html,/瀏覽器處理/);
  assert.match(html,/繁中校正須等待錄音轉寫完成/);
  assert.match(html,/tier:x.recommendedTier\|\|3/);
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

test('obsolete AI translation priority is removed without disturbing saved priorities',()=>{
  const legacy=[
    {id:'mirror.reading',tier:3,order:0},
    {id:'echo.qa',tier:1,order:1},
    {id:'echo.translation',tier:1,order:2},
    {id:'echo.bio',tier:2,order:3},
    {id:'echo.transcribe',tier:3,order:4},
    {id:'echo.normalize',tier:3,order:5}
  ];
  const migrated=mergeAiOrder(legacy);
  assert.equal(migrated.length,5);
  assert.equal(migrated.some(x=>x.id==='echo.translation'),false);
  assert.equal(migrated.find(x=>x.id==='mirror.reading')?.tier,3);
  assert.equal(migrated.find(x=>x.id==='echo.normalize')?.tier,3);
});

test('browser translation stays available but its retired cloud AI endpoint stays disabled',()=>{
  const browser=readFileSync('public/transcript-ui-v293.js','utf8');
  const backend=readFileSync('worker/transcriptV281Gateway.ts','utf8');
  assert.match(browser,/requestBrowserPageTranslation/);
  assert.match(backend,/aiTranslationDisabled: true/);
});
