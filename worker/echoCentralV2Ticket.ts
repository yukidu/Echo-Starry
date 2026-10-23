/**
 * Echo server-only adapter for the Central ID v2 one-time Echo ticket.
 * Source contract: Satrry-ID-Center/central-id-v2/echo-adapter/
 * echo-central-ticket-client.mjs (2026-10-23).
 *
 * This is deliberately NOT a browser module and does not create members,
 * grant permissions, or establish Echo sessions.
 */
export const CENTRAL_ECHO_V2_BASE = 'https://id.hglobal1985.com';
const PREVIEW_BASE = 'https://hglobal-central-id-v2-preview.yukidu.workers.dev';
const TICKET_RE = /^[A-Za-z0-9_-]{42,48}$/;
const MAX_RESPONSE_LENGTH = 8192;

export type CentralEchoTicketResult =
  | { ok: true; status: 200; centralUserId: string; echoLegacyUserId: string | null; scope: 'legacy_echo_only' }
  | { ok: false; status: number; error: string };

export async function redeemCentralEchoTicket(
  code: unknown,
  options: { fetcher?: typeof fetch; base?: string; timeoutMs?: number } = {}
): Promise<CentralEchoTicketResult> {
  if (typeof code !== 'string' || !TICKET_RE.test(code)) {
    return { ok: false, status: 401, error: 'invalid_ticket' };
  }
  const base = options.base ?? CENTRAL_ECHO_V2_BASE;
  // Exact upstream allowlist; caller input must never become an arbitrary URL.
  if (base !== CENTRAL_ECHO_V2_BASE && base !== PREVIEW_BASE) {
    return { ok: false, status: 503, error: 'central_origin_untrusted' };
  }
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 6500;
  let response: Response;
  try {
    response = await fetcher(base + '/api/v1/compat/tickets/consume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ appId: 'echostars', code })
    });
  } catch {
    return { ok: false, status: 503, error: 'central_unreachable' };
  }
  if (!response.ok) {
    if ([400, 401, 403].includes(response.status)) {
      return { ok: false, status: response.status, error: 'central_ticket_denied' };
    }
    return { ok: false, status: 503, error: 'central_service_unavailable' };
  }
  let data: any;
  try {
    const text = await response.text();
    if (text.length > MAX_RESPONSE_LENGTH) throw new Error('oversized_response');
    data = JSON.parse(text);
  } catch {
    return { ok: false, status: 502, error: 'central_response_invalid' };
  }
  if (data?.authenticated !== true ||
    data.scope !== 'legacy_echo_only' ||
    data.membership_status !== 'legacy_unverified' ||
    typeof data.starryUserId !== 'string' ||
    data.starryUserId.length === 0 || data.starryUserId.length > 200 ||
    (data.echoLegacyUserId !== null && data.echoLegacyUserId !== undefined &&
      (typeof data.echoLegacyUserId !== 'string' || data.echoLegacyUserId.length > 200))) {
    return { ok: false, status: 502, error: 'central_contract_invalid' };
  }
  return {
    ok: true,
    status: 200,
    centralUserId: data.starryUserId,
    echoLegacyUserId: data.echoLegacyUserId || null,
    scope: 'legacy_echo_only'
  };
}


/** Read-only production-preflight; this cannot switch off any release gate. */
export async function centralEchoV2Ready(
  options: { fetcher?: typeof fetch; timeoutMs?: number } = {}
): Promise<boolean> {
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(CENTRAL_ECHO_V2_BASE + '/api/v1/compat/readiness', {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs ?? 4500)
    });
    if (!response.ok) return false;
    const text = await response.text();
    if (text.length > MAX_RESPONSE_LENGTH) return false;
    const status: any = JSON.parse(text);
    return status?.status === 'ok' &&
      status?.storage === 'connected' &&
      status?.live_legacy_auth === 'read_only_live_checked' &&
      status?.ticket_exchange_enabled === true;
  } catch {
    return false;
  }
}
