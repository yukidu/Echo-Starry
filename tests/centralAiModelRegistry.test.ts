import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateAiModelCost100Twd, readCentralAiModels, AI_MODEL_ESTIMATE_BASELINE } from '../worker/starryAiModelRegistry';
import { renderStarryAiModelRegistryPage } from '../worker/starryAiModelRegistryPage';

const row = {
  model_id: '@cf/qwen/qwen3-30b-a3b-fp8', display_name: 'Qwen3 30B', provider:'Cloudflare Workers AI',
  model_version: null, capabilities_json:'["文字問答"]', tasks_json:'["echo.qa"]',
  route_kind:'workers_ai', gateway_status:'unverified', registry_status:'unverified',
  free_eligibility:'unverified', pricing_unit:'unverified',
  input_usd_per_million:null, output_usd_per_million:null,
  price_source_url:null, price_checked_at:null,fx_twd_per_usd:null,fx_source_url:null,fx_checked_at:null,
  input_tokens_per_zh_char:null,output_tokens_per_zh_char:null,
  typical_latency_ms:null, success_rate_pct:null, updated_at:1792454400000,
};

test('A01: registry only queries existing central Starry ID model table, never changes the schema or calls AI',async()=>{
  const queries:string[] = [];
  const db={prepare(sql:string) {
    queries.push(sql);
    return {all:async()=>({results:[row]})};
  }};
  const data=await readCentralAiModels({STARRY_ID_DB:db});
  assert.equal(data.readonly,true);
  assert.equal(data.models.length,1);
  assert.equal(data.models[0].modelId,row.model_id);
  assert.equal(data.models[0].estimated100Twd,null);
  assert.equal(data.models[0].freeEligibility,'unverified');
  assert.deepEqual(data.models[0].tasks,['echo.qa']);
  assert.deepEqual(AI_MODEL_ESTIMATE_BASELINE,{requests:100,inputChineseCharacters:3000,outputChineseCharacters:150});
  assert.equal(queries.length,1);
  assert.match(queries[0],/SELECT model_id/);
  assert.doesNotMatch(queries[0],/CREATE|INSERT|UPDATE|DELETE/);
});

test('A03: unknown pricing, unverified URL/FX and token assumption can never produce made-up prices',()=>{
  assert.equal(estimateAiModelCost100Twd(row),null);
  const price={...row, pricing_unit:'usd_per_million_tokens',input_usd_per_million:0.8,
    output_usd_per_million:2,price_checked_at:'2026-10-20',price_source_url:'https://official.example/prices',
    fx_twd_per_usd:32,fx_checked_at:'2026-10-20',fx_source_url:'https://example.org/fx',
    input_tokens_per_zh_char:1.4,output_tokens_per_zh_char:1.4};
  assert.equal(estimateAiModelCost100Twd(price),12.1);
  assert.equal(estimateAiModelCost100Twd({...price,price_source_url:'javascript:alert(1)'}),null);
  assert.equal(estimateAiModelCost100Twd({...price,fx_checked_at:null}),null);
  assert.equal(estimateAiModelCost100Twd({...price,input_tokens_per_zh_char:null}),null);
  assert.equal(estimateAiModelCost100Twd({...price,output_usd_per_million:-1}),null);
});

test('A01: invalid model JSON is contained and no secrets are surfaced',async()=>{
  const view=await readCentralAiModels({STARRY_ID_DB:{prepare:()=>({all:async()=>({results:[{
    ...row,capabilities_json:'invalid',tasks_json:'{"malformed":true}',internal_api_key:'secret-value'
  }]})})}});
  assert.deepEqual(view.models[0].capabilities,[]);
  assert.deepEqual(view.models[0].tasks,[]);
  assert.ok(!JSON.stringify(view).includes('secret-value'));
});

test('A01: central model administration is separate from AI task priorities and administrator-only',async()=>{
  const router=readFileSync('worker/starryIdCentralRouter.ts','utf8');
  assert.match(router,/path === '\/api\/ai-models'/);
  assert.match(router,/origin !== 'https:\/\/id\.starry\.phd'/);
  assert.match(router,/!session\.isSuperAdmin/);
  assert.match(router,/readCentralAiModels\(env\)/);
  assert.match(router,/url\.pathname === '\/ai-models'/);
  assert.match(router,/url\.pathname === '\/ai-management'/);
  assert.match(router,/loadAiPriorities\(env\)/);
  const ui=readFileSync('worker/starryAiManagementPage.ts','utf8');
  assert.ok(ui.includes('/ai-models'));
  const page=await renderStarryAiModelRegistryPage().text();
  assert.match(page,/AI 模型資料庫/);
  assert.match(page,/\/api\/ai-models/);
  assert.match(page,/100 則 AI 回答理論估價/);
  assert.match(page,/textContent/);
});

test('A01: additive migration only seeds inactive/unverified metadata, retains Echo/Starry ID databases',()=>{
  const migration=readFileSync('starry-id/migrations/20261020_ai_model_registry.sql','utf8');
  assert.match(migration,/CREATE TABLE IF NOT EXISTS starry_ai_models/);
  assert.match(migration,/model_id TEXT PRIMARY KEY/);
  assert.match(migration,/registry_status TEXT NOT NULL DEFAULT 'unverified'/);
  assert.match(migration,/free_eligibility TEXT NOT NULL DEFAULT 'unverified'/);
  assert.match(migration,/INSERT OR IGNORE INTO starry_ai_models/);
  assert.ok(!/DROP TABLE|DELETE FROM|ALTER TABLE|UPDATE\s+auth_sessions/i.test(migration));
  assert.match(migration,/@cf\/openai\/whisper-large-v3-turbo/);
  assert.match(migration,/@cf\/openai\/gpt-oss-20b/);
});
