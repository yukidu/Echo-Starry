const VISITOR_ROLE_CACHE_KEY = 'echostars_visitor_role_text_v1';
const VISITOR_ROLE_SESSION_KEY = 'echostars_visitor_role_loaded_v1';
export const DEFAULT_VISITOR_ROLE_TEXT = '訪客';
export const VISITOR_ROLE_MAX_LENGTH = 12;

export function normalizeVisitorRoleText(value: unknown) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return DEFAULT_VISITOR_ROLE_TEXT;
  return Array.from(text).slice(0, VISITOR_ROLE_MAX_LENGTH).join('');
}

export function applyVisitorRoleText(value: unknown) {
  const visitorRoleText = normalizeVisitorRoleText(value);
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--echostars-visitor-role-text', JSON.stringify(visitorRoleText));
  }
  if (typeof window !== 'undefined') {
    try { localStorage.setItem(VISITOR_ROLE_CACHE_KEY, visitorRoleText); } catch {}
    window.dispatchEvent(new CustomEvent('echostars:visitor-role-changed', { detail: { visitorRoleText } }));
  }
  return visitorRoleText;
}

export function readCachedVisitorRoleText() {
  if (typeof window === 'undefined') return DEFAULT_VISITOR_ROLE_TEXT;
  try { return normalizeVisitorRoleText(localStorage.getItem(VISITOR_ROLE_CACHE_KEY)); }
  catch { return DEFAULT_VISITOR_ROLE_TEXT; }
}

export async function hydrateVisitorRoleText(force = false) {
  const cached = applyVisitorRoleText(readCachedVisitorRoleText());
  if (typeof window === 'undefined') return cached;
  if (!force && sessionStorage.getItem(VISITOR_ROLE_SESSION_KEY) === '1') return cached;

  try {
    const response = await fetch('/api/site-ui/visitor-role');
    if (!response.ok) return cached;
    const data = await response.json().catch(() => ({}));
    sessionStorage.setItem(VISITOR_ROLE_SESSION_KEY, '1');
    return applyVisitorRoleText(data.visitorRoleText);
  } catch {
    return cached;
  }
}

export async function saveVisitorRoleText(value: unknown) {
  const visitorRoleText = normalizeVisitorRoleText(value);
  const response = await fetch('/api/site-ui/visitor-role', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visitorRoleText })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '無法儲存訪客顯示文字');
  sessionStorage.setItem(VISITOR_ROLE_SESSION_KEY, '1');
  return applyVisitorRoleText(data.visitorRoleText || visitorRoleText);
}
