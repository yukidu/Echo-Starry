const CENTRAL_SESSION_URL = 'https://id.starry.phd/api/ecosystem/session';
const CENTRAL_TICKET_URL = 'https://id.starry.phd/api/apps/echostars/ticket';
const CENTRAL_LOGOUT_URL = 'https://id.starry.phd/api/logout';
const LOCAL_EXCHANGE_URL = '/api/auth/ecosystem-exchange';
const LOCAL_LOGOUT_URL = '/api/auth/logout';
const USER_KEY = 'sq_current_user_v1';
const SESSION_CHECK_KEY = 'echostars_auth_session_checked_at';
const MIN_SYNC_INTERVAL_MS = 2500;

const nativeFetch: typeof fetch = (
  typeof window !== 'undefined' && typeof window.fetch === 'function'
    ? window.fetch.bind(window)
    : globalThis.fetch.bind(globalThis)
) as typeof fetch;
let syncInFlight: Promise<void> | null = null;
let lastSyncAt = 0;
let reloadScheduled = false;
// Prevent the background SSO exchange from overwriting an explicitly chosen
// Google account, even when a previous background request finishes afterward.
let interactiveGoogleLoginActive = false;
let interactiveLoginGeneration = 0;

export function setInteractiveGoogleLoginActive(active: boolean) {
  if (active && !interactiveGoogleLoginActive) interactiveLoginGeneration += 1;
  interactiveGoogleLoginActive = active;
}

function readCachedUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedUser(user: any) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));
}

function clearCachedUser() {
  try { localStorage.removeItem(USER_KEY); } catch {}
  try { sessionStorage.removeItem(SESSION_CHECK_KEY); } catch {}
}

function reloadOnce() {
  if (reloadScheduled) return;
  reloadScheduled = true;
  window.location.reload();
}

async function centralState() {
  const response = await nativeFetch(CENTRAL_SESSION_URL, {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `central_session_${response.status}`);
  return data;
}

async function requestTicket() {
  const response = await nativeFetch(CENTRAL_TICKET_URL, {
    method: 'POST',
    credentials: 'include',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.code) throw new Error(data?.error || `central_ticket_${response.status}`);
  return String(data.code);
}

async function exchangeTicket(code: string) {
  const response = await nativeFetch(LOCAL_EXCHANGE_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok || !data?.authenticated || !data?.user || !data?.authToken || !data?.starryUserId) {
    throw new Error(data?.error || `echo_exchange_${response.status}`);
  }
  return data;
}

async function clearLocalSession(user: any) {
  const token = typeof user?._authToken === 'string' ? user._authToken : '';
  if (token) {
    await nativeFetch(LOCAL_LOGOUT_URL, {
      method: 'POST',
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` }
    }).catch(() => undefined);
  }
  clearCachedUser();
}

async function performSync() {
  if (interactiveGoogleLoginActive) return;
  const generation = interactiveLoginGeneration;
  const interruptedByLogin = () => interactiveGoogleLoginActive || generation !== interactiveLoginGeneration;
  const cached = readCachedUser();
  // V2 canary authenticates through a separate top-level first-party bridge.
  // Old central session checks must not overwrite or sign out this login.
  if (cached?._centralV2Canary === true) return;
  let state: any;
  try {
    state = await centralState();
  } catch {
    // Offline or temporary Starry ID failures must not sign a member out.
    return;
  }

  if (interruptedByLogin()) return;

  if (!state?.authenticated || !state?.user?.id) {
    // Only identities that have already joined central SSO are cleared here.
    // This avoids destroying a legacy local session during the migration window.
    if (cached?._starryUserId && cached?._authToken) {
      await clearLocalSession(cached);
      reloadOnce();
    }
    return;
  }

  const centralUserId = String(state.user.id);
  if (cached?._authToken && String(cached?._starryUserId || '') === centralUserId) return;

  try {
    const code = await requestTicket();
    const data = await exchangeTicket(code);
    if (interruptedByLogin()) return;
    // A concurrent Google sign-in can change the cached identity mid-request.
    // Only the current, uninterrupted SSO attempt may write its result.
    writeCachedUser({
      ...data.user,
      _authToken: data.authToken,
      _sessionExpiresAt: data.sessionExpiresAt,
      _starryUserId: data.starryUserId
    });
    reloadOnce();
  } catch (error) {
    console.warn('Starry ecosystem login sync skipped:', error);
  }
}

function syncEcosystemSession(force = false) {
  if (interactiveGoogleLoginActive) return syncInFlight || Promise.resolve();
  const now = Date.now();
  if (!force && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) return syncInFlight || Promise.resolve();
  if (syncInFlight) return syncInFlight;
  lastSyncAt = now;
  syncInFlight = performSync().finally(() => { syncInFlight = null; });
  return syncInFlight;
}

async function logoutCentralSession() {
  const cached = readCachedUser();
  // A v2 canary session must never log out an unrelated legacy central account.
  // Cross-site SameSite=Lax may prevent the v2 cookie from being sent; the
  // Echo local session is still independently invalidated on logout.
  const target = cached?._centralV2Canary === true
    ? 'https://id.hglobal1985.com/api/logout' : CENTRAL_LOGOUT_URL;
  try {
    await nativeFetch(target, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
  } catch {
    // Local logout must still work if the central service is temporarily unreachable.
  }
}

function installLogoutBridge() {
  const previousFetch = window.fetch.bind(window);
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await previousFetch(input, init);
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (url.origin === window.location.origin && url.pathname === LOCAL_LOGOUT_URL && method === 'POST' && response.ok) {
        void logoutCentralSession();
      }
    } catch {}
    return response;
  }) as typeof window.fetch;

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!button) return;
    const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
    const title = button.getAttribute('title') || '';
    const aria = button.getAttribute('aria-label') || '';
    if (title === '登出目前帳號' || aria === '登出目前帳號' || text === '登出') {
      void logoutCentralSession();
    }
  }, true);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.setTimeout(() => {
    installLogoutBridge();
    void syncEcosystemSession(true);
  }, 0);

  window.addEventListener('focus', () => { void syncEcosystemSession(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncEcosystemSession();
  });
  window.addEventListener('online', () => { void syncEcosystemSession(true); });
}
