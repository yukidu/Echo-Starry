/** Isolated S76 design. Not mounted on the production Worker router. NO Cloudflare API code. */
import { buildDashboard, sanitizeIncident } from './healthModel.ts';
import type { Observation, FakeIncident } from './healthModel.ts';

export type MockIdentity = { subject: string; currentCentralSuperAdmin: boolean; verifiedByCentralId: boolean; expiresAt: number };
export type ReadOnlyDependencies = {
  now(): number;
  verifyCurrentCentralSuperAdmin(request: Request): Promise<MockIdentity | null>;
  // Injection only. Production adapters/Cloudflare credentials are intentionally absent.
  readMockObservations(): Promise<readonly Observation[]>;
  readMockIncidents(): Promise<readonly FakeIncident[]>;
  allowRead(subject: string, nowMs: number): boolean;
};
const json = (value: object, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' },
});

/** This handler requires externally injected, current central-admin proof. Without it: deny. */
export function createReadOnlyOpsHandler(deps: ReadOnlyDependencies) {
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
      const data = await deps.readMockObservations().catch(() => []);
      return json(buildDashboard(data, now));
    }
    const limitRaw = url.searchParams.get('limit') || '25';
    const cursorRaw = url.searchParams.get('cursor') || '0';
    if (!/^\d{1,2}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > 25 ||
      !/^\d{1,6}$/.test(cursorRaw)) return json({ error: 'invalid_page' }, 400);
    const count = Number(limitRaw), offset = Number(cursorRaw);
    let data: readonly FakeIncident[];
    try { data = await deps.readMockIncidents(); }
    catch { return json({ mode: 'mock_only', sourceStatus: 'unknown', items: [], nextCursor: null, actionAllowed: false }); }
    const visible = data.slice(offset, offset + count).map(sanitizeIncident);
    return json({ mode: 'mock_only', sourceStatus: 'available', items: visible,
      nextCursor: data.length > offset + count ? String(offset + count) : null, actionAllowed: false });
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