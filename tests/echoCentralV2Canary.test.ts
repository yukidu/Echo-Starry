import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { redeemCentralEchoTicket, CENTRAL_ECHO_V2_BASE } from '../worker/echoCentralV2Ticket';
import {
  echoCentralV2CanaryEnabled,
  echoCentralV2CanaryPage,
  exchangeCentralV2CanaryTicket
} from '../worker/echoCentralV2Canary';

const CODE = 'T'.repeat(43);
const STATE = 'S'.repeat(43);
const USER_ID = 'central-test-001';
const LEGACY_ID = 'echo-test-001';
const SITE = 'https://echo.starry.phd';

const responseBody = (overrides: Record<string, unknown> = {}) => ({
  authenticated: true,
  scope: 'legacy_echo_only',
  membership_status: 'legacy_unverified',
  starryUserId: USER_ID,
  echoLegacyUserId: LEGACY_ID,
  ...overrides
});
const makeFetcher = (json: Record<string, unknown> = responseBody(), status = 200) => {
  const calls: { input: string; init: RequestInit | undefined }[] = [];
  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ input: String(input), init });
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { fetcher, calls };
};
function env(overrides: Record<string, unknown> = {}) {
  let databaseCalls = 0;
  const DB = {
    prepare(sql: string) {
      assert.match(sql, /^SELECT \* FROM users WHERE id=\? LIMIT 1$/);
      return {
        bind(id: string) {
          databaseCalls += 1;
          return { first: async () => id === LEGACY_ID
            ? { id: LEGACY_ID, isBlocked: 0, name: 'Fake local member' } : null };
        }
      };
    }
  };
  return {
    value: {
      ECHO_CENTRAL_V2_SSO: 'true',
      ECHO_CENTRAL_V2_TEST_USER_ID: USER_ID,
      DB,
      ...overrides
    } as any,
    calls: () => databaseCalls
  };
}
function v2Request(options: { origin?: string; cookie?: string; headerState?: string; code?: string; source?: string } = {}) {
  return new Request(SITE + '/api/auth/ecosystem-exchange', {
    method: 'POST',
    headers: {
      Origin: options.origin ?? SITE,
      'Content-Type': 'application/json',
      Cookie: options.cookie ?? '__Host-echo_v2_canary=' + STATE,
      'X-Echo-V2-State': options.headerState ?? STATE
    },
    body: JSON.stringify({ source: options.source ?? 'central_v2', code: options.code ?? CODE })
  });
}
function nextSession(request: Request) {
  assert.equal(new URL(request.url).pathname, '/api/auth/session');
  assert.equal(request.headers.get('Authorization'), 'Bearer ' + 'Z'.repeat(43));
  assert.equal(request.headers.has('X-Echo-V2-State'), false);
  assert.equal(request.headers.has('Cookie'), false);
  return Promise.resolve(new Response(JSON.stringify({
    authenticated: true,
    user: { id: LEGACY_ID, name: 'Echo original profile', rank: '3%' }
  }), {
    status: 200,
    headers: { 'Set-Cookie': 'echostars_session=FAKE; HttpOnly; Secure; SameSite=Lax' }
  }));
}
const createSession = async (_env: any, userId: string) => {
  assert.equal(userId, LEGACY_ID);
  return { token: 'Z'.repeat(43), expiresAt: 987654321 };
};

test('canary defaults OFF and requires exactly one server-configured central subject', () => {
  assert.equal(echoCentralV2CanaryEnabled({} as any), false);
  assert.equal(echoCentralV2CanaryEnabled(env({ ECHO_CENTRAL_V2_SSO: 'false' }).value), false);
  assert.equal(echoCentralV2CanaryEnabled(env({ ECHO_CENTRAL_V2_TEST_USER_ID: '' }).value), false);
  assert.equal(echoCentralV2CanaryEnabled(env({ ECHO_CENTRAL_V2_TEST_USER_ID: 'a@b.com' }).value), false);
  assert.equal(echoCentralV2CanaryEnabled(env().value), true);
});

test('canary opt-in is an isolated login page; legacy callbacks are not captured', async () => {
  const active = env().value;
  const disabled = env({ ECHO_CENTRAL_V2_SSO: 'false' }).value;
  assert.equal(echoCentralV2CanaryPage(new Request(SITE + '/auth/central-v2'), disabled)?.status, 404);
  assert.equal(echoCentralV2CanaryPage(new Request(SITE + '/auth/callback?code=' + CODE), active), null);
  assert.equal(echoCentralV2CanaryPage(new Request('https://id.starry.phd/auth/central-v2'), active), null);
  const page = echoCentralV2CanaryPage(new Request(SITE + '/auth/central-v2'), active);
  assert.equal(page?.status, 200);
  assert.match(page?.headers.get('Set-Cookie') ?? '', /^__Host-echo_v2_canary=[A-Za-z0-9_-]{43}; Path=\/; Secure; HttpOnly; SameSite=Lax; Max-Age=180$/);
  const html = await page!.text();
  assert.match(html, /Google/);
  assert.match(html, /https:\/\/id\.hglobal1985\.com\/api\/google-sync/);
  assert.match(html, /\/auth\/echo\/continue/);
  assert.match(html, /window\.location\.assign/);
  assert.equal(html.includes('starry_id_session'), false);
  assert.match(page!.headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
});

test('first-party callback is used only with an active pending cookie and always hides the ticket', async () => {
  const request = new Request(SITE + '/auth/callback?code=' + CODE, {
    headers: { Cookie: '__Host-echo_v2_canary=' + STATE }
  });
  const page = echoCentralV2CanaryPage(request, env().value);
  assert.equal(page?.status, 200);
  assert.equal(page?.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(page?.headers.get('Cache-Control')?.includes('no-store'), true);
  const html = await page!.text();
  assert.equal(html.includes(CODE), false);
  assert.match(html, /history\.replaceState/);
  assert.match(html, /_centralV2Canary:true/);
  assert.match(html, /source:"central_v2"/);
  const inactive = echoCentralV2CanaryPage(request, env({ ECHO_CENTRAL_V2_SSO: 'false' }).value);
  assert.equal(inactive?.status, 503);
  assert.match(inactive?.headers.get('Set-Cookie') ?? '', /Max-Age=0/);
});

test('upstream server-only adapter has fixed origin, exact request and strict membership scope', async () => {
  const { fetcher, calls } = makeFetcher();
  const ticket = await redeemCentralEchoTicket(CODE, { fetcher });
  assert.deepEqual(ticket, {
    ok: true, status: 200, centralUserId: USER_ID,
    echoLegacyUserId: LEGACY_ID, scope: 'legacy_echo_only'
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, CENTRAL_ECHO_V2_BASE + '/api/v1/compat/tickets/consume');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal(calls[0].init?.redirect, 'error');
  assert.equal(calls[0].init?.cache, 'no-store');
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { appId: 'echostars', code: CODE });
});

test('ticket helper fails closed for invalid tickets and URL injection without fetching', async () => {
  const { fetcher, calls } = makeFetcher();
  assert.equal((await redeemCentralEchoTicket('not-ticket', { fetcher })).ok, false);
  assert.equal((await redeemCentralEchoTicket(CODE, { fetcher, base: 'http://127.0.0.1:8080' })).ok, false);
  assert.equal(calls.length, 0);
});

test('upstream denies forged/expired/used tickets, malformed and oversized responses', async () => {
  const errors = [
    await redeemCentralEchoTicket(CODE, { fetcher: makeFetcher({}, 401).fetcher }),
    await redeemCentralEchoTicket(CODE, { fetcher: makeFetcher(responseBody({ scope: 'super-admin' })).fetcher }),
    await redeemCentralEchoTicket(CODE, { fetcher: makeFetcher(responseBody({ membership_status: 'approved' })).fetcher }),
    await redeemCentralEchoTicket(CODE, { fetcher: makeFetcher(responseBody({ starryUserId: '' })).fetcher }),
    await redeemCentralEchoTicket(CODE, { fetcher: makeFetcher(responseBody({ echoLegacyUserId: 55 })).fetcher }),
    await redeemCentralEchoTicket(CODE, { fetcher: (async () => { throw Error('offline'); }) as typeof fetch }),
    await redeemCentralEchoTicket(CODE, { fetcher: (async () => new Response('X'.repeat(8200))) as typeof fetch })
  ];
  assert.deepEqual(errors.map(x => x.ok), Array(errors.length).fill(false));
  assert.equal(errors[0].status, 401);
  assert.equal(errors[5].status, 503);
  assert.equal(errors[6].status, 502);
});

test('valid canary ticket resolves EXACT Echo ID, preserves Echo permissions and session cookie', async () => {
  const { fetcher, calls } = makeFetcher();
  const active = env();
  let sessionCalls = 0;
  const response = await exchangeCentralV2CanaryTicket(v2Request(), active.value, nextSession,
    async (...args) => { sessionCalls += 1; return createSession(...args); }, fetcher);
  assert.equal(response.status, 200);
  const json = await response.json() as any;
  assert.equal(json.authenticated, true);
  assert.equal(json.user.id, LEGACY_ID);
  assert.equal(json.user.rank, '3%');
  assert.equal(json.starryUserId, USER_ID);
  assert.equal(json.authToken, 'Z'.repeat(43));
  assert.equal(active.calls(), 1);
  assert.equal(calls.length, 1);
  assert.equal(sessionCalls, 1);
  assert.doesNotMatch(response.headers.get('Set-Cookie') ?? '', /echostars_session=/);
  assert.match(response.headers.get('Set-Cookie') ?? '', /__Host-echo_v2_canary=.*Max-Age=0/);
});

test('untrusted browser origin or missing state never consumes an upstream ticket', async () => {
  for (const request of [
    v2Request({ origin: 'https://evil.example' }),
    v2Request({ cookie: '' }),
    v2Request({ headerState: 'wrong' }),
    v2Request({ source: 'legacy' })
  ]) {
    const { fetcher, calls } = makeFetcher();
    const active = env();
    const result = await exchangeCentralV2CanaryTicket(request, active.value, nextSession, createSession, fetcher);
    assert.ok([400, 403].includes(result.status));
    assert.equal(calls.length, 0);
    assert.equal(active.calls(), 0);
  }
});

test('disabled canary rejects before network and leaves old Echo login available', async () => {
  const { fetcher, calls } = makeFetcher();
  const result = await exchangeCentralV2CanaryTicket(v2Request(),
    env({ ECHO_CENTRAL_V2_SSO: 'false' }).value, nextSession, createSession, fetcher);
  assert.equal(result.status, 503);
  assert.equal(calls.length, 0);
});

test('only the exact configured central test subject can exchange a session', async () => {
  const { fetcher } = makeFetcher(responseBody({ starryUserId: 'different-member' }));
  const active = env();
  let calls = 0;
  const result = await exchangeCentralV2CanaryTicket(v2Request(), active.value, nextSession,
    async (...args) => { calls++; return createSession(...args); }, fetcher);
  assert.equal(result.status, 403);
  assert.equal(active.calls(), 0);
  assert.equal(calls, 0);
});

test('missing mapping refuses, never matches email or creates a member', async () => {
  for (const override of [
    { echoLegacyUserId: null },
    { echoLegacyUserId: 'unmapped-user' }
  ]) {
    const { fetcher } = makeFetcher(responseBody(override));
    const active = env();
    let sessionCalls = 0;
    const result = await exchangeCentralV2CanaryTicket(v2Request(), active.value, nextSession,
      async (...args) => { sessionCalls++; return createSession(...args); }, fetcher);
    assert.equal(result.status, 409);
    assert.equal((await result.json() as any).error, 'identity_link_missing');
    assert.equal(sessionCalls, 0);
  }
});

test('shared device with an existing different Echo session cannot be switched', async () => {
  const { fetcher } = makeFetcher();
  const active = env();
  let created = 0;
  const request = v2Request({ cookie: '__Host-echo_v2_canary=' + STATE + '; echostars_session=OLD' });
  const response = await exchangeCentralV2CanaryTicket(request, active.value,
    async () => new Response(JSON.stringify({
      authenticated: true, user: { id: 'another-local-account' }
    })), async (...args) => { created++; return createSession(...args); }, fetcher);
  assert.equal(response.status, 409);
  assert.equal((await response.json() as any).error, 'existing_echo_session_conflict');
  assert.equal(created, 0);
});

test('blocked local member is denied after precise ID lookup', async () => {
  const active = env({ DB: { prepare: () => ({ bind: () => ({ first: async () => ({
    id: LEGACY_ID, isBlocked: 1
  }) }) }) } });
  const result = await exchangeCentralV2CanaryTicket(v2Request(), active.value, nextSession,
    createSession, makeFetcher().fetcher);
  assert.equal(result.status, 403);
  assert.equal((await result.json() as any).error, 'local_member_blocked');
});

test('local Echo session must match mapped ID; cannot swap to another profile', async () => {
  const active = env();
  const result = await exchangeCentralV2CanaryTicket(v2Request(), active.value,
    async () => new Response(JSON.stringify({
      authenticated: true, user: { id: 'different-local-account', rank: 'Super Admin' }
    })), createSession, makeFetcher().fetcher);
  assert.equal(result.status, 503);
  assert.equal((await result.json() as any).error, 'local_session_validation_failed');
});

test('legacy Echo APIs and automatic background sync remain isolated from v2 canary', () => {
  const route = readFileSync('worker/starryEcosystemSsoRouter.ts', 'utf8');
  const browser = readFileSync('src/ecosystemSsoClient.ts', 'utf8');
  const login = readFileSync('src/googleCredentialExchange.ts', 'utf8');
  assert.match(route, /return exchangeEchoTicket\(request, env, next\)/);
  assert.match(route, /exchangeInput\.source !== 'central_v2'/);
  assert.match(route, /starry_app_auth_codes/);
  assert.match(browser, /if \(cached\?\._centralV2Canary === true\) return/);
  assert.match(browser, /https:\/\/id\.starry\.phd\/api\/ecosystem\/session/);
  assert.match(login, /https:\/\/id\.starry\.phd\/api\/google-sync/);
  assert.doesNotMatch(route, /https:\/\/id\.hglobal1985\.com\/api\/tracks/);
});
