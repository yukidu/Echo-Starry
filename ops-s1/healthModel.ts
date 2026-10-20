/** S76 OPS-S1: pure, injected observations. NEVER fetch Cloudflare or mutate a job. */
export const SERVICES = ['workers', 'workflows', 'd1', 'r2', 'kv', 'workers_ai'] as const;
export type Service = typeof SERVICES[number];
export type HealthStatus = 'normal' | 'warning' | 'fault' | 'unknown';
export type Access = 'granted' | 'denied' | 'unknown';
export type Evidence = 'observed' | 'historical' | 'unverified';
export type QuotaState = 'none' | 'warning' | 'stop_new' | 'unknown';

export type Observation = {
  service: Service;
  access?: Access;
  source?: string;
  observedAt?: string;
  windowMinutes?: number;
  verified?: boolean;
  requests?: number;
  serverErrors?: number;
  confirmedFault?: boolean;
  warning?: boolean;
  quotaUsed?: number;
  quotaLimit?: number;
  quotaVerified?: boolean;
};
export type HealthCard = {
  service: Service;
  status: HealthStatus;
  // Quota and health are independent: enough quota cannot prove service availability.
  healthStatus: HealthStatus;
  healthVerified: boolean;
  conflict: boolean;
  windowMinutes: number | null;
  observedAt: string | null;
  source: string;
  evidence: 'observed' | 'unverified';
  freshness: 'fresh' | 'stale' | 'unknown';
  reason: string;
  errorRatio: number | null;
  sampleCount: number | null;
  quotaPercent: number | null;
  quotaState: QuotaState;
  actionAllowed: false;
};
export type Dashboard = {
  mode: 'mock_only';
  overall: HealthStatus;
  partialUnknown: boolean;
  observedAt: string;
  services: HealthCard[];
  actionsAllowed: false;
};
const SOURCES = new Set(['fixture', 'workers_metrics', 'workflows_metrics', 'd1_metrics', 'r2_metrics', 'kv_metrics', 'ai_metrics']);
const FRESH_MS = 15 * 60_000;

export function evaluateService(obs: Observation | undefined, service: Service, nowMs: number): HealthCard {
  const when = obs?.observedAt ? Date.parse(obs.observedAt) : NaN;
  const inTime = Number.isFinite(when) && when <= nowMs && nowMs - when <= FRESH_MS;
  const verified = obs?.service === service && SOURCES.has(obs.source || '') && obs.access === 'granted' && obs.verified === true && inTime &&
    Number.isFinite(obs.windowMinutes) && Number(obs.windowMinutes) > 0 && Number(obs.windowMinutes) <= 60;
  const source = obs && SOURCES.has(obs.source || '') ? obs.source! : 'unverified';
  const base = {
    service, observedAt: Number.isFinite(when) ? new Date(when).toISOString() : null,
    source, evidence: (verified ? 'observed' : 'unverified') as HealthCard['evidence'],
    freshness: (!Number.isFinite(when) ? 'unknown' : inTime ? 'fresh' : 'stale') as HealthCard['freshness'],
    windowMinutes: verified ? Number(obs!.windowMinutes) : null,
    conflict: false,
    actionAllowed: false as const,
  };
  const unknown: HealthCard = { ...base, status: 'unknown', healthStatus: 'unknown', healthVerified: false,
    reason: '無法驗證當前狀態', errorRatio: null, sampleCount: null, quotaPercent: null, quotaState: 'unknown' };
  if (!verified || !obs) return unknown;

  const hasRequests = Number.isSafeInteger(obs.requests) && Number(obs.requests) >= 0 &&
    Number.isSafeInteger(obs.serverErrors) && Number(obs.serverErrors) >= 0 && Number(obs.serverErrors) <= Number(obs.requests);
  const sampleCount = hasRequests ? Number(obs.requests) : null;
  const errorRatio = hasRequests && sampleCount! >= 100 ? Number(obs.serverErrors) / sampleCount! : null;
  const hasQuota = obs.quotaVerified === true && Number.isFinite(obs.quotaUsed) && Number(obs.quotaUsed) >= 0 &&
    Number.isFinite(obs.quotaLimit) && Number(obs.quotaLimit) > 0;
  const quotaPercent = hasQuota ? Number(obs.quotaUsed) / Number(obs.quotaLimit) * 100 : null;
  const quotaState: QuotaState = quotaPercent === null ? 'unknown' :
    quotaPercent >= 100 ? 'stop_new' : quotaPercent >= 80 ? 'warning' : 'none';
  // Only current *service* evidence can make health known; quotas are a different dimension.
  const healthVerified = errorRatio !== null || obs.confirmedFault === true || obs.warning === true;
  if (!healthVerified) return { ...unknown, evidence: 'observed', freshness: 'fresh',
    reason: hasQuota ? '只確認了額度，服務健康仍未驗證' : '缺少足夠的服務健康證據',
    sampleCount, quotaPercent, quotaState };

  let healthStatus: HealthStatus = 'normal';
  let reason = '本時窗已有有效健康觀測，沒有觀察到異常';
  if (obs.confirmedFault === true || errorRatio !== null && errorRatio >= 0.05) {
    healthStatus = 'fault'; reason = '已驗證本時窗故障';
  } else if (obs.warning === true || errorRatio !== null && errorRatio >= 0.01) {
    healthStatus = 'warning'; reason = '已達服務健康警示門檻';
  }
  const status: HealthStatus = healthStatus === 'normal' && (quotaState === 'warning' || quotaState === 'stop_new')
    ? 'warning' : healthStatus;
  if (status === 'warning' && healthStatus === 'normal') reason = quotaState === 'stop_new'
    ? '已到用量界線，停止非必要新批次（建議）' : '已達用量預警門檻';
  return { ...base, status, healthStatus, healthVerified, reason, errorRatio, sampleCount, quotaPercent, quotaState };
}

/** Review *all* observations: input order cannot suppress verified failures. */
export function reconcileService(observations: readonly Observation[], service: Service, nowMs: number): HealthCard {
  const matches = observations.filter(o => o.service === service);
  if (matches.length === 0) return evaluateService(undefined, service, nowMs);
  const cards = matches.map(o => evaluateService(o, service, nowMs));
  // Stable tie-breaking: no arbitrary Array.find order when timestamps are equal.
  const ranked = cards.slice().sort((a, b) =>
    (Date.parse(b.observedAt || '') || 0) - (Date.parse(a.observedAt || '') || 0) ||
    a.source.localeCompare(b.source) || String(a.windowMinutes).localeCompare(String(b.windowMinutes)) ||
    a.status.localeCompare(b.status) || String(a.quotaPercent).localeCompare(String(b.quotaPercent)));
  const verifiedCards = ranked.filter(c => c.evidence === 'observed' && c.freshness === 'fresh');
  const health = verifiedCards.filter(c => c.healthVerified);
  const chosen = health[0] || verifiedCards[0] || ranked[0];
  const quotas = verifiedCards.filter(c => c.quotaPercent !== null);
  // Conflicting independently verified quota values mean the quota is *unknown*.
  const quotaConflict = quotas.some(c => c.quotaPercent !== quotas[0]?.quotaPercent);
  const quotaPercent = !quotaConflict && quotas.length ? quotas[0].quotaPercent : null;
  const quotaState: QuotaState = quotaPercent === null ? 'unknown' :
    quotaPercent >= 100 ? 'stop_new' : quotaPercent >= 80 ? 'warning' : 'none';
  const hasFault = health.some(c => c.healthStatus === 'fault');
  const differingHealth = health.length > 1 && health.some(c =>
    c.healthStatus !== health[0].healthStatus || c.source !== health[0].source || c.windowMinutes !== health[0].windowMinutes);
  const incomplete = cards.some(c => c.evidence !== 'observed' || c.freshness !== 'fresh' || !c.healthVerified);
  const conflict = quotaConflict || differingHealth || (cards.length > 1 && incomplete);
  // Preserve an authenticated, fresh fault even if another valid or invalid report conflicts.
  const healthStatus: HealthStatus = hasFault ? 'fault' : health.length === 0 || conflict ? 'unknown' : health[0].healthStatus;
  const status: HealthStatus = healthStatus === 'normal' && (quotaState === 'warning' || quotaState === 'stop_new')
    ? 'warning' : healthStatus;
  const reason = conflict ? hasFault
      ? '觀測證據互相矛盾，已有已確認故障，必須人工查證' : '同服務觀測時間窗、證據或額度衝突，健康未核實'
    : healthStatus === 'unknown' ? quotaPercent !== null
      ? '只確認了額度，服務健康仍未驗證' : '無法驗證當前服務健康'
    : status === 'warning' && healthStatus === 'normal' ? '已達用量預警/上限，健康訊號另外驗證'
    : chosen.reason;
  return {
    ...chosen, status, healthStatus, healthVerified: healthStatus !== 'unknown', conflict, reason,
    // Use only contemporaneous, trusted quota data; never expose stale quota as current.
    quotaPercent, quotaState,
    // A confirmed failure remains observed even when other records conflict.
    evidence: hasFault ? 'observed' : conflict ? 'unverified' : chosen.evidence,
    sampleCount: healthStatus === 'unknown' ? null : chosen.sampleCount,
    errorRatio: healthStatus === 'unknown' ? null : chosen.errorRatio,
  };
}

export function buildDashboard(observations: readonly Observation[], nowMs: number): Dashboard {
  const services = SERVICES.map(service => reconcileService(observations, service, nowMs));
  const overall = services.some(s => s.status === 'fault') ? 'fault' :
    services.some(s => s.status === 'warning') ? 'warning' :
    services.some(s => s.status === 'unknown') ? 'unknown' : 'normal';
  return { mode: 'mock_only', overall, partialUnknown: services.some(s => s.status === 'unknown' || s.conflict),
    observedAt: new Date(nowMs).toISOString(), services, actionsAllowed: false };
}

export type FakeIncident = {
  service: Service; code: string; evidence: Evidence;
  observedAt?: string; count: number; uniqueAffected?: number | null;
  unidentified?: number; correlationCode?: string;
  // Unknown properties on untrusted input are intentionally never serialized.
};
export function sanitizeIncident(incident: FakeIncident) {
  const service: Service = SERVICES.includes(incident.service) ? incident.service : 'workflows';
  const code = /^[A-Z0-9_]{1,48}$/.test(incident.code) ? incident.code : 'REDACTED';
  const correlation = /^[A-Z0-9_-]{1,24}$/.test(incident.correlationCode || '') ? incident.correlationCode! : 'REDACTED';
  const evidence: Evidence = incident.evidence === 'observed' || incident.evidence === 'historical' ? incident.evidence : 'unverified';
  return {
    service, code, correlationCode: correlation, evidence,
    observedAt: incident.observedAt && Number.isFinite(Date.parse(incident.observedAt)) ? new Date(incident.observedAt).toISOString() : null,
    count: Number.isSafeInteger(incident.count) && incident.count >= 0 ? incident.count : 0,
    uniqueAffected: Number.isSafeInteger(incident.uniqueAffected) && Number(incident.uniqueAffected) >= 0 ? incident.uniqueAffected! : null,
    unidentified: Number.isSafeInteger(incident.unidentified) && Number(incident.unidentified) >= 0 ? incident.unidentified! : 0,
    actionAllowed: false as const,
  };
}

export const HISTORICAL_EXAMPLE: readonly FakeIncident[] = [
  { service: 'workflows', code: 'ZH_INVALID_JSON', evidence: 'historical', count: 37, uniqueAffected: 23, unidentified: 3 },
  { service: 'workflows', code: 'SUBREQUEST_DEPTH_10034', evidence: 'historical', count: 4, uniqueAffected: 4 },
  { service: 'workflows', code: 'CONTAINER_UNAVAILABLE', evidence: 'historical', count: 1 },
  { service: 'workflows', code: 'MISSING_TRACK_ID', evidence: 'historical', count: 1 },
  { service: 'workflows', code: 'INSTANCE_TERMINATED', evidence: 'historical', count: 3 },
];