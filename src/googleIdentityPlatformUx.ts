declare global {
  interface Window {
    google?: any;
  }
}

const USER_KEY = 'sq_current_user_v1';
const AUTH_RETURN_KEY = 'echostars_auth_return_v1';
const AUTH_RESTORE_KEY = 'echostars_auth_restore_v1';
const SKIP_FORCED_PROFILE_KEY = 'echostars_skip_forced_profile_once';
const PROFILE_AUTO_OPEN_DISABLED_KEY = 'echostars_profile_auto_open_disabled_v1';
const PROD_HOST = 'echostars.yukidu.workers.dev';

let patched = false;
let oneTapPrompted = false;

function isIOSDevice() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isProductionHost() {
  return window.location.hostname === PROD_HOST;
}

function readCachedUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function enableProgressiveProfileCompletion() {
  try {
    localStorage.setItem(PROFILE_AUTO_OPEN_DISABLED_KEY, '1');
    sessionStorage.setItem(SKIP_FORCED_PROFILE_KEY, '1');
  } catch {
    // Login and browsing must keep working if browser storage is unavailable.
  }
}

function captureReturnContext() {
  try {
    const context = {
      url: `${window.location.pathname}${window.location.search}${window.location.hash}` || '/',
      scrollY: Math.max(0, Math.round(window.scrollY || 0)),
      historyState: window.history.state || null,
      capturedAt: Date.now()
    };
    sessionStorage.setItem(AUTH_RETURN_KEY, JSON.stringify(context));
  } catch {
    // Login must still work when sessionStorage is unavailable.
  }
}

function restoreAfterRedirect() {
  let raw = '';
  try {
    raw = sessionStorage.getItem(AUTH_RESTORE_KEY) || '';
    if (!raw) return;
    sessionStorage.removeItem(AUTH_RESTORE_KEY);
    enableProgressiveProfileCompletion();
    const context = JSON.parse(raw);
    const scrollY = Math.max(0, Number(context?.scrollY) || 0);
    const historyState = context?.historyState;
    if (historyState && typeof historyState === 'object') {
      window.history.replaceState(historyState, '', window.location.href);
    }
    const restore = () => window.scrollTo({ top: scrollY, behavior: 'auto' });
    window.setTimeout(restore, 120);
    window.setTimeout(restore, 700);
  } catch {
    // A stale restore marker is non-fatal.
  }
}

function blockLegacyForcedProfileOpenOnce(event: MouseEvent) {
  try {
    const shouldBlock =
      sessionStorage.getItem(SKIP_FORCED_PROFILE_KEY) === '1' ||
      localStorage.getItem(PROFILE_AUTO_OPEN_DISABLED_KEY) === '1';
    if (!shouldBlock) return;
    if (event.isTrusted) return;
    const target = event.target instanceof Element
      ? event.target.closest('[data-tutorial-target="visitor-profile"]')
      : null;
    if (!target) return;
    sessionStorage.removeItem(SKIP_FORCED_PROFILE_KEY);
    event.preventDefault();
    event.stopImmediatePropagation();
  } catch {
    // Never block normal user interaction when storage is unavailable.
  }
}

document.addEventListener('click', blockLegacyForcedProfileOpenOnce, true);
restoreAfterRedirect();

// v131: incomplete profile data is now progressive rather than a blocking step.
// Existing members immediately get the same behavior without needing to sign in again.
if (readCachedUser()) enableProgressiveProfileCompletion();

function addLoginIntro(buttonHost: HTMLElement) {
  const wrapper = buttonHost.parentElement;
  if (!wrapper || wrapper.querySelector('[data-echostars-login-intro="1"]')) return;

  const intro = document.createElement('div');
  intro.dataset.echostarsLoginIntro = '1';
  Object.assign(intro.style, {
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    padding: '2px 8px 4px'
  });

  const title = document.createElement('div');
  title.textContent = '登入繁星回聲';
  Object.assign(title.style, {
    fontSize: '20px',
    lineHeight: '1.3',
    fontWeight: '900',
    color: 'var(--color-primary, #0f8b83)'
  });

  const description = document.createElement('div');
  description.textContent = '登入後可跨裝置保存學習進度與個人紀錄';
  Object.assign(description.style, {
    marginTop: '7px',
    fontSize: '13px',
    lineHeight: '1.55',
    color: '#475569',
    fontWeight: '700'
  });

  const helper = document.createElement('div');
  helper.textContent = '個人資料可稍後補齊，不會中斷目前瀏覽';
  Object.assign(helper.style, {
    marginTop: '4px',
    fontSize: '12px',
    lineHeight: '1.5',
    color: '#64748b'
  });

  intro.append(title, description, helper);
  wrapper.insertBefore(intro, buttonHost);
}

function addIosRedirectNote(buttonHost: HTMLElement) {
  const wrapper = buttonHost.parentElement;
  if (!wrapper || wrapper.querySelector('[data-echostars-ios-google-note="1"]')) return;
  const note = document.createElement('div');
  note.dataset.echostarsIosGoogleNote = '1';
  note.textContent = 'iPhone / iPad 將前往 Google 驗證，完成後會自動回到目前頁面。';
  Object.assign(note.style, {
    width: '100%',
    boxSizing: 'border-box',
    textAlign: 'center',
    fontSize: '12px',
    lineHeight: '1.5',
    color: 'var(--color-primary, #0f8b83)',
    fontWeight: '700',
    padding: '0 8px'
  });
  wrapper.appendChild(note);
}

function normalizeProgressiveLoginStatus() {
  const statuses = Array.from(
    document.querySelectorAll<HTMLElement>('[data-echostars-google-identity="1"] [role="status"]')
  );
  statuses.forEach(status => {
    const spans = Array.from(status.querySelectorAll('span'));
    const text = spans[spans.length - 1];
    if (text?.textContent?.includes('登入成功，正在開啟個人資料')) {
      text.textContent = '登入成功！正在同步學習紀錄，個人資料可稍後補齊。';
    }
  });
}

function patchGoogleIdentity() {
  if (patched) return true;
  const id = window.google?.accounts?.id;
  if (!id?.initialize || !id?.renderButton) return false;

  const originalInitialize = id.initialize.bind(id);
  const originalRenderButton = id.renderButton.bind(id);
  const originalPrompt = typeof id.prompt === 'function' ? id.prompt.bind(id) : null;
  const ios = isIOSDevice();
  const useRedirect = ios && isProductionHost();

  id.initialize = (config: Record<string, unknown>) => {
    const next: Record<string, unknown> = {
      ...config,
      itp_support: true
    };
    const callback = typeof config.callback === 'function'
      ? config.callback as (response: unknown) => unknown
      : null;
    if (callback) {
      next.callback = (response: unknown) => {
        enableProgressiveProfileCompletion();
        return callback(response);
      };
    }
    if (useRedirect) {
      // Google documents redirect mode as required on iOS because of ITP.
      // The credential is POSTed to the production origin root and handled by
      // worker/iosGoogleRedirectRouter.ts before the SPA asset fallback runs.
      next.ux_mode = 'redirect';
      next.login_uri = `${window.location.origin}/`;
    } else {
      next.ux_mode = 'popup';
      delete next.login_uri;
    }
    return originalInitialize(next);
  };

  id.renderButton = (parent: HTMLElement, options: Record<string, unknown> = {}) => {
    captureReturnContext();
    const result = originalRenderButton(parent, {
      ...options,
      text: 'continue_with',
      shape: 'pill',
      locale: 'zh_TW'
    });

    addLoginIntro(parent);
    if (useRedirect) {
      addIosRedirectNote(parent);
    } else if (!oneTapPrompted && !readCachedUser() && originalPrompt) {
      // Android/desktop: offer One Tap when the user explicitly opens the
      // login panel, while keeping the official Google button as fallback.
      oneTapPrompted = true;
      window.setTimeout(() => {
        try {
          originalPrompt();
        } catch {
          // The visible official button remains available as the fallback.
        }
      }, 60);
    }
    return result;
  };

  patched = true;
  return true;
}

const statusObserver = new MutationObserver(normalizeProgressiveLoginStatus);
statusObserver.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

function startPatching() {
  if (patchGoogleIdentity()) return;
  const startedAt = Date.now();
  const timer = window.setInterval(() => {
    if (patchGoogleIdentity() || Date.now() - startedAt > 15000) {
      window.clearInterval(timer);
    }
  }, 20);
}

startPatching();
