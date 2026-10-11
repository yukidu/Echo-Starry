import './v181HomeToolbarDislike.css';

const PRODUCTION_HOST = 'echostars.yukidu.workers.dev';
const PREVIEW_STORAGE_PREFIX = 'preview-disliked-speakers-v2';
const FAVORITES_KEY = 'echostars_favorite_track_ids_v1';
const hiddenSpeakers = new Set<string>();
const trackSpeakerById = new Map<string, string>();
const trackCatalogById = new Map<string, { id: string; title: string; speaker: string; speakerAvatar: string }>();
let trackSpeakerLoad: Promise<void> | null = null;
let lastMemberIdentity = '__initial__';
let observer: MutationObserver | null = null;

function isPreviewHost() {
  const host = window.location.hostname;
  return host !== PRODUCTION_HOST && host.endsWith('-echostars.yukidu.workers.dev');
}

function readMemberIdentity() {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    if (!raw) return '';
    const user = JSON.parse(raw);
    return String(user?.id || user?.email || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function previewStorageKey() {
  return `${PREVIEW_STORAGE_PREFIX}:${readMemberIdentity() || 'preview-guest'}`;
}

function readPreviewHiddenSpeakers() {
  try {
    const parsed = JSON.parse(localStorage.getItem(previewStorageKey()) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).map(name => name.trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writePreviewHiddenSpeakers() {
  try {
    localStorage.setItem(previewStorageKey(), JSON.stringify(Array.from(hiddenSpeakers)));
  } catch {}
}

function readFavoriteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function syncAudioPlayingState() {
  const playing = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'))
    .some(audio => !audio.paused && !audio.ended && audio.currentSrc !== '');
  document.documentElement.dataset.echostarsAudioPlaying = playing ? 'true' : 'false';
}

function cardWrapper(card: HTMLElement) {
  return card.closest<HTMLElement>('.lucky-card') || card;
}

function trackIdFromCard(card: HTMLElement) {
  return String(card.dataset.trackId || '').trim();
}

async function loadTrackSpeakerMap(force = false) {
  if (trackSpeakerLoad && !force) return trackSpeakerLoad;
  trackSpeakerLoad = (async () => {
    const response = await fetch('/api/tracks', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`tracks: ${response.status}`);
    const tracks = await response.json().catch(() => []);
    if (!Array.isArray(tracks)) throw new Error('tracks response is not an array');
    trackSpeakerById.clear();
    trackCatalogById.clear();
    tracks.forEach((track: any) => {
      const id = String(track?.id || '').trim();
      const speaker = String(track?.speaker || '').trim();
      if (!id) return;
      if (speaker) trackSpeakerById.set(id, speaker);
      trackCatalogById.set(id, {
        id,
        title: String(track?.title || '未命名音檔').trim(),
        speaker,
        speakerAvatar: String(track?.speakerAvatar || '').trim()
      });
    });
  })();
  try {
    await trackSpeakerLoad;
  } finally {
    trackSpeakerLoad = null;
  }
}

function speakerNameFromCard(card: HTMLElement) {
  const trackId = trackIdFromCard(card);
  return trackId ? String(trackSpeakerById.get(trackId) || '').trim() : '';
}

async function resolveSpeakerNameFromCard(card: HTMLElement) {
  let speakerName = speakerNameFromCard(card);
  if (speakerName) return speakerName;
  await loadTrackSpeakerMap(true);
  speakerName = speakerNameFromCard(card);
  return speakerName;
}

function syncCardVisibility(card: HTMLElement) {
  const speakerName = speakerNameFromCard(card);
  if (!speakerName) return;
  const wrapper = cardWrapper(card);
  if (hiddenSpeakers.has(speakerName)) {
    wrapper.style.display = 'none';
    wrapper.dataset.echostarsMemberHidden = 'true';
  } else if (wrapper.dataset.echostarsMemberHidden === 'true') {
    wrapper.style.removeProperty('display');
    delete wrapper.dataset.echostarsMemberHidden;
  }
}

function dislikeIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M17 14V2 M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22H9.5a2.5 2.5 0 0 1-.5-3.88Z');
  svg.append(path);
  return svg;
}

function bookmarkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M6 3a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v19l-6-4-6 4Z');
  svg.append(path);
  return svg;
}

function shieldAlertIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('v181-confirm-icon');
  const shield = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  shield.setAttribute('d', 'M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3v8Z');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', 'M12 8v4');
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  dot.setAttribute('d', 'M12 16h.01');
  svg.append(shield, line, dot);
  return svg;
}

function styledDislikeConfirm(message: string) {
  return new Promise<boolean>(resolve => {
    document.querySelector('[data-v181-confirm-layer]')?.remove();

    const layer = document.createElement('div');
    layer.className = 'v181-confirm-layer';
    layer.dataset.v181ConfirmLayer = 'true';
    layer.setAttribute('role', 'presentation');

    const card = document.createElement('div');
    card.className = 'v181-confirm-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', '不喜歡確認');
    card.setAttribute('aria-describedby', 'v181-confirm-message');

    const icon = shieldAlertIcon();
    const body = document.createElement('div');
    body.className = 'v181-confirm-body';

    const copy = document.createElement('p');
    copy.id = 'v181-confirm-message';
    copy.className = 'v181-confirm-message';
    copy.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'v181-confirm-actions';

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'v181-confirm-button v181-confirm-cancel';
    cancel.textContent = '取消';

    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'v181-confirm-button v181-confirm-ok';
    confirm.textContent = '確定';

    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      document.removeEventListener('keydown', onKeydown, true);
      layer.remove();
      resolve(value);
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(false);
      }
    };

    cancel.addEventListener('click', () => finish(false));
    confirm.addEventListener('click', () => finish(true));
    layer.addEventListener('click', event => {
      if (event.target === layer) finish(false);
    });
    document.addEventListener('keydown', onKeydown, true);

    actions.append(cancel, confirm);
    body.append(copy, actions);
    card.append(icon, body);
    layer.append(card);
    document.body.append(layer);
    window.setTimeout(() => confirm.focus(), 0);
  });
}

async function persistDislike(speakerName: string) {
  if (isPreviewHost()) {
    hiddenSpeakers.add(speakerName);
    writePreviewHiddenSpeakers();
    return;
  }

  const response = await fetch(`/api/member-hidden-speakers/${encodeURIComponent(speakerName)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('請先登入會員後再使用「不喜歡」。');
  if (!response.ok) throw new Error(data?.error || '設定失敗，請稍後再試。');
  hiddenSpeakers.add(speakerName);
}

async function cancelHiddenSpeaker(speakerName: string) {
  if (isPreviewHost()) {
    hiddenSpeakers.delete(speakerName);
    writePreviewHiddenSpeakers();
  } else {
    const response = await fetch(`/api/member-hidden-speakers/${encodeURIComponent(speakerName)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || '取消隱藏失敗');
    hiddenSpeakers.delete(speakerName);
  }
  syncAllCards();
  window.dispatchEvent(new CustomEvent('echostars:member-hidden-speakers-changed', {
    detail: { speakerName, hidden: false }
  }));
}

async function handleDislike(card: HTMLElement, button: HTMLButtonElement) {
  if (button.disabled) return;

  if (!isPreviewHost() && !readMemberIdentity()) {
    window.alert('請先登入會員後再使用「不喜歡」。');
    return;
  }

  let speakerName = '';
  try {
    speakerName = await resolveSpeakerNameFromCard(card);
  } catch (error) {
    console.warn('Failed to resolve speaker name:', error);
  }
  if (!speakerName) {
    window.alert('目前無法取得演講者姓名，請稍後再試。');
    return;
  }

  if (!await styledDislikeConfirm(`確定不喜歡演講者「${speakerName}」嗎？`)) return;

  button.disabled = true;
  const label = button.querySelector('span');
  if (label) label.textContent = '處理中…';
  try {
    await persistDislike(speakerName);
    syncAllCards();
    window.dispatchEvent(new CustomEvent('echostars:member-hidden-speakers-changed', {
      detail: { speakerName, hidden: true }
    }));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : '設定失敗，請稍後再試。');
  } finally {
    button.disabled = false;
    if (label) label.textContent = '不喜歡';
  }
}

function findMoreMenu(card: HTMLElement) {
  const moreButton = card.querySelector<HTMLButtonElement>('button[aria-label="更多功能"]');
  if (!moreButton || moreButton.getAttribute('aria-expanded') !== 'true') return null;
  const shell = moreButton.parentElement;
  if (!shell) return null;
  return Array.from(shell.children).find(child =>
    child instanceof HTMLElement && child !== moreButton && child.querySelector('button')
  ) as HTMLElement | undefined || null;
}

function installDislikeButton(card: HTMLElement) {
  const menu = findMoreMenu(card);
  if (!menu || menu.querySelector('[data-v181-dislike]')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v181-dislike-menu-item';
  button.dataset.v181Dislike = 'true';
  button.append(dislikeIcon());
  const label = document.createElement('span');
  label.textContent = '不喜歡';
  button.append(label);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    void handleDislike(card, button);
  });
  menu.append(button);
}

function removeFavorite(trackId: string) {
  try {
    const next = readFavoriteIds().filter(id => id !== trackId);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('echostars-favorites-changed', {
      detail: { trackId, favorite: false }
    }));
  } catch {}
}

function closeFavoritesPage() {
  document.querySelector('[data-v183-favorites-page]')?.remove();
  document.documentElement.classList.remove('v183-favorites-open');
}

function createSectionTitle(text: string) {
  const title = document.createElement('h2');
  title.className = 'v183-favorites-section-title';
  title.textContent = text;
  return title;
}

async function openFavoritesPage() {
  closeFavoritesPage();
  try {
    await loadTrackSpeakerMap();
    await loadMemberHiddenSpeakers();
  } catch (error) {
    console.warn('Failed to prepare favorites page:', error);
  }

  const layer = document.createElement('div');
  layer.className = 'v183-favorites-page';
  layer.dataset.v183FavoritesPage = 'true';

  const header = document.createElement('div');
  header.className = 'v183-favorites-header';
  const title = document.createElement('h1');
  title.textContent = '我的收藏';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'v183-favorites-close';
  close.setAttribute('aria-label', '關閉我的收藏');
  close.textContent = '×';
  close.addEventListener('click', closeFavoritesPage);
  header.append(title, close);

  const content = document.createElement('div');
  content.className = 'v183-favorites-content';

  const favoritesSection = document.createElement('section');
  favoritesSection.className = 'v183-favorites-section';
  favoritesSection.append(createSectionTitle('收藏音檔'));
  const favoriteIds = readFavoriteIds();
  const favoriteTracks = favoriteIds
    .map(id => trackCatalogById.get(id))
    .filter((track): track is { id: string; title: string; speaker: string; speakerAvatar: string } => Boolean(track));

  if (favoriteTracks.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'v183-favorites-empty';
    empty.textContent = '尚未收藏音檔';
    favoritesSection.append(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'v183-favorites-list';
    favoriteTracks.forEach(track => {
      const row = document.createElement('div');
      row.className = 'v183-favorite-row';
      if (track.speakerAvatar) {
        const avatar = document.createElement('img');
        avatar.src = track.speakerAvatar;
        avatar.alt = '';
        row.append(avatar);
      }
      const copy = document.createElement('div');
      copy.className = 'v183-favorite-copy';
      const trackTitle = document.createElement('strong');
      trackTitle.textContent = track.title;
      const speaker = document.createElement('span');
      speaker.textContent = track.speaker;
      copy.append(trackTitle, speaker);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'v183-favorites-action';
      remove.textContent = '取消收藏';
      remove.addEventListener('click', () => {
        removeFavorite(track.id);
        void openFavoritesPage();
      });
      row.append(copy, remove);
      list.append(row);
    });
    favoritesSection.append(list);
  }

  const hiddenSection = document.createElement('section');
  hiddenSection.className = 'v183-favorites-section';
  hiddenSection.append(createSectionTitle('已隱藏的演講者'));
  if (hiddenSpeakers.size === 0) {
    const empty = document.createElement('p');
    empty.className = 'v183-favorites-empty';
    empty.textContent = '目前沒有隱藏的演講者';
    hiddenSection.append(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'v183-hidden-list';
    Array.from(hiddenSpeakers).sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(speakerName => {
      const row = document.createElement('div');
      row.className = 'v183-hidden-row';
      const name = document.createElement('strong');
      name.textContent = speakerName;
      const restore = document.createElement('button');
      restore.type = 'button';
      restore.className = 'v183-favorites-action';
      restore.textContent = '取消隱藏';
      restore.addEventListener('click', async () => {
        if (restore.disabled) return;
        restore.disabled = true;
        restore.textContent = '處理中…';
        try {
          await cancelHiddenSpeaker(speakerName);
          await openFavoritesPage();
        } catch (error) {
          window.alert(error instanceof Error ? error.message : '取消隱藏失敗，請稍後再試。');
          restore.disabled = false;
          restore.textContent = '取消隱藏';
        }
      });
      row.append(name, restore);
      list.append(row);
    });
    hiddenSection.append(list);
  }

  content.append(favoritesSection, hiddenSection);
  layer.append(header, content);
  document.body.append(layer);
  document.documentElement.classList.add('v183-favorites-open');
}

function installFavoritesMenuEntry() {
  const panel = document.querySelector<HTMLElement>('.mobile-menu-panel[data-react-menu="true"]');
  if (!panel || panel.querySelector('[data-v183-favorites-menu]')) return;

  const row = document.createElement('div');
  row.className = 'mobile-menu-row flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap v183-favorites-menu-row';
  row.dataset.v183FavoritesMenu = 'true';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex min-w-0 flex-1 items-center gap-3 text-left py-0.5';
  const icon = bookmarkIcon();
  icon.classList.add('v183-favorites-menu-icon');
  const label = document.createElement('span');
  label.textContent = '我的收藏';
  button.append(icon, label);
  button.addEventListener('click', () => {
    document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]')?.click();
    window.setTimeout(() => void openFavoritesPage(), 0);
  });
  row.append(button);

  const stickerButton = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))
    .find(candidate => candidate.textContent?.includes('我的貼紙'));
  const stickerRow = stickerButton?.closest<HTMLElement>('.mobile-menu-row');
  if (stickerRow?.parentElement === panel) stickerRow.insertAdjacentElement('afterend', row);
  else panel.append(row);
}

function syncAllCards() {
  document.querySelectorAll<HTMLElement>('.audio-card[data-track-id]').forEach(card => {
    syncCardVisibility(card);
    installDislikeButton(card);
  });
  installFavoritesMenuEntry();
}

async function loadMemberHiddenSpeakers() {
  hiddenSpeakers.clear();

  if (isPreviewHost()) {
    readPreviewHiddenSpeakers().forEach(name => hiddenSpeakers.add(name));
    syncAllCards();
    return;
  }

  if (!readMemberIdentity()) {
    syncAllCards();
    return;
  }

  try {
    const response = await fetch('/api/member-hidden-speakers', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (response.status === 401) {
      syncAllCards();
      return;
    }
    if (!response.ok) throw new Error(`hidden speakers: ${response.status}`);
    const data = await response.json().catch(() => ({}));
    const speakers = Array.isArray(data?.speakers) ? data.speakers : [];
    speakers.map(String).map((name: string) => name.trim()).filter(Boolean).forEach((name: string) => hiddenSpeakers.add(name));
  } catch (error) {
    console.warn('Failed to load member disliked speakers:', error);
  }
  syncAllCards();
}

function syncMemberIdentity() {
  const identity = readMemberIdentity();
  const effectiveIdentity = isPreviewHost() ? (identity || 'preview-guest') : identity;
  if (effectiveIdentity === lastMemberIdentity) return;
  lastMemberIdentity = effectiveIdentity;
  void loadMemberHiddenSpeakers();
}

function startV181HomeControls() {
  syncAudioPlayingState();
  syncMemberIdentity();
  syncAllCards();
  void loadTrackSpeakerMap().then(syncAllCards).catch(error => {
    console.warn('Failed to preload track speakers:', error);
  });

  document.addEventListener('play', syncAudioPlayingState, true);
  document.addEventListener('pause', syncAudioPlayingState, true);
  document.addEventListener('ended', syncAudioPlayingState, true);
  document.addEventListener('emptied', syncAudioPlayingState, true);

  observer = new MutationObserver(() => {
    syncAudioPlayingState();
    syncMemberIdentity();
    syncAllCards();
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });

  const reloadHiddenSpeakers = () => void loadMemberHiddenSpeakers();
  window.addEventListener('echostars:member-hidden-speakers-changed', reloadHiddenSpeakers as EventListener);
  window.addEventListener('focus', syncMemberIdentity);
  window.addEventListener('storage', syncMemberIdentity);
}

if (document.body) startV181HomeControls();
else window.addEventListener('DOMContentLoaded', startV181HomeControls, { once: true });
