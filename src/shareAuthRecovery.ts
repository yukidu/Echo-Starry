import './sessionCache';
import { exchangeGoogleCredential, loginRevision } from './googleCredentialExchange';
import { GOOGLE_CLIENT_ID } from './config/auth';

declare global {
  interface Window {
    google?: any;
    __echostarsShareAuthRecoveryInstalled?: boolean;
  }
}

const USER_KEY = 'sq_current_user_v1';
const SESSION_CHECK_KEY = 'echostars_auth_session_checked_at';
const EXPLICIT_LOGOUT_KEY = 'echostars_explicit_logout_v1';
const SHARE_PATH = window.location.pathname.startsWith('/share/');
const originalFetch = window.fetch.bind(window);

function readCachedUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeRecoveredSession(data: any) {
  if (!data?.user || !data?.authToken) return false;
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({
      ...data.user,
      _authToken: data.authToken,
      _sessionExpiresAt: data.sessionExpiresAt
    }));
    sessionStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));
    sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
    return true;
  } catch {
    return false;
  }
}

function authorizationFor(user: any): Record<string, string> {
  const token = typeof user?._authToken === 'string' ? user._authToken : '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function installLogoutBridge() {
  if (window.__echostarsShareAuthRecoveryInstalled) return;
  window.__echostarsShareAuthRecoveryInstalled = true;

  const nativeRemoveItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function removeItemWithServerLogout(key: string) {
    let shouldLogout = false;
    let cachedUser: any = null;
    try {
      shouldLogout = this === window.localStorage && key === USER_KEY;
      if (shouldLogout) cachedUser = readCachedUser();
    } catch {}

    const result = nativeRemoveItem.call(this, key);
    if (shouldLogout && cachedUser) {
      try { sessionStorage.setItem(EXPLICIT_LOGOUT_KEY, '1'); } catch {}
      try { window.google?.accounts?.id?.disableAutoSelect?.(); } catch {}
      void originalFetch('/api/auth/logout', {
        method: 'POST',
        headers: authorizationFor(cachedUser),
        credentials: 'include',
        cache: 'no-store',
        keepalive: true
      }).catch(() => undefined);
    }
    return result;
  };
}

async function restoreFromFirstPartySession() {
  if (readCachedUser()) return true;
  const startedRevision = loginRevision();
  try {
    if (sessionStorage.getItem(EXPLICIT_LOGOUT_KEY) === '1') {
      await originalFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
        keepalive: true
      }).catch(() => undefined);
      sessionStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      return false;
    }
  } catch {}

  try {
    const response = await originalFetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store'
    });
    if (!response.ok) return false;
    const data = await response.json().catch(() => ({}));
    // A newer interactive login wins over an older cookie recovery response.
    if (startedRevision !== loginRevision() || readCachedUser()) return true;
    if (!storeRecoveredSession(data)) return false;
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

let googleRecoveryStarted = false;
let fallbackRendered = false;

async function acceptGoogleCredential(response: any) {
  const credential = String(response?.credential || '');
  if (!credential) return;
  try {
    const data = await exchangeGoogleCredential(credential, originalFetch);
    if (!storeRecoveredSession(data)) return;
    window.location.reload();
  } catch {
    // The compact fallback remains available when an embedded browser blocks GIS.
  }
}

function renderGoogleFallback() {
  if (!SHARE_PATH || fallbackRendered || readCachedUser()) return;
  fallbackRendered = true;

  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-echostars-share-auth-recovery', '1');
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: '50%',
    bottom: '14px',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    width: 'min(92vw, 360px)',
    padding: '10px 12px',
    borderRadius: '16px',
    background: 'rgba(255,255,255,.97)',
    boxShadow: '0 12px 36px rgba(15,23,42,.24)',
    border: '1px solid rgba(148,163,184,.35)',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#334155'
  });

  const header = document.createElement('div');
  Object.assign(header.style, { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' });
  const text = document.createElement('div');
  text.textContent = '已是會員？用 Google 恢復登入身分';
  Object.assign(text.style, { fontSize: '13px', fontWeight: '700', lineHeight: '1.35' });
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '關閉登入提示');
  Object.assign(close.style, { border: '0', background: 'transparent', fontSize: '22px', lineHeight: '1', cursor: 'pointer', color: '#64748b' });
  close.onclick = () => wrapper.remove();
  header.append(text, close);

  const host = document.createElement('div');
  Object.assign(host.style, { marginTop: '8px', minHeight: '40px', display: 'flex', justifyContent: 'center' });
  wrapper.append(header, host);
  document.body.append(wrapper);

  try {
    window.google?.accounts?.id?.renderButton?.(host, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      logo_alignment: 'left',
      width: 300
    });
  } catch {
    text.textContent = 'LINE 內建瀏覽器無法自動恢復登入，請改用系統瀏覽器開啟此連結。';
  }
}

function startShareGoogleRecovery() {
  if (!SHARE_PATH || googleRecoveryStarted || readCachedUser()) return;

  const tryStart = (attempt = 0) => {
    if (readCachedUser()) return;
    const identity = window.google?.accounts?.id;
    if (!identity) {
      if (attempt < 40) window.setTimeout(() => tryStart(attempt + 1), 250);
      else renderGoogleFallback();
      return;
    }

    googleRecoveryStarted = true;
    try {
      identity.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: acceptGoogleCredential,
        auto_select: true,
        cancel_on_tap_outside: false
      });
      identity.prompt();
      window.setTimeout(() => {
        if (!readCachedUser()) renderGoogleFallback();
      }, 1800);
    } catch {
      renderGoogleFallback();
    }
  };

  tryStart();
}

installLogoutBridge();
void restoreFromFirstPartySession().then(restored => {
  if (!restored) startShareGoogleRecovery();
});
