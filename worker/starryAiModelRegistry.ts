/**
 * Starry ID central AI model inventory (A01/A03).
 * Catalogue metadata only: no inference, provider credentials, or model routing.
 * App-specific QA models and the existing AI task scheduler stay unchanged.
 * The D1 schema is applied by the additive reviewed migration, never by GET.
 */
export type CentralAiModelRow = {
  model_id: string;
  display_name: string;
  provider: string;
  model_version: string | null;
  capabilities_json: string;
  tasks_json: string;
  route_kind: string;
  gateway_status: string;
  registry_status: string;
  free_eligibility: string;
  pricing_unit: string;
  input_usd_per_million: number | null;
  output_usd_per_million: number | null;
  price_source_url: string | null;
  price_checked_at: string | null;
  fx_twd_per_usd: number | null;
  fx_source_url: string | null;
  fx_checked_at: string | null;
  input_tokens_per_zh_char: number | null;
  output_tokens_per_zh_char: number | null;
  typical_latency_ms: number | null;
  success_rate_pct: number | null;
  updated_at: number;
};

export const AI_MODEL_ESTIMATE_BASELINE = Object.freeze({
  requests: 100, inputChineseCharacters: 3000, outputChineseCharacters: 150
});

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 1000) : '';
}
function safeList(raw: unknown): string[] {
  try {
    const value: unknown = JSON.parse(safeString(raw));
    return Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string').slice(0, 16) : [];
  } catch { return []; }
}
function validPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function validNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function approvedSource(url: string | null | undefined) {
  if (!url) return false;
  try { return new URL(url).protocol === 'https:'; } catch { return false; }
}

/**
 * Token per Chinese character and FX are explicitly recorded assumptions,
 * not a claim that a Chinese character equals one token.
 * No value is returned unless a priced model and both sources were verified.
 */
export function estimateAiModelCost100Twd(row: CentralAiModelRow) {
  const valid = row.pricing_unit === 'usd_per_million_tokens'
    && validNonnegative(row.input_usd_per_million)
    && validNonnegative(row.output_usd_per_million)
    && validPositive(row.fx_twd_per_usd)
    && validPositive(row.input_tokens_per_zh_char)
    && validPositive(row.output_tokens_per_zh_char)
    && approvedSource(row.price_source_url)
    && approvedSource(row.fx_source_url)
    && Boolean(row.price_checked_at && row.fx_checked_at);
  if (!valid) return null;
  const inputTokens = AI_MODEL_ESTIMATE_BASELINE.requests *
    AI_MODEL_ESTIMATE_BASELINE.inputChineseCharacters * row.input_tokens_per_zh_char!;
  const outputTokens = AI_MODEL_ESTIMATE_BASELINE.requests *
    AI_MODEL_ESTIMATE_BASELINE.outputChineseCharacters * row.output_tokens_per_zh_char!;
  const usd = (inputTokens * row.input_usd_per_million! +
    outputTokens * row.output_usd_per_million!) / 1_000_000;
  const twd = usd * row.fx_twd_per_usd!;
  return Number.isFinite(twd) ? Math.round(twd * 100) / 100 : null;
}

function safeModelView(row: CentralAiModelRow) {
  return {
    modelId: safeString(row.model_id),
    name: safeString(row.display_name),
    provider: safeString(row.provider),
    version: safeString(row.model_version),
    capabilities: safeList(row.capabilities_json),
    tasks: safeList(row.tasks_json),
    routeKind: safeString(row.route_kind),
    gatewayStatus: safeString(row.gateway_status),
    registryStatus: safeString(row.registry_status),
    freeEligibility: safeString(row.free_eligibility),
    pricingUnit: safeString(row.pricing_unit),
    inputUsdPerMillion: row.input_usd_per_million,
    outputUsdPerMillion: row.output_usd_per_million,
    priceSourceUrl: approvedSource(row.price_source_url) ? row.price_source_url : null,
    priceCheckedAt: row.price_checked_at,
    fxTwdPerUsd: row.fx_twd_per_usd,
    fxSourceUrl: approvedSource(row.fx_source_url) ? row.fx_source_url : null,
    fxCheckedAt: row.fx_checked_at,
    inputTokensPerChineseChar: row.input_tokens_per_zh_char,
    outputTokensPerChineseChar: row.output_tokens_per_zh_char,
    typicalLatencyMs: row.typical_latency_ms,
    successRatePct: row.success_rate_pct,
    estimated100Twd: estimateAiModelCost100Twd(row),
    updatedAt: row.updated_at
  };
}

export async function readCentralAiModels(env: { STARRY_ID_DB?: any }) {
  if (!env.STARRY_ID_DB) throw new Error('central_model_database_unavailable');
  // No dynamic SQL, no table creation on reads, no secret or provider API access.
  const query = `SELECT model_id,display_name,provider,model_version,capabilities_json,tasks_json,
    route_kind,gateway_status,registry_status,free_eligibility,pricing_unit,
    input_usd_per_million,output_usd_per_million,price_source_url,price_checked_at,
    fx_twd_per_usd,fx_source_url,fx_checked_at,input_tokens_per_zh_char,
    output_tokens_per_zh_char,typical_latency_ms,success_rate_pct,updated_at
    FROM starry_ai_models ORDER BY provider,display_name,model_id LIMIT 100`;
  const data = await env.STARRY_ID_DB.prepare(query).all();
  return {
    baseline: AI_MODEL_ESTIMATE_BASELINE,
    models: (Array.isArray(data?.results) ? data.results : []).map((row: CentralAiModelRow) => safeModelView(row)),
    readonly: true,
    pricingNotice: '未確認官方費率、中文字 Token 換算假設及匯率前，估價必須顯示待查；未核准的模型不可正式啟用'
  };
}
