import { withGoogleLoginDeadline } from './googleLoginDeadline';
import { GOOGLE_CLIENT_ID } from './config/auth';

declare global {
  interface Window {
    google?: any;
    __echostarsFetchPatched?: boolean;
  }
}

const USER_KEY = 'sq_current_user_v1';
const VISITOR_KEY = 'sq_visitor_identity_v1';
const PLAYBACK_PREFIX = 'sq_audio_progress_v1_';
const CLAIM_MARKER_PREFIX = 'echostars_playback_claim_v1';
const SESSION_CHECK_KEY = 'echostars_auth_session_checked_at';
const SESSION_CHECK_TTL = 10 * 60 * 1000;
const originalFetch = window.fetch.bind(window);

const REQUIRED_PROFILE_FIELDS = [
  'name',
  'amwayId',
  'phone',
  'residence',
  'center',
  'rank',
  'joinReason',
  'stayReason',
  'sponsor',
  'platinumUpline',
  'diamondUpline',
  'birthday'
] as const;

type LocalPlaybackRow = {
  trackId: string;
  currentTime: number;
  duration: number;
  completed: boolean;
  percentage: number;
};

function readCachedUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function profileNeedsCompletion(user: any | null) {
  if (!user) return false;
  return REQUIRED_PROFILE_FIELDS.some(field => String(user?.[field] ?? '').trim() === '');
}

function authToken() {
  const user = readCachedUser();
  return typeof user?._authToken === 'string' ? user._authToken : '';
}

function readDeviceId() {
  try {
    const raw = localStorage.getItem(VISITOR_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return typeof parsed?.deviceId === 'string' ? parsed.deviceId.trim() : '';
  } catch {
    return '';
  }
}

function collectLocalPlayback(): LocalPlaybackRow[] {
  const rows: LocalPlaybackRow[] = [];
  try {
    for (let index = 0; index < localStorage.length && rows.length < 300; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(PLAYBACK_PREFIX)) continue;
      const trackId = key.slice(PLAYBACK_PREFIX.length).trim();
      if (!trackId) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw);
      rows.push({
        trackId,
        currentTime: Math.max(0, Number(value?.currentTime) || 0),
        duration: Math.max(0, Number(value?.duration) || 0),
        completed: Boolean(value?.completed),
        percentage: Math.max(0, Math.min(100, Number(value?.percentage) || 0))
      });
    }
  } catch {
    // A malformed local row must never block login or the rest of the app.
  }
  return rows;
}

function playbackFingerprint(rows: LocalPlaybackRow[]) {
  if (!rows.length) return 'empty';
  return rows
    .slice()
    .sort((a, b) => a.trackId.localeCompare(b.trackId))
    .map(row => [
      row.trackId,
      Math.round(row.currentTime),
      Math.round(row.duration),
      row.completed ? 1 : 0,
      Math.round(row.percentage * 10) / 10
    ].join(':'))
    .join('|');
}

async function claimLocalPlayback(user: any) {
  const token = typeof user?._authToken === 'string' ? user._authToken : '';
  const memberId = String(user?.id || '').trim();
  const deviceId = readDeviceId();
  if (!token || !memberId || !deviceId) return;

  const localPlayback = collectLocalPlayback();
  const fingerprint = playbackFingerprint(localPlayback);
  const markerKey = `${CLAIM_MARKER_PREFIX}_${memberId}_${deviceId}`;
  if (localStorage.getItem(markerKey) === fingerprint || sessionStorage.getItem(markerKey) === 'conflict') return;

  try {
    const response = await originalFetch('/api/playback/claim-local', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ deviceId, localPlayback }),
      cache: 'no-store'
    });

    if (response.ok) {
      // Store the exact local progress state that has already been imported.
      // If the member later listens while logged out, the fingerprint changes
      // and the next verified login safely imports the new progress again.
      localStorage.setItem(markerKey, fingerprint);
      return;
    }

    if (response.status === 409) {
      // Shared devices are intentionally not transferred between accounts.
      // Remember the conflict only for this tab/session to avoid repeated writes.
      sessionStorage.setItem(markerKey, 'conflict');
    }
  } catch {
    // Best effort. Keep the marker stale so a later online load can retry.
  }
}

function sameOriginApi(input: RequestInfo | URL) {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    const url = new URL(raw, window.location.href);
    return url.origin === window.location.origin && url.pathname.startsWith('/api/');
  } catch {
    return false;
  }
}

function installAuthenticatedFetch() {
  if (window.__echostarsFetchPatched) return;
  window.__echostarsFetchPatched = true;

  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const token = authToken();
    if (!token || !sameOriginApi(input)) return originalFetch(input, init);

    const baseHeaders = input instanceof Request ? input.headers : undefined;
    const headers = new Headers(init?.headers || baseHeaders || undefined);
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);

    if (input instanceof Request) {
      return originalFetch(new Request(input, { ...init, headers }));
    }
    return originalFetch(input, { ...init, headers });
  }) as typeof window.fetch;
}

async function validateCachedSession() {
  const user = readCachedUser();
  if (!user) return;

  // Security migration: legacy localStorage identities were never backed by a
  // verified Google session. Force one clean Google sign-in after this release.
  if (!user._authToken) {
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_CHECK_KEY);
    return;
  }

  const lastChecked = Number(sessionStorage.getItem(SESSION_CHECK_KEY) || 0);
  if (Date.now() - lastChecked < SESSION_CHECK_TTL) {
    await claimLocalPlayback(user);
    return;
  }

  try {
    const response = await originalFetch('/api/auth/session', {
      headers: { Authorization: `Bearer ${user._authToken}` },
      cache: 'no-store'
    });
    if (!response.ok) {
      localStorage.removeItem(USER_KEY);
      sessionStorage.removeItem(SESSION_CHECK_KEY);
      window.location.reload();
      return;
    }
    sessionStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));
    await claimLocalPlayback(user);
  } catch {
    // Offline use remains available. Do not sign a user out merely because the
    // network is temporarily unavailable. The claim will retry when online.
  }
}

let initialized = false;
let loginInFlight = false;
let activeStatus: HTMLElement | null = null;
let incompleteProfilePromptedThisLoad = false;
let incompleteProfileEditStartedThisLoad = false;

function setStatus(message: string, isError = false) {
  if (!activeStatus) return;
  activeStatus.replaceChildren();
  activeStatus.style.display = message ? 'flex' : 'none';
  if (!message) return;

  const isLoading = !isError && (message.includes('登入中') || message.includes('正在'));
  activeStatus.style.alignItems = 'center';
  activeStatus.style.justifyContent = 'center';
  activeStatus.style.gap = isLoading ? '14px' : '0';
  activeStatus.style.width = '100%';
  activeStatus.style.boxSizing = 'border-box';
  activeStatus.style.padding = isLoading ? '18px 14px' : '8px 10px';
  activeStatus.style.borderRadius = '18px';
  activeStatus.style.fontSize = isLoading ? '26px' : '13px';
  activeStatus.style.lineHeight = '1.25';
  activeStatus.style.fontWeight = isLoading ? '900' : '700';
  activeStatus.style.letterSpacing = isLoading ? '0.08em' : '0';
  activeStatus.style.textAlign = 'center';
  activeStatus.style.color = isError ? '#e11d48' : 'var(--color-primary, #0f8b83)';
  activeStatus.style.background = isLoading ? 'rgba(15, 139, 131, 0.08)' : 'transparent';
  activeStatus.style.border = isLoading ? '2px solid var(--color-primary, #0f8b83)' : '0';
  activeStatus.style.boxShadow = isLoading ? '0 10px 28px rgba(15, 23, 42, 0.12)' : 'none';

  if (isLoading) {
    const spinner = document.createElement('span');
    spinner.setAttribute('aria-hidden', 'true');
    spinner.className = 'animate-spin';
    spinner.style.width = '30px';
    spinner.style.height = '30px';
    spinner.style.flex = '0 0 auto';
    spinner.style.borderRadius = '9999px';
    spinner.style.border = '4px solid rgba(15, 139, 131, 0.22)';
    spinner.style.borderTopColor = 'var(--color-primary, #0f8b83)';
    activeStatus.appendChild(spinner);
  }

  const text = document.createElement('span');
  text.textContent = message;
  activeStatus.appendChild(text);
}

async function handleGoogleCredential(response: any) {
  const credential = String(response?.credential || '');
  if (!credential) {
    setStatus('Google 沒有回傳身分憑證，請再試一次。', true);
    return;
  }

  if (loginInFlight) return;
  loginInFlight = true;
  setStatus('登入中請稍後');
  try {
    const { result, data } = await withGoogleLoginDeadline(async signal => {
      const result = await originalFetch('/api/users/google-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential }),
        signal,
        cache: 'no-store'
      });
      const data = await result.json().catch(() => ({}));
      return { result, data };
    });
    if (!result.ok || !data?.user || !data?.authToken) {
      throw new Error(data?.error || 'Google 登入失敗，請稍後重試。');
    }

    const user = {
      ...data.user,
      _authToken: data.authToken,
      _sessionExpiresAt: data.sessionExpiresAt
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    sessionStorage.setItem(SESSION_CHECK_KEY, String(Date.now()));
    setStatus(profileNeedsCompletion(user) ? '登入成功，正在開啟個人資料…' : '登入成功，正在同步學習紀錄…');
    // The next page validates the session and retries playback import.
    // A slow optional import must never hold a verified login on this screen.
    window.location.reload();
  } catch (error) {
    console.error('Secure Google sign-in failed:', error);
    setStatus(error instanceof Error ? error.message : 'Google 登入失敗，請稍後重試。', true);
  } finally {
    loginInFlight = false;
  }
}

function ensureGoogleInitialized() {
  if (initialized) return true;
  if (!window.google?.accounts?.id) return false;
  try {
    window.google.accounts.id.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: handleGoogleCredential,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    initialized = true;
    return true;
  } catch (error) {
    console.error('Google Identity Services initialization failed:', error);
    return false;
  }
}

function isLegacyGoogleButton(button: HTMLButtonElement) {
  const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
  return text.includes('使用 Google 帳戶登入 / 註冊') || text.includes('正在連線至 Google 授權');
}

function simplifyLoginPanel(legacyButton: HTMLButtonElement) {
  const actionCard = legacyButton.parentElement;
  const loginContainer = actionCard?.parentElement;
  if (!actionCard || !loginContainer) return;

  Array.from(loginContainer.children).forEach(child => {
    if (child !== actionCard) (child as HTMLElement).style.display = 'none';
  });
  Array.from(actionCard.children).forEach(child => {
    if (child === legacyButton || (child as HTMLElement).dataset?.echostarsGoogleIdentity === '1') return;
    const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
    if (
      text.includes('使用 Google 官方帳號進行安全驗證與身分綁定') ||
      text.includes('初次登入將自動建立專屬帳號')
    ) (child as HTMLElement).style.display = 'none';
  });
  actionCard.style.padding = '16px';
  loginContainer.style.paddingTop = '24px';
  loginContainer.style.paddingBottom = '24px';
}

function renderOfficialButton(legacyButton: HTMLButtonElement) {
  if (legacyButton.dataset.googleIdentityReplaced === '1') return;
  legacyButton.dataset.googleIdentityReplaced = '1';

  const wrapper = document.createElement('div');
  wrapper.dataset.echostarsGoogleIdentity = '1';
  wrapper.style.width = '100%';
  wrapper.style.display = 'flex';
  wrapper.style.flexDirection = 'column';
  wrapper.style.alignItems = 'center';
  wrapper.style.gap = '10px';

  const buttonHost = document.createElement('div');
  buttonHost.style.minHeight = '44px';
  buttonHost.style.display = 'flex';
  buttonHost.style.justifyContent = 'center';
  buttonHost.style.alignItems = 'center';
  buttonHost.style.width = '100%';

  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.style.display = 'none';
  status.style.lineHeight = '1.5';
  status.style.textAlign = 'center';
  wrapper.append(buttonHost, status);
  legacyButton.insertAdjacentElement('beforebegin', wrapper);
  legacyButton.style.display = 'none';
  activeStatus = status;
  simplifyLoginPanel(legacyButton);

  const sdkStartedAt = Date.now();
  const render = () => {
    if (!wrapper.isConnected) return;
    if (!ensureGoogleInitialized()) {
      if (Date.now() - sdkStartedAt >= 15000) {
        setStatus('Google 登入元件載入逾時，請重新整理後再試。', true);
        return;
      }
      setTimeout(render, 250);
      return;
    }
    const measured = Math.round(legacyButton.getBoundingClientRect().width || wrapper.getBoundingClientRect().width || 320);
    const width = Math.max(240, Math.min(400, measured));
    try {
      window.google.accounts.id.renderButton(buttonHost, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'left',
        width
      });
    } catch (error) {
      console.error('Google sign-in button render failed:', error);
      setStatus('Google 登入元件載入失敗，請重新整理後再試。', true);
    }
  };
  render();
}

function resumeIncompleteProfileEdit() {
  const cachedUser = readCachedUser();
  if (!profileNeedsCompletion(cachedUser) || incompleteProfilePromptedThisLoad) return;

  const profileButtons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-tutorial-target="visitor-profile"]')
  );
  const profileButton = profileButtons.find(button => button.offsetParent !== null) || profileButtons[0];
  if (!profileButton) return;

  incompleteProfilePromptedThisLoad = true;
  profileButton.click();
}

function normalizeProfileModalUx() {
  const roots = Array.from(document.querySelectorAll<HTMLElement>('.app-modal-overlay'));
  const profileRoot = roots.find(root => root.querySelector('h2')?.textContent?.trim() === '個人中心');
  if (!profileRoot) return;

  const logoutButton = profileRoot.querySelector<HTMLButtonElement>('button[title="登出目前帳號"]');
  if (logoutButton && logoutButton.dataset.echostarsHiddenLogout !== '1') {
    logoutButton.dataset.echostarsHiddenLogout = '1';
    logoutButton.style.display = 'none';
  }

  const headerButtons = Array.from(profileRoot.querySelectorAll<HTMLButtonElement>('button'));
  const saveButton = headerButtons.find(button => ['儲存', '儲存資料'].includes(button.textContent?.trim() || ''));
  if (saveButton && saveButton.dataset.echostarsProminentSave !== '1') {
    // This must be strictly one-time. Changing textContent triggers the same
    // childList observer; reapplying it on every callback caused v74's edit-mode
    // infinite mutation loop and made the modal look completely frozen.
    saveButton.dataset.echostarsProminentSave = '1';
    saveButton.textContent = '儲存資料';
    saveButton.style.background = '#10b981';
    saveButton.style.color = '#ffffff';
    saveButton.style.padding = '10px 16px';
    saveButton.style.borderRadius = '14px';
    saveButton.style.border = '2px solid rgba(255,255,255,0.55)';
    saveButton.style.fontSize = '14px';
    saveButton.style.fontWeight = '900';
    saveButton.style.boxShadow = '0 8px 22px rgba(16,185,129,0.35)';
  }

  if (!incompleteProfilePromptedThisLoad || incompleteProfileEditStartedThisLoad) return;
  const editButton = headerButtons.find(button => button.textContent?.trim() === '修改');
  if (!editButton) return;

  incompleteProfileEditStartedThisLoad = true;
  editButton.click();
}

function scanUi() {
  if (!readCachedUser()) {
    document.querySelectorAll('button').forEach(node => {
      const button = node as HTMLButtonElement;
      if (isLegacyGoogleButton(button)) renderOfficialButton(button);
    });
  }
  resumeIncompleteProfileEdit();
  normalizeProfileModalUx();
}

installAuthenticatedFetch();
void validateCachedSession();

const observer = new MutationObserver(scanUi);
observer.observe(document.documentElement, { childList: true, subtree: true });
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scanUi, { once: true });
} else {
  scanUi();
}