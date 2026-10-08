export type QuickActionId = 'home' | 'stats' | 'notifications' | 'stickers' | 'upload' | 'profile' | 'admin' | 'palette';
export type QuickLabelMode = 'icons' | 'labels';

export const MAX_QUICK_ACTIONS = 3;
export const QUICK_ACTIONS_STORAGE_KEY = 'echostars_quick_header_actions_v1';
export const QUICK_LABEL_MODE_STORAGE_KEY = 'echostars_quick_header_label_mode_v1';

const ALLOWED_QUICK_ACTIONS = new Set<QuickActionId>([
  'home', 'stats', 'notifications', 'stickers', 'upload', 'profile', 'admin', 'palette'
]);

export function normalizeQuickActionIds(value: unknown): QuickActionId[] {
  if (!Array.isArray(value)) return [];
  const unique: QuickActionId[] = [];
  for (const raw of value) {
    if (!ALLOWED_QUICK_ACTIONS.has(raw as QuickActionId)) continue;
    const id = raw as QuickActionId;
    if (!unique.includes(id)) unique.push(id);
    if (unique.length >= MAX_QUICK_ACTIONS) break;
  }
  return unique;
}

export function normalizeQuickLabelMode(value: unknown): QuickLabelMode {
  return value === 'labels' ? 'labels' : 'icons';
}

export function readLocalQuickPreferences() {
  if (typeof window === 'undefined') return { quickActionIds: [] as QuickActionId[], quickLabelMode: 'icons' as QuickLabelMode };
  try {
    const quickActionIds = normalizeQuickActionIds(JSON.parse(localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY) || '[]'));
    const quickLabelMode = normalizeQuickLabelMode(localStorage.getItem(QUICK_LABEL_MODE_STORAGE_KEY));
    return { quickActionIds, quickLabelMode };
  } catch {
    return { quickActionIds: [] as QuickActionId[], quickLabelMode: 'icons' as QuickLabelMode };
  }
}

export function writeLocalQuickPreferences(quickActionIds: QuickActionId[], quickLabelMode: QuickLabelMode) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(normalizeQuickActionIds(quickActionIds)));
    localStorage.setItem(QUICK_LABEL_MODE_STORAGE_KEY, normalizeQuickLabelMode(quickLabelMode));
  } catch {}
}

export async function fetchCloudQuickPreferences() {
  const response = await fetch('/api/user-ui-preferences', {
    method: 'GET',
    credentials: 'same-origin',
    cache: 'no-store'
  });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error(`偏好讀取失敗：${response.status}`);
  const data = await response.json().catch(() => ({}));
  const raw = data?.preferences;
  if (!raw) return null;
  return {
    quickActionIds: normalizeQuickActionIds(raw.quickActionIds),
    quickLabelMode: normalizeQuickLabelMode(raw.quickLabelMode),
    updatedAt: Number(raw.updatedAt || 0)
  };
}

export async function saveCloudQuickPreferences(quickActionIds: QuickActionId[], quickLabelMode: QuickLabelMode) {
  const response = await fetch('/api/user-ui-preferences', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quickActionIds: normalizeQuickActionIds(quickActionIds),
      quickLabelMode: normalizeQuickLabelMode(quickLabelMode)
    })
  });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error(`偏好儲存失敗：${response.status}`);
  const data = await response.json().catch(() => ({}));
  return data?.preferences || null;
}
