const STYLE_ID = 'echostars-v189-hidden-display-detail-badge';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';

function installHiddenDisplayStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body[data-v189-hidden-detail="1"] main div.relative.mb-3:has(> button[aria-label="開始播放"])::before,
    body[data-v189-hidden-detail="1"] main div.relative.mb-3:has(> button[aria-label="暫停播放"])::before {
      content: '隱藏顯示';
      position: absolute;
      right: calc(100% + .55rem);
      top: 50%;
      transform: translateY(-50%);
      z-index: 30;
      box-sizing: border-box;
      width: 4.3rem;
      min-height: 4.8rem;
      padding: 2.75rem .25rem .45rem;
      border-radius: 1rem;
      border: 1px solid rgba(255,255,255,.35);
      background-color: rgba(15,23,42,.72);
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68'/%3E%3Cpath d='M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61'/%3E%3Cline x1='2' x2='22' y1='2' y2='22'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: center .55rem;
      background-size: 1.9rem 1.9rem;
      color: white;
      box-shadow: 0 8px 24px rgba(15,23,42,.24);
      font-size: .64rem;
      font-weight: 900;
      line-height: 1.1;
      letter-spacing: .02em;
      text-align: center;
      white-space: nowrap;
      pointer-events: none;
      backdrop-filter: blur(2px);
    }

    @media (min-width: 640px) {
      body[data-v189-hidden-detail="1"] main div.relative.mb-3:has(> button[aria-label="開始播放"])::before,
      body[data-v189-hidden-detail="1"] main div.relative.mb-3:has(> button[aria-label="暫停播放"])::before {
        right: calc(100% + 1rem);
        width: 4.8rem;
        min-height: 5.3rem;
        padding-top: 3rem;
        background-size: 2.2rem 2.2rem;
        font-size: .72rem;
      }
    }
  `;
  document.head.appendChild(style);
}

function currentDetailTrackId() {
  const state = window.history.state as { echostars?: boolean; view?: string; trackId?: string } | null;
  if (state?.echostars && state.view === 'detail' && state.trackId) return String(state.trackId);

  const params = new URLSearchParams(window.location.search);
  const queryTrack = params.get('track');
  return queryTrack ? String(queryTrack) : '';
}

function isAuthorizedOnlyTrack(trackId: string) {
  if (!trackId) return false;
  try {
    const cached = JSON.parse(window.localStorage.getItem(HOME_CACHE_KEY) || 'null');
    const tracks = Array.isArray(cached?.tracks) ? cached.tracks : [];
    const track = tracks.find((item: any) => String(item?.id || '') === trackId);
    return Boolean(track?.authorizedOnlyVisible);
  } catch {
    return false;
  }
}

function syncHiddenDisplayDetailBadge() {
  const trackId = currentDetailTrackId();
  document.body.dataset.v189HiddenDetail = isAuthorizedOnlyTrack(trackId) ? '1' : '0';
}

function scheduleHiddenDisplaySync() {
  [0, 80, 250, 700, 1500].forEach(delay => {
    window.setTimeout(syncHiddenDisplayDetailBadge, delay);
  });
}

installHiddenDisplayStyle();

const nativePushState = window.history.pushState.bind(window.history);
window.history.pushState = ((...args: Parameters<History['pushState']>) => {
  const result = nativePushState(...args);
  scheduleHiddenDisplaySync();
  return result;
}) as History['pushState'];

const nativeReplaceState = window.history.replaceState.bind(window.history);
window.history.replaceState = ((...args: Parameters<History['replaceState']>) => {
  const result = nativeReplaceState(...args);
  scheduleHiddenDisplaySync();
  return result;
}) as History['replaceState'];

window.addEventListener('popstate', scheduleHiddenDisplaySync);
window.addEventListener('pageshow', scheduleHiddenDisplaySync);
window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY) scheduleHiddenDisplaySync();
});

scheduleHiddenDisplaySync();
