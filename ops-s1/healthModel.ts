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
    actionAllowed: false as const,
  };
  const unknown: HealthCard = { ...base, status: 'unknown', reason: '無法驗證當前狀態', errorRatio: null,
    sampleCount: null, quotaPercent: null, quotaState: 'unknown' };
  if (!verified || !obs) return unknown;

  const hasRequests = Number.isInteger(obs.requests) && Number(obs.requests) >= 0 &&
    Number.isInteger(obs.serverErrors) && Number(obs.serverErrors) >= 0 && Number(obs.serverErrors) <= Number(obs.requests);
  const sampleCount = hasRequests ? Number(obs.requests) : null;
  const errorRatio = hasRequests && sampleCount! >= 100 ? Number(obs.serverErrors) / sampleCount! : null;
  const hasQuota = obs.quotaVerified === true && Number.isFinite(obs.quotaUsed) && Number(obs.quotaUsed) >= 0 &&
    Number.isFinite(obs.quotaLimit) && Number(obs.quotaLimit) > 0;
  const quotaPercent = hasQuota ? Number(obs.quotaUsed) / Number(obs.quotaLimit) * 100 : null;
  const quotaState: QuotaState = quotaPercent === null ? 'unknown' :
    quotaPercent >= 100 ? 'stop_new' : quotaPercent >= 80 ? 'warning' : 'none';
  // A valid, timely observation must include real evidence: a sample, a quota or an explicit verified incident flag.
  const evidencePresent = hasRequests && sampleCount! >= 100 || hasQuota || obs.confirmedFault === true || obs.warning === true;
  if (!evidencePresent) return { ...unknown, evidence: 'unverified', freshness: 'fresh' };
  let status: HealthStatus = 'normal';
  let reason = '本時窗指標沒有觀察到異常';
  if (obs.confirmedFault === true || errorRatio !== null && errorRatio >= 0.05) {
    status = 'fault'; reason = '已驗證本時窗故障';
  } else if (obs.warning === true || errorRatio !== null && errorRatio >= 0.01 || quotaState === 'warning' || quotaState === 'stop_new') {
    status = 'warning'; reason = quotaState === 'stop_new' ? '已到用量界線，禁止啟動非必要新批次（建議）' : '已達警示門檻';
  }
  return { ...base, status, reason, errorRatio, sampleCount, quotaPercent, quotaState };
}

export function buildDashboard(observations: readonly Observation[], nowMs: number): Dashboard {
  const services = SERVICES.map(service => evaluateService(observations.find(o => o.service === service), service, nowMs));
  const overall = services.some(s => s.status === 'fault') ? 'fault' :
    services.some(s => s.status === 'warning') ? 'warning' :
    services.some(s => s.status === 'unknown') ? 'unknown' : 'normal';
  return { mode: 'mock_only', overall, partialUnknown: services.some(s => s.status === 'unknown'),
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