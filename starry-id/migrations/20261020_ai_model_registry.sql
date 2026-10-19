-- A01/A03: independent central model metadata table in existing Starry ID D1.
-- Additive schema. NEVER call paid AI providers or change existing QA/runtime settings.
CREATE TABLE IF NOT EXISTS starry_ai_models (
  model_id TEXT PRIMARY KEY NOT NULL CHECK(length(model_id) BETWEEN 2 AND 200),
  display_name TEXT NOT NULL CHECK(length(display_name) BETWEEN 1 AND 200),
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 100),
  model_version TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(capabilities_json)),
  tasks_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tasks_json)),
  route_kind TEXT NOT NULL DEFAULT 'unverified' CHECK(route_kind IN ('workers_ai','direct','gateway','unverified')),
  gateway_status TEXT NOT NULL DEFAULT 'unverified' CHECK(gateway_status IN ('unverified','supported','not_supported')),
  registry_status TEXT NOT NULL DEFAULT 'unverified' CHECK(registry_status IN ('unverified','verified','disabled')),
  free_eligibility TEXT NOT NULL DEFAULT 'unverified' CHECK(free_eligibility IN ('unverified','eligible','not_eligible')),
  pricing_unit TEXT NOT NULL DEFAULT 'unverified' CHECK(pricing_unit IN ('unverified','usd_per_million_tokens')),
  input_usd_per_million REAL CHECK(input_usd_per_million IS NULL OR input_usd_per_million>=0),
  output_usd_per_million REAL CHECK(output_usd_per_million IS NULL OR output_usd_per_million>=0),
  price_source_url TEXT,
  price_checked_at TEXT,
  fx_twd_per_usd REAL CHECK(fx_twd_per_usd IS NULL OR fx_twd_per_usd>0),
  fx_source_url TEXT,
  fx_checked_at TEXT,
  input_tokens_per_zh_char REAL CHECK(input_tokens_per_zh_char IS NULL OR input_tokens_per_zh_char>0),
  output_tokens_per_zh_char REAL CHECK(output_tokens_per_zh_char IS NULL OR output_tokens_per_zh_char>0),
  typical_latency_ms REAL CHECK(typical_latency_ms IS NULL OR typical_latency_ms>=0),
  success_rate_pct REAL CHECK(success_rate_pct IS NULL OR (success_rate_pct>=0 AND success_rate_pct<=100)),
  updated_at INTEGER NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'migration-a01-a03'
);
CREATE INDEX IF NOT EXISTS starry_ai_models_provider_status ON starry_ai_models(provider,registry_status);
-- Seed *unverified* models observed in the current code, not a purchased plan
-- or claims of provider availability. Review before enabling (A02).
INSERT OR IGNORE INTO starry_ai_models
(model_id,display_name,provider,model_version,capabilities_json,tasks_json,route_kind,updated_at)
VALUES
('@cf/qwen/qwen3-30b-a3b-fp8','Qwen3 30B','Cloudflare Workers AI',NULL,'["文字問答","推理"]','["echo.qa"]','workers_ai',1792454400000),
('gpt-6-luna','GPT-6 Luna（現有程式設定）','OpenAI',NULL,'["文字問答"]','["echo.qa"]','direct',1792454400000),
('@cf/qwen/qwen3.8-27b','Qwen 3.8 27B','Cloudflare Workers AI',NULL,'["文字問答"]','["echo.qa","mirror.reading"]','workers_ai',1792454400000),
('@cf/zai-org/glm-4.7-flash','GLM-4.7 Flash','Cloudflare Workers AI',NULL,'["文字問答","摘要"]','["echo.qa","echo.bio"]','workers_ai',1792454400000),
('@cf/google/gemma-4-26b-a4b-it','Gemma 4','Cloudflare Workers AI',NULL,'["文字問答"]','["echo.qa"]','workers_ai',1792454400000),
('@cf/meta/llama-3.1-8b-instruct-fp8','Llama 3.1 8B','Cloudflare Workers AI',NULL,'["文字問答"]','["echo.qa"]','workers_ai',1792454400000),
('@cf/nvidia/nemotron-3-120b-a12b','Nemotron 3','Cloudflare Workers AI',NULL,'["文字問答","推理"]','["echo.qa"]','workers_ai',1792454400000),
('@cf/openai/whisper-large-v3-turbo','Whisper Large V3 Turbo','Cloudflare Workers AI',NULL,'["語音轉文字"]','["echo.transcribe"]','workers_ai',1792454400000),
('@cf/openai/gpt-oss-20b','GPT-OSS 20B','Cloudflare Workers AI',NULL,'["文字整理","校正"]','["echo.normalize"]','workers_ai',1792454400000);
