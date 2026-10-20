/**
 * S2367A OPS-I1: synthetic event bridge for AI2 / AI3 / AI7.
 * No integration imports, Cloudflare reads, model calls, timers or job mutations.
 * All inputs are deliberately fake. A recognized event is NOT proof of cloud uptime.
 */
import { buildDashboard, sanitizeIncident } from './healthModel.ts';
import type { Dashboard, FakeIncident, Observation, Service, HealthStatus } from './healthModel.ts';

export type SyntheticOrigin = 'ai2' | 'ai3' | 'ai7';
export type SyntheticKind =
  | 'dispatch_uncertain' | 'processing_timeout' | 'workflow_failed'
  | 'b07_uncertain_hold' | 'b07_stop_new_spend'
  | 'backup_anomaly' | 'restore_locked' | 'backup_integrity_fault';

export type SyntheticInput = {
  origin: SyntheticOrigin;
  kind: SyntheticKind;
  verified: boolean;
  observedAt: string;
  // No track ID, member name, audio content, provider payload, or tokens are accepted.
};

type Rule = Readonly<{
  origin: SyntheticOrigin;
  service: Service;
  impact: 'warning' | 'fault';
  code: string;
  message: string;
}>;
const RULES: Readonly<Record<SyntheticKind, Rule>> = {
  dispatch_uncertain: {
    origin: 'ai2', service: 'workflows', impact: 'warning',
    code: 'WORKFLOW_DISPATCH_UNCERTAIN', message: '逐字稿排隊啟動狀態待核對；不可自動重試',
  },
  processing_timeout: {
    origin: 'ai2', service: 'workflows', impact: 'warning',
    code: 'WORKFLOW_PROCESSING_TIMEOUT', message: '逐字稿處理超時待人工確認；不改動已完成稿',
  },
  workflow_failed: {
    origin: 'ai2', service: 'workflows', impact: 'fault',
    code: 'WORKFLOW_CONFIRMED_FAILURE', message: '已確認逐字稿工作失敗；禁止自動重試',
  },
  b07_uncertain_hold: {
    origin: 'ai3', service: 'workers_ai', impact: 'warning',
    code: 'B07_BILLING_UNCERTAIN_HOLD', message: 'AI 帳單結果不明，費用保留待查；不是模型故障證據',
  },
  b07_stop_new_spend: {
    origin: 'ai3', service: 'workers_ai', impact: 'warning',
    code: 'B07_NEW_SPENDING_BLOCKED', message: '已啟動新費用封鎖（假資料）；不表示帳單已結清',
  },
  backup_anomaly: {
    origin: 'ai7', service: 'r2', impact: 'warning',
    code: 'BACKUP_CHAIN_NEEDS_REVIEW', message: '備份鏈存在待核對異常；不等於 R2 服務當機',
  },
  restore_locked: {
    origin: 'ai7', service: 'd1', impact: 'warning',
    code: 'BACKUP_RESTORE_LOCKED', message: '還原操作因安全檢查被鎖定；不等於 D1 服務當機',
  },
  backup_integrity_fault: {
    origin: 'ai7', service: 'r2', impact: 'fault',
    code: 'BACKUP_CONFIRMED_INTEGRITY_FAULT', message: '已確認備份完整性失敗；原正式資料不可操作',
  },
};
const MAX_AGE_MS = 15 * 60_000;
const MAX_ENTRIES = 4096;
const MAX_VISIBLE_INCIDENTS = 25;
type ReadableIncident = ReturnType<typeof sanitizeIncident> & {
  origin: SyntheticOrigin;
  status: HealthStatus;
  message: string;
  needsHumanReview: true;
};
export type SyntheticOps = {
  mode: 'mock_only';
  dashboard: Dashboard;
  incidents: ReadableIncident[];
  overflow: boolean;
  actionsAllowed: false;
  retryAllowed: false;
  newSpendingAllowed: false;
  restoreAllowed: false;
  hasLiveCloudData: false;
};
function safeDate(value: unknown): number {
  if (typeof value !== 'string' || value.length > 35) return NaN;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

export function composeSyntheticOps(
  fakeEvents: readonly SyntheticInput[],
  nowMs: number,
  baseObservations: readonly Observation[] = [],
): SyntheticOps {
  const outputObservations: Observation[] = [];
  const groups = new Map<string, { rule: Rule; origin: SyntheticOrigin; count: number; status: HealthStatus; observedAt: string | null }>();
  const overflow = fakeEvents.length > MAX_ENTRIES;
  const entries = fakeEvents.slice(0, MAX_ENTRIES);
  for (const event of entries) {
    if (!event || !Object.prototype.hasOwnProperty.call(RULES, event.kind)) continue;
    const rule = RULES[event.kind];
    if (rule.origin !== event.origin) continue;
    const stamp = safeDate(event.observedAt);
    const fresh = Number.isFinite(nowMs) && Number.isFinite(stamp) && stamp <= nowMs && nowMs - stamp <= MAX_AGE_MS;
    const trusted = event.verified === true && fresh;
    const status: HealthStatus = trusted ? rule.impact : 'unknown';
    outputObservations.push({
      service: rule.service,
      access: trusted ? 'granted' : 'unknown',
      source: 'fixture',
      verified: trusted,
      observedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : undefined,
      windowMinutes: 15,
      ...(status === 'warning' ? { warning: true } : {}),
      ...(status === 'fault' ? { confirmedFault: true } : {}),
    });
    const key = rule.code + ':' + status;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (Number.isFinite(stamp) && (!existing.observedAt || Date.parse(existing.observedAt) < stamp))
        existing.observedAt = new Date(stamp).toISOString();
    } else groups.set(key, {
      rule, origin: rule.origin, status, count: 1,
      observedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : null,
    });
  }
  if (overflow) {
    // An oversize batch cannot justify a green status, even with healthy baselines.
    for (const service of ['workflows','workers_ai','r2','d1'] as const)
      outputObservations.push({ service, source: 'fixture', access: 'unknown', verified: false, windowMinutes: 15 });
    groups.set('SYNTHETIC_INPUT_OVERFLOW', {
      rule: { origin: 'ai2', service: 'workflows', impact: 'warning',
        code: 'SYNTHETIC_INPUT_OVERFLOW', message: '事件超過本機安全上限；需人工分批核對' },
      origin: 'ai2', status: 'unknown', count: fakeEvents.length - MAX_ENTRIES, observedAt: null,
    });
  }
  const incidents: ReadableIncident[] = Array.from(groups.values())
    .sort((a,b) => (a.rule.code.localeCompare(b.rule.code)) || a.status.localeCompare(b.status))
    .slice(0, MAX_VISIBLE_INCIDENTS)
    .map(group => {
      const safe: FakeIncident = {
        service: group.rule.service, code: group.rule.code, count: group.count,
        evidence: group.status === 'unknown' ? 'unverified' : 'observed',
        ...(group.observedAt ? { observedAt: group.observedAt } : {}),
      };
      return {
        ...sanitizeIncident(safe),
        origin: group.origin,
        status: group.status,
        message: group.rule.message,
        needsHumanReview: true as const,
      };
    });
  return {
    mode: 'mock_only', dashboard: buildDashboard([...baseObservations, ...outputObservations], nowMs),
    incidents, overflow, actionsAllowed: false, retryAllowed: false,
    newSpendingAllowed: false, restoreAllowed: false, hasLiveCloudData: false,
  };
}

/**
 * Shared per-handler *mock* snapshot, lazily loaded without any timer or polling.
 * All concurrent fake admins share one in-flight read. No cross-region guarantees.
 */
export function createMockSnapshotReader<T>(
  reader: () => Promise<T>,
  ttlMs = 60_000,
): (nowMs: number) => Promise<T> {
  let saved: { at: number; result: Promise<T> } | null = null;
  return (nowMs: number): Promise<T> => {
    if (!Number.isFinite(nowMs)) return Promise.reject(new Error('invalid mock clock'));
    if (saved && nowMs >= saved.at && nowMs - saved.at < ttlMs) return saved.result;
    const result = Promise.resolve().then(reader);
    const next = { at: nowMs, result };
    saved = next;
    void result.catch(() => { if (saved === next) saved = null; });
    return result;
  };
}
