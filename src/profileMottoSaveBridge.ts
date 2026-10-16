const PROFILE_PATH = /^\/api\/users\/[^/]+$/;
let pendingMotto: string | null = null;

export function setPendingProfileMotto(value: string | null) {
  pendingMotto = value == null ? null : String(value).trim();
}

export function getPendingProfileMotto() {
  return pendingMotto;
}

export function enhanceProfileSaveRequest(url: string, options?: RequestInit) {
  const method = String(options?.method || 'GET').toUpperCase();
  let pathname = '';
  try { pathname = new URL(url, window.location.origin).pathname; } catch { return { options, motto: null as string | null }; }
  if (method !== 'PUT' || !PROFILE_PATH.test(pathname) || pendingMotto === null) {
    return { options, motto: null as string | null };
  }

  let body: Record<string, unknown> | null = null;
  try {
    if (typeof options?.body === 'string') body = JSON.parse(options.body);
  } catch {
    body = null;
  }
  if (!body || Array.isArray(body)) return { options, motto: null as string | null };

  const motto = pendingMotto;
  const headers = new Headers(options?.headers || {});
  headers.set('Content-Type', 'application/json');
  return {
    motto,
    options: {
      ...options,
      headers,
      body: JSON.stringify({ ...body, motto })
    } satisfies RequestInit
  };
}

export function commitProfileMottoSave(motto: string | null) {
  if (motto === null) return;
  if (pendingMotto === motto) pendingMotto = null;
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    if (raw) {
      const user = JSON.parse(raw);
      if (user && typeof user === 'object') {
        user.motto = motto;
        localStorage.setItem('sq_current_user_v1', JSON.stringify(user));
      }
    }
  } catch {}
  window.dispatchEvent(new CustomEvent('echostars:profile-motto-saved', { detail: { motto } }));
}
