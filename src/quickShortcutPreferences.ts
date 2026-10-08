export type QuickActionId = 'font' | 'theme' | 'stats' | 'notifications' | 'stickers' | 'upload' | 'profile' | 'install' | 'admin' | 'palette';
export type QuickDeviceKind = 'mobile' | 'tablet' | 'desktop';
export type QuickActionPreferences = Record<QuickDeviceKind, QuickActionId[]>;

export const QUICK_ACTIONS_STORAGE_KEY = 'echostars_quick_header_actions_v2';
const LEGACY_QUICK_ACTIONS_STORAGE_KEY = 'echostars_quick_header_actions_v1';

export const QUICK_ACTION_LIMITS: Record<QuickDeviceKind, number> = {
  mobile: 3,
  tablet: 5,
  desktop: Number.MAX_SAFE_INTEGER
};

const ALLOWED_QUICK_ACTIONS: QuickActionId[] = [
  'font', 'theme', 'stats', 'notifications', 'stickers', 'upload', 'profile', 'install', 'admin', 'palette'
];
const ALLOWED_QUICK_ACTION_SET = new Set<QuickActionId>(ALLOWED_QUICK_ACTIONS);

const DEFAULT_QUICK_ACTIONS: QuickActionPreferences = {
  mobile: ['font', 'theme'],
  tablet: ['font', 'theme'],
  desktop: ['font', 'theme']
};

export function quickActionLimitForDevice(device: QuickDeviceKind) {
  return QUICK_ACTION_LIMITS[device];
}

export function normalizeQuickActionIds(value: unknown, device: QuickDeviceKind = 'desktop'): QuickActionId[] {
  if (!Array.isArray(value)) return [];
  const unique: QuickActionId[] = [];
  for (const raw of value) {
    const id = String(raw || '') as QuickActionId;
    if (!ALLOWED_QUICK_ACTION_SET.has(id) || unique.includes(id)) continue;
    unique.push(id);
    if (unique.length >= quickActionLimitForDevice(device)) break;
  }
  return unique;
}

function migrateLegacyList(value: unknown): QuickActionPreferences {
  const legacy = Array.isArray(value)
    ? value.map(item => String(item || '')).filter(item => item !== 'home')
    : [];
  const merged = ['font', 'theme', ...legacy];
  return {
    mobile: normalizeQuickActionIds(merged, 'mobile'),
    tablet: normalizeQuickActionIds(merged, 'tablet'),
    desktop: normalizeQuickActionIds(merged, 'desktop')
  };
}

export function normalizeQuickActionPreferences(value: unknown): QuickActionPreferences {
  if (Array.isArray(value)) return migrateLegacyList(value);
  if (!value || typeof value !== 'object') return { ...DEFAULT_QUICK_ACTIONS };
  const raw = value as Partial<Record<QuickDeviceKind, unknown>>;
  return {
    mobile: normalizeQuickActionIds(raw.mobile, 'mobile'),
    tablet: normalizeQuickActionIds(raw.tablet, 'tablet'),
    desktop: normalizeQuickActionIds(raw.desktop, 'desktop')
  };
}

export function getQuickDeviceKind(): QuickDeviceKind {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'desktop';
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const shortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  const isTouchTablet = navigator.maxTouchPoints > 1 && shortSide >= 600 && !/iPhone|iPod|Mobile/i.test(ua);
  if (isIPad || isAndroidTablet || isTouchTablet) return 'tablet';
  if (/iPhone|iPod|Android.*Mobile|Mobi/i.test(ua) || shortSide < 600) return 'mobile';
  return 'desktop';
}

export function readLocalQuickPreferences(): QuickActionPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_QUICK_ACTIONS };
  try {
    const raw = localStorage.getItem(QUICK_ACTIONS_STORAGE_KEY);
    if (raw) return normalizeQuickActionPreferences(JSON.parse(raw));
    const legacyRaw = localStorage.getItem(LEGACY_QUICK_ACTIONS_STORAGE_KEY);
    if (legacyRaw) {
      const migrated = migrateLegacyList(JSON.parse(legacyRaw));
      writeLocalQuickPreferences(migrated);
      return migrated;
    }
  } catch {}
  return { ...DEFAULT_QUICK_ACTIONS };
}

export function writeLocalQuickPreferences(preferences: QuickActionPreferences) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(QUICK_ACTIONS_STORAGE_KEY, JSON.stringify(normalizeQuickActionPreferences(preferences)));
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
    quickActionIds: normalizeQuickActionPreferences(raw.quickActionIds),
    updatedAt: Number(raw.updatedAt || 0)
  };
}

export async function saveCloudQuickPreferences(preferences: QuickActionPreferences) {
  const normalized = normalizeQuickActionPreferences(preferences);
  const response = await fetch('/api/user-ui-preferences', {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quickActionIds: normalized })
  });
  if (response.status === 401) return undefined;
  if (!response.ok) throw new Error(`偏好儲存失敗：${response.status}`);
  const data = await response.json().catch(() => ({}));
  return data?.preferences || null;
}
