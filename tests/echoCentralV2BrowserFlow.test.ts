import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { echoCentralV2CanaryPage } from '../worker/echoCentralV2Canary';

const CODE = 'T'.repeat(43);
const STATE = 'S'.repeat(43);
const ECHO_USER = 'echo-browser-fixture';
const CENTRAL_USER = 'central-browser-fixture';
const CALLBACK = 'https://echo.starry.phd/auth/callback?code=' + CODE;

type BrowserResult = {
  calls: { path: string; method: string; authorization: string; credentials: string }[];
  stored: string | null;
  redirect: string;
  fallback: boolean;
  status: string;
  sanitizedPath: string;
  pending: string | null;
};

function storage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem(key: string) { return map.get(key) ?? null; },
    setItem(key: string, value: string) { map.set(key, value); },
    removeItem(key: string) { map.delete(key); }
  };
}

async function runBrowserCallback(options: {
  pending?: boolean;
  echoVerified?: boolean;
  conflictingAccount?: boolean;
} = {}): Promise<BrowserResult> {
  const env: any = { ECHO_CENTRAL_V2_SSO: 'true', ECHO_CENTRAL_V2_TEST_USER_ID: CENTRAL_USER };
  const page = await echoCentralV2CanaryPage(new Request(CALLBACK, {
    headers: { Cookie: '__Host-echo_v2_canary=' + STATE }
  }), env);
  assert.equal(page?.status, 200);
  const html = await page!.text();
  const script = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script, 'must execute the exact callback script sent to the browser');
  const pending: Record<string, string> = options.pending === false ? {} : {
    echo_central_v2_pending: JSON.stringify({ state: STATE, expires: Date.now() + 100000 })
  };
  const sessionStorage = storage(pending);
  const localStorage = storage(options.conflictingAccount ? {
    sq_current_user_v1: JSON.stringify({ id: 'someone-else', _authToken: 'OLD' })
  } : {});
  const calls: BrowserResult['calls'] = [];
  let redirect = '';
  let sanitizedPath = '';
  const status = { textContent: '' };
  const fallback = { hidden: true };
  const fetcher = async (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({
      path,
      method: String(init.method),
      authorization: headers.get('Authorization') || '',
      credentials: String(init.credentials)
    });
    if (path === '/api/auth/ecosystem-exchange') {
      assert.equal(init.method, 'POST');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(JSON.parse(String(init.body)).code, CODE);
      assert.equal(headers.get('X-Echo-V2-State'), STATE);
      return new Response(JSON.stringify({
        authenticated: true,
        user: { id: ECHO_USER, name: 'Synthetic User' },
        authToken: 'K'.repeat(43),
        starryUserId: CENTRAL_USER,
        sessionExpiresAt: Date.now() + 60000
      }), { status: 200 });
    }
    if (path === '/api/auth/session') {
      assert.equal(init.method, 'GET');
      assert.equal(init.credentials, 'same-origin');
      assert.equal(headers.get('Authorization'), 'Bearer ' + 'K'.repeat(43));
      assert.equal(localStorage.getItem('sq_current_user_v1'), options.conflictingAccount
        ? JSON.stringify({ id: 'someone-else', _authToken: 'OLD' }) : null);
      return new Response(JSON.stringify({
        authenticated: options.echoVerified !== false,
        user: options.echoVerified !== false ? { id: ECHO_USER } : null
      }), { status: options.echoVerified !== false ? 200 : 401 });
    }
    throw new Error('unapproved fake network request ' + path);
  };
  const window = {
    location: {
      href: CALLBACK,
      replace(destination: string) { redirect = destination; }
    }
  };
  const history = {
    replaceState(_data: unknown, _title: string, path: string) {
      sanitizedPath = path;
    }
  };
  const document = {
    getElementById(id: string) {
      return id === 'status' ? status : id === 'fallback' ? fallback : null;
    }
  };
  runInNewContext(script, {
    window, history, document, localStorage, sessionStorage,
    fetch: fetcher, URL, Date, JSON
  }, { timeout: 1000 });
  // The exact inline script launches a Promise chain. Flush microtasks.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  await new Promise<void>(resolve => setImmediate(resolve));

  return {
    calls,
    stored: localStorage.getItem('sq_current_user_v1'),
    redirect,
    fallback: fallback.hidden === false,
    status: status.textContent,
    sanitizedPath,
    pending: sessionStorage.getItem('echo_central_v2_pending')
  };
}

test('real callback JS checks Echo first-party cookie before committing v2 identity', async () => {
  const result = await runBrowserCallback();
  assert.deepEqual(result.calls.map(x => x.path),
    ['/api/auth/ecosystem-exchange', '/api/auth/session']);
  assert.equal(result.calls[1].credentials, 'same-origin');
  assert.equal(result.calls[1].authorization, 'Bearer ' + 'K'.repeat(43));
  assert.equal(JSON.parse(result.stored || '{}')._centralV2Canary, true);
  assert.equal(JSON.parse(result.stored || '{}').id, ECHO_USER);
  assert.equal(result.redirect, '/');
  assert.equal(result.sanitizedPath, '/auth/callback');
  assert.equal(result.pending, null);
});

test('failed Echo cookie verification must not commit localStorage or redirect', async () => {
  const result = await runBrowserCallback({ echoVerified: false });
  assert.deepEqual(result.calls.map(x => x.path),
    ['/api/auth/ecosystem-exchange', '/api/auth/session']);
  assert.equal(result.stored, null);
  assert.equal(result.redirect, '');
  assert.equal(result.fallback, true);
});

test('missing same-tab state never consumes one-time ticket', async () => {
  const result = await runBrowserCallback({ pending: false });
  assert.equal(result.calls.length, 0);
  assert.equal(result.stored, null);
  assert.equal(result.redirect, '');
  assert.equal(result.fallback, true);
  assert.equal(result.sanitizedPath, '/auth/callback');
});

test('a different cached account must not get a new Echo first-party session', async () => {
  const result = await runBrowserCallback({ conflictingAccount: true });
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].path, '/api/auth/ecosystem-exchange');
  assert.equal(result.redirect, '');
  assert.equal(result.fallback, true);
  assert.equal(JSON.parse(result.stored || '{}').id, 'someone-else');
});
