/** Isolated S76 design. Not mounted on the production Worker router. NO Cloudflare API code. */
import { buildDashboard, sanitizeIncident } from './healthModel.ts';
import type { Observation, FakeIncident } from './healthModel.ts';
import { composeSyntheticOps, createMockSnapshotReader } from './syntheticEvents.ts';
import type { SyntheticInput } from './syntheticEvents.ts';

export type MockIdentity = { subject: string; currentCentralSuperAdmin: boolean; verifiedByCentralId: boolean; expiresAt: number };
export type ReadOnlyDependencies = {
  now(): number;
  verifyCurrentCentralSuperAdmin(request: Request): Promise<MockIdentity | null>;
  // Injection only. Production adapters/Cloudflare credentials are intentionally absent.
  readMockObservations(): Promise<readonly Observation[]>;
  readMockIncidents(): Promise<readonly FakeIncident[]>;
  /** Optional S2367A fake-only integration. Missing source is not a healthy signal. */
  readMockSyntheticEvents?(): Promise<readonly SyntheticInput[]>;
  allowRead(subject: string, nowMs: number): boolean;
};
const json = (value: object, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
});

/** This handler requires externally injected, current central-admin proof. Without it: deny. */
export function createReadOnlyOpsHandler(deps: ReadOnlyDependencies) {
  // Lazy in-isolate snapshots: 2,000 concurrent fake viewers never trigger 2,000 data reads.
  // This is not an account-wide, cross-region Cloudflare rate limiter.
  const observations = createMockSnapshotReader(deps.readMockObservations);
  const historical = createMockSnapshotReader(deps.readMockIncidents);
  const synthetic = deps.readMockSyntheticEvents
    ? createMockSnapshotReader(deps.readMockSyntheticEvents)
    : null;
  // Explicitly fail closed when the optional fake event source is unavailable.
  const syntheticUnknown: readonly SyntheticInput[] = [
    {origin:'ai2',kind:'dispatch_uncertain',verified:false,observedAt:'invalid'},
    {origin:'ai3',kind:'b07_uncertain_hold',verified:false,observedAt:'invalid'},
    {origin:'ai7',kind:'backup_anomaly',verified:false,observedAt:'invalid'},
    {origin:'ai7',kind:'restore_locked',verified:false,observedAt:'invalid'},
  ];
  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!['/admin/ops/health-summary', '/admin/ops/health-incidents'].includes(url.pathname))
      return json({ error: 'not_found' }, 404);
    if (request.method.toUpperCase() !== 'GET') return json({ error: 'read_only' }, 405);
    const actor = await deps.verifyCurrentCentralSuperAdmin(request).catch(() => null);
    const now = deps.now();
    if (!actor?.currentCentralSuperAdmin || !actor.verifiedByCentralId ||
      !actor.subject || !Number.isFinite(actor.expiresAt) || actor.expiresAt <= now)
      return json({ error: 'access_denied' }, 403);
    if (!deps.allowRead(actor.subject, now)) return json({ error: 'refresh_too_frequent' }, 429);
    if (url.pathname === '/admin/ops/health-summary') {
      const data = await observations(now).catch(() => []);
      if (!synthetic) return json(buildDashboard(data, now));
      const events = await synthetic(now).catch(() => syntheticUnknown);
      return json(composeSyntheticOps(events, now, data).dashboard);
    }
    const limitRaw = url.searchParams.get('limit') || '25';
    const cursorRaw = url.searchParams.get('cursor') || '0';
    if (!/^\d{1,2}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 25 ||
      !/^\d{1,6}$/.test(cursorRaw)) return json({ error: 'invalid_page' }, 400);
    const count = Number(limitRaw), offset = Number(cursorRaw);
    const data = await historical(now).catch(() => null);
    const events = synthetic ? await synthetic(now).catch(() => syntheticUnknown) : null;
    const syntheticItems = events ? composeSyntheticOps(events, now).incidents : [];
    if (!data && !events) return json({ mode: 'mock_only', sourceStatus: 'unknown',
      items: [], nextCursor: null, actionAllowed: false });
    const all = [...syntheticItems, ...(data || []).map(sanitizeIncident)];
    const visible = all.slice(offset, offset + count);
    const missingSynthetic = events === syntheticUnknown;
    return json({ mode: 'mock_only', sourceStatus: !data || missingSynthetic ? 'unknown' : 'available',
      items: visible, nextCursor: all.length > offset + count ? String(offset + count) : null,
      actionAllowed: false });
  };
}

/** In-isolate demonstration throttle; NOT a cross-region or billing-enforced limiter. */
export function createMockRateLimiter(windowMs = 60_000, maxEntries = 128) {
  const last = new Map<string, number>();
  return (subject: string, now: number): boolean => {
    if (!subject || !Number.isFinite(now)) return false;
    const prior = last.get(subject);
    if (prior !== undefined && now - prior >= 0 && now - prior < windowMs) return false;
    if (last.size >= maxEntries) {
      for (const [key, time] of last) if (now - time >= windowMs) last.delete(key);
      if (last.size >= maxEntries && !last.has(subject)) return false;
    }
    last.set(subject, now);
    return true;
  };
}