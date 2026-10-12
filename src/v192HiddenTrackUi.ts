import './v192HiddenTrackUi.css';

type VisibilityTrack = {
  id: string;
  title: string;
  speaker: string;
  authorizedOnlyVisible?: boolean;
  hiddenShareAllowed?: boolean;
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V192_HIDDEN_TRACK_UI__?: boolean;
};

const trackMap = new Map<string, VisibilityTrack>();
let lastTrackRefreshAt = 0;
let refreshInFlight: Promise<void> | null = null;

const eyeOffSvg = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M3 3l18 18"></path>
  <path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"></path>
  <path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c5.5 0 9.5 5.1 10 7.3a10.7 10.7 0 0 1-2.3 3.9"></path>
  <path d="M6.6 6.6C4 8.2 2.3 10.5 2 11.3 2.5 13.5 6.5 18 12 18c1 0 1.9-.1 2.8-.4"></path>
</svg>`;

function isHidden(track: VisibilityTrack | undefined | null) {
  return Boolean(track?.authorizedOnlyVisible);
}

function shareBlocked(track: VisibilityTrack | undefined | null) {
  return isHidden(track) && !Boolean(track?.hiddenShareAllowed);
}

function currentUserEmail() {
  try {
    const user = JSON.parse(localStorage.getItem('sq_current_user_v1') || 'null');
    return String(user?.email || '').trim();
  } catch {
    return '';
  }
}

async function refreshTracks(force = false) {
  const now = Date.now();
  if (!force && now - lastTrackRefreshAt < 12_000) return;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`/api/tracks?v192_visibility=${now}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store'
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => []);
      if (!Array.isArray(data)) return;
      trackMap.clear();
      for (const raw of data) {
        if (!raw || typeof raw !== 'object' || !raw.id) continue;
        trackMap.set(String(raw.id), {
          id: String(raw.id),
          title: String(raw.title || ''),
          speaker: String(raw.speaker || ''),
          authorizedOnlyVisible: Boolean(raw.authorizedOnlyVisible),
          hiddenShareAllowed: Boolean(raw.hiddenShareAllowed)
        });
      }
      lastTrackRefreshAt = Date.now();
      decorateAll();
    } catch {
      // Existing app data remains the fallback when the network is unavailable.
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function makeHiddenMarker(className: string) {
  const marker = document.createElement('span');
  marker.className = className;
  marker.setAttribute('data-v192-hidden-marker', '1');
  marker.innerHTML = `${eyeOffSvg}<span>已被隱藏</span>`;
  return marker;
}

function setShareButtonsBlocked(root: Element, blocked: boolean) {
  for (const button of root.querySelectorAll<HTMLButtonElement>('button')) {
    const label = `${button.textContent || ''} ${button.title || ''} ${button.getAttribute('aria-label') || ''}`;
    if (!/分享/.test(label)) continue;
    if (blocked) {
      if (!button.dataset.v192ShareDisabled) {
        button.dataset.v192ShareDisabled = '1';
        button.dataset.v192PreviousTitle = button.title || '';
      }
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
      button.title = '此音檔已被隱藏，目前禁止分享';
      button.classList.add('v192-share-blocked');
    } else if (button.dataset.v192ShareDisabled === '1') {
      button.disabled = false;
      button.removeAttribute('aria-disabled');
      button.title = button.dataset.v192PreviousTitle || '';
      delete button.dataset.v192ShareDisabled;
      delete button.dataset.v192PreviousTitle;
      button.classList.remove('v192-share-blocked');
    }
  }
}

function decorateHomeCards() {
  for (const card of document.querySelectorAll<HTMLElement>('[data-track-id]')) {
    if (!card.classList.contains('audio-card')) continue;
    const id = String(card.dataset.trackId || '').trim();
    const track = trackMap.get(id);
    const hidden = isHidden(track);
    const photoButton = Array.from(card.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => Boolean(button.querySelector('img')));
    const existing = photoButton?.querySelector<HTMLElement>('[data-v192-hidden-marker="1"]');
    if (hidden && photoButton && !existing) {
      photoButton.appendChild(makeHiddenMarker('v192-hidden-home-marker'));
    } else if (!hidden && existing) {
      existing.remove();
    }
    setShareButtonsBlocked(card, shareBlocked(track));
  }
}

function detailContext() {
  const headings = Array.from(document.querySelectorAll<HTMLHeadingElement>('h1'));
  for (const heading of headings) {
    const title = (heading.textContent || '').trim();
    if (!title) continue;
    const candidates = Array.from(trackMap.values()).filter(track => track.title.trim() === title);
    if (candidates.length === 0) continue;
    const root = heading.closest<HTMLElement>('.max-w-2xl');
    if (!root) continue;
    const nearbyText = root.textContent || '';
    const track = candidates.find(item => item.speaker && nearbyText.includes(item.speaker)) || candidates[0];
    return { heading, root, track };
  }
  return null;
}

function decorateDetail() {
  for (const stale of document.querySelectorAll<HTMLElement>('.v192-hidden-detail-marker')) stale.remove();
  const context = detailContext();
  if (!context) return;
  const { heading, root, track } = context;
  if (!isHidden(track)) {
    setShareButtonsBlocked(root, false);
    return;
  }

  const content = heading.parentElement;
  const photoButton = content
    ? Array.from(content.querySelectorAll<HTMLButtonElement>('button')).find(button => {
        const image = button.querySelector('img');
        const label = `${button.getAttribute('aria-label') || ''} ${button.title || ''}`;
        return Boolean(image) && /播放|暫停/.test(label);
      })
    : null;
  const photoWrapper = photoButton?.parentElement;
  if (photoWrapper && !photoWrapper.querySelector('.v192-hidden-detail-marker')) {
    photoWrapper.appendChild(makeHiddenMarker('v192-hidden-detail-marker'));
  }
  setShareButtonsBlocked(root, shareBlocked(track));
}

function findAdminTrackRow(editButton: HTMLButtonElement) {
  let node: HTMLElement | null = editButton.parentElement;
  while (node && node !== document.body) {
    if (node.querySelector('h4') && node.querySelector('button[title="修改錄音檔資料"]')) return node;
    node = node.parentElement;
  }
  return null;
}

function identifyAdminTrack(row: HTMLElement) {
  const title = (row.querySelector('h4')?.textContent || '').trim();
  if (!title) return null;
  const text = row.textContent || '';
  const candidates = Array.from(trackMap.values()).filter(track => track.title.trim() === title);
  return candidates.find(track => track.speaker && text.includes(track.speaker)) || candidates[0] || null;
}

async function toggleHiddenShare(button: HTMLButtonElement, trackId: string) {
  const track = trackMap.get(trackId);
  if (!track || !isHidden(track) || button.disabled) return;
  const next = !Boolean(track.hiddenShareAllowed);
  button.disabled = true;
  try {
    const response = await fetch(`/api/tracks/${encodeURIComponent(trackId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        hiddenShareAllowed: next,
        userEmail: currentUserEmail()
      })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || '分享設定儲存失敗');
    const returned = data?.track || data;
    track.hiddenShareAllowed = Boolean(returned?.hiddenShareAllowed ?? next);
    track.authorizedOnlyVisible = Boolean(returned?.authorizedOnlyVisible ?? track.authorizedOnlyVisible);
    trackMap.set(trackId, track);
    decorateAll();
    window.dispatchEvent(new CustomEvent('echostars:v192-visibility-changed', { detail: { trackId } }));
  } catch (error) {
    alert(error instanceof Error ? error.message : '分享設定儲存失敗，請稍後再試');
  } finally {
    button.disabled = false;
  }
}

function decorateAdminRows() {
  for (const editButton of document.querySelectorAll<HTMLButtonElement>('button[title="修改錄音檔資料"]')) {
    const row = findAdminTrackRow(editButton);
    if (!row) continue;
    const track = identifyAdminTrack(row);
    const info = row.querySelector('h4')?.parentElement as HTMLElement | null;
    if (!track || !info) continue;
    const existing = info.querySelector<HTMLElement>('.v192-admin-share-control');
    if (!isHidden(track)) {
      existing?.remove();
      continue;
    }

    let control = existing;
    if (!control || control.dataset.trackId !== track.id) {
      existing?.remove();
      control = document.createElement('div');
      control.className = 'v192-admin-share-control';
      control.dataset.trackId = track.id;
      control.innerHTML = `
        <span class="v192-admin-share-control__label">隱藏音檔允許分享</span>
        <button type="button" role="switch" class="v192-admin-share-switch" aria-label="切換此隱藏音檔是否允許分享"></button>
      `;
      info.appendChild(control);
      const switchButton = control.querySelector<HTMLButtonElement>('.v192-admin-share-switch');
      switchButton?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        void toggleHiddenShare(switchButton, track.id);
      });
    }

    const switchButton = control.querySelector<HTMLButtonElement>('.v192-admin-share-switch');
    if (switchButton) {
      switchButton.setAttribute('aria-checked', track.hiddenShareAllowed ? 'true' : 'false');
      switchButton.title = track.hiddenShareAllowed ? '目前允許分享，按此關閉' : '目前禁止分享，按此開啟';
    }
  }
}

function decorateAll() {
  decorateHomeCards();
  decorateDetail();
  decorateAdminRows();
}

function scheduleRefresh() {
  window.setTimeout(() => void refreshTracks(true), 600);
  window.setTimeout(() => void refreshTracks(true), 1800);
}

if (!runtime.__ECHOSTARS_V192_HIDDEN_TRACK_UI__) {
  runtime.__ECHOSTARS_V192_HIDDEN_TRACK_UI__ = true;
  void refreshTracks(true);
  window.setInterval(decorateAll, 800);
  window.setInterval(() => void refreshTracks(false), 12_000);
  window.addEventListener('focus', () => void refreshTracks(true));
  window.addEventListener('echostars:v192-visibility-changed', decorateAll as EventListener);
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('button') : null;
    if (!target) return;
    const text = `${target.textContent || ''} ${target.getAttribute('title') || ''}`;
    if (/儲存|修改/.test(text)) scheduleRefresh();
  }, true);
}
