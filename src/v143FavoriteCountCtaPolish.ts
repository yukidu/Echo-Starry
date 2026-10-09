const STYLE_ID = 'echostars-v143-favorite-count-cta-polish';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
const FAVORITE_DEVICE_KEY = 'echostars_favorite_device_v1';
const favoriteCountOverrides = new Map<string, number>();
let syncFrame = 0;

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .v141-member-teaser-summary .v141-member-teaser-unlock {
      flex: 0 0 100% !important;
      width: 100% !important;
      min-height: 44px !important;
      margin-top: .52rem !important;
      padding: .65rem .9rem !important;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 72%,white) !important;
      border-radius: 15px !important;
      background: var(--color-primary,#c06c84) !important;
      color: #fff !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: .35rem !important;
      font-size: .9rem !important;
      font-weight: 950 !important;
      line-height: 1.15 !important;
      text-decoration: none !important;
      box-shadow: 0 8px 20px color-mix(in srgb,var(--color-primary,#c06c84) 34%,transparent) !important;
      cursor: pointer !important;
      transition: transform .16s ease, filter .16s ease, box-shadow .16s ease !important;
    }
    .v141-member-teaser-summary .v141-member-teaser-unlock:hover {
      filter: brightness(1.08) !important;
      box-shadow: 0 10px 24px color-mix(in srgb,var(--color-primary,#c06c84) 42%,transparent) !important;
    }
    .v141-member-teaser-summary .v141-member-teaser-unlock:active {
      transform: scale(.98) !important;
    }
    .v142-favorites-menu-row .navbar-pin-placeholder[hidden] {
      display: none !important;
    }
    .v142-favorites-menu-row > button {
      min-height: 20px;
      align-items: center !important;
    }
    .v142-favorites-menu-icon {
      width: 1rem !important;
      height: 1rem !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex: 0 0 1rem !important;
      line-height: 1 !important;
      color: currentColor;
    }
    .v142-favorites-menu-icon svg {
      width: 1rem;
      height: 1rem;
      display: block;
    }
    .v143-favorite-count {
      margin-left: -.15rem;
      font-size: .78rem;
      font-weight: 900;
      color: var(--color-primary,#c06c84);
      white-space: nowrap;
    }
    html.dark .v143-favorite-count { color: color-mix(in srgb,var(--color-primary,#c06c84) 78%,white); }
    @media (max-width: 639px) {
      .v141-member-teaser-summary .v141-member-teaser-unlock {
        min-height: 42px !important;
        font-size: .84rem !important;
        border-radius: 14px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function clickGuestProfile() {
  const identity = document.querySelector<HTMLButtonElement>('.navbar-menu-identity');
  if (identity) {
    identity.click();
    return true;
  }
  const login = Array.from(document.querySelectorAll<HTMLButtonElement>('.navbar-menu-footer-button'))
    .find(button => button.textContent?.trim() === '登入');
  if (login) {
    login.click();
    return true;
  }
  return false;
}

function openRegistrationReliable() {
  if (!isGuestMode()) return;
  if (clickGuestProfile()) return;

  const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
  if (!hamburger) return;
  if (hamburger.getAttribute('aria-expanded') !== 'true') hamburger.click();

  let attempt = 0;
  const retry = () => {
    if (clickGuestProfile()) return;
    attempt += 1;
    if (attempt < 8) window.setTimeout(retry, 50);
  };
  window.setTimeout(retry, 0);
}

function patchRegistrationCta() {
  const button = document.querySelector<HTMLButtonElement>('.v141-member-teaser-unlock');
  if (!button) return;
  const label = '註冊會員解鎖更多 →';
  if (button.textContent !== label) button.textContent = label;
  button.setAttribute('aria-label', '註冊會員，了解更多可解鎖內容');
}

function makeBookmarkSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z');
  svg.appendChild(path);
  return svg;
}

function patchFavoritesMenuAlignment() {
  const row = document.querySelector<HTMLElement>('[data-v142-favorites-menu]');
  if (!row) return;
  const spacer = row.querySelector<HTMLElement>('.navbar-pin-placeholder');
  if (spacer) {
    const shouldHide = isGuestMode();
    if (spacer.hidden !== shouldHide) spacer.hidden = shouldHide;
  }
  const icon = row.querySelector<HTMLElement>('.v142-favorites-menu-icon');
  if (icon && icon.dataset.v143VectorIcon !== '1') {
    icon.textContent = '';
    icon.appendChild(makeBookmarkSvg());
    icon.dataset.v143VectorIcon = '1';
  }
}

type CachedTrack = { id?: string; favoriteCount?: number };

function readCachedTracks(): CachedTrack[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    return Array.isArray(parsed?.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

function cachedFavoriteCounts() {
  const counts = new Map<string, number>();
  readCachedTracks().forEach(track => {
    const id = String(track.id || '');
    if (!id) return;
    counts.set(id, Math.max(0, Number(track.favoriteCount || 0)));
  });
  return counts;
}

function writeFavoriteCountToCache(trackId: string, favoriteCount: number) {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    if (!Array.isArray(parsed?.tracks)) return;
    let changed = false;
    parsed.tracks = parsed.tracks.map((track: CachedTrack) => {
      if (String(track.id || '') !== trackId) return track;
      if (Number(track.favoriteCount || 0) === favoriteCount) return track;
      changed = true;
      return { ...track, favoriteCount };
    });
    if (changed) localStorage.setItem(HOME_CACHE_KEY, JSON.stringify(parsed));
  } catch {}
}

function decorateFavoriteCounts() {
  const cacheCounts = cachedFavoriteCounts();
  document.querySelectorAll<HTMLElement>('.audio-card[data-track-id]').forEach(card => {
    const trackId = String(card.dataset.trackId || '');
    if (!trackId) return;
    const favoriteButton = Array.from(card.querySelectorAll<HTMLButtonElement>('button')).find(button => {
      const text = button.textContent?.trim() || '';
      return text === '收藏' || text === '取消收藏' || text.startsWith('收藏(') || text.startsWith('取消收藏(');
    });
    if (!favoriteButton) return;
    const count = favoriteCountOverrides.has(trackId)
      ? favoriteCountOverrides.get(trackId)!
      : (cacheCounts.get(trackId) || 0);
    let badge = favoriteButton.querySelector<HTMLElement>('[data-v143-favorite-count]');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'v143-favorite-count';
      badge.dataset.v143FavoriteCount = '1';
      favoriteButton.appendChild(badge);
    }
    const nextText = `(${count})`;
    if (badge.textContent !== nextText) badge.textContent = nextText;
    favoriteButton.title = `目前共 ${count} 人收藏`;
  });
}

function favoriteIdentity() {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    if (raw) {
      const user = JSON.parse(raw);
      const userEmail = String(user?.email || '').trim().toLowerCase();
      const userId = String(user?.id || '').trim();
      const identifier = userEmail || userId;
      if (identifier) return { identifier, userEmail, userId };
    }
  } catch {}

  let deviceId = '';
  try { deviceId = localStorage.getItem(FAVORITE_DEVICE_KEY) || ''; } catch {}
  if (!deviceId) {
    deviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `favorite-${crypto.randomUUID()}`
      : `favorite-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try { localStorage.setItem(FAVORITE_DEVICE_KEY, deviceId); } catch {}
  }
  return { identifier: deviceId, deviceId };
}

async function persistFavoriteChange(trackId: string, favorite: boolean) {
  try {
    const response = await fetch(`/api/tracks/${encodeURIComponent(trackId)}/favorite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...favoriteIdentity(), favorite })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isFinite(Number(data.favoriteCount))) return;
    const favoriteCount = Math.max(0, Number(data.favoriteCount));
    favoriteCountOverrides.set(trackId, favoriteCount);
    writeFavoriteCountToCache(trackId, favoriteCount);
    queueSync();
  } catch (error) {
    console.warn('Favorite count update failed:', error);
  }
}

function sync() {
  installStyles();
  patchRegistrationCta();
  patchFavoritesMenuAlignment();
  decorateFavoriteCounts();
}

function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    sync();
  });
}

installStyles();
sync();

document.addEventListener('click', event => {
  const target = event.target as Element | null;
  if (!target?.closest('.v141-member-teaser-unlock')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  openRegistrationReliable();
}, true);

window.addEventListener('echostars-favorites-changed', event => {
  const detail = (event as CustomEvent<{ trackId?: string; favorite?: boolean }>).detail;
  const trackId = String(detail?.trackId || '');
  if (!trackId || typeof detail?.favorite !== 'boolean') return;
  void persistFavoriteChange(trackId, detail.favorite);
});

window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY || event.key === 'sq_current_user_v1') queueSync();
});
window.addEventListener('pageshow', queueSync);

function shouldSkipLuckyGridMutations(records: MutationRecord[]) {
  const grid = document.querySelector<HTMLElement>('.audio-card-grid.lucky-spin-active');
  return Boolean(grid && records.length && records.every(record => record.target === grid || grid.contains(record.target)));
}

const observer = new MutationObserver(records => {
  if (shouldSkipLuckyGridMutations(records)) return;
  queueSync();
});
observer.observe(document.body, { childList: true, subtree: true });
