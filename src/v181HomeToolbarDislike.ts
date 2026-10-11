import './v181HomeToolbarDislike.css';

const PRODUCTION_HOST = 'echostars.yukidu.workers.dev';
const PREVIEW_STORAGE_PREFIX = 'echostars_preview_disliked_track_ids_v1';
const hiddenTrackIds = new Set<string>();
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

function readPreviewHiddenIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(previewStorageKey()) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function writePreviewHiddenIds() {
  try {
    localStorage.setItem(previewStorageKey(), JSON.stringify(Array.from(hiddenTrackIds)));
  } catch {}
}

function syncAudioPlayingState() {
  const playing = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'))
    .some(audio => !audio.paused && !audio.ended && audio.currentSrc !== '');
  document.documentElement.dataset.echostarsAudioPlaying = playing ? 'true' : 'false';
}

function cardWrapper(card: HTMLElement) {
  return card.closest<HTMLElement>('.lucky-card') || card;
}

function syncCardVisibility(card: HTMLElement) {
  const trackId = String(card.dataset.trackId || '').trim();
  if (!trackId) return;
  const wrapper = cardWrapper(card);
  if (hiddenTrackIds.has(trackId)) {
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

async function persistDislike(trackId: string) {
  if (isPreviewHost()) {
    hiddenTrackIds.add(trackId);
    writePreviewHiddenIds();
    return;
  }

  const response = await fetch(`/api/member-hidden-tracks/${encodeURIComponent(trackId)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error('請先登入會員後再使用「不喜歡」。');
  if (!response.ok) throw new Error(data?.error || '設定失敗，請稍後再試。');
  hiddenTrackIds.add(trackId);
}

async function handleDislike(card: HTMLElement, button: HTMLButtonElement) {
  const trackId = String(card.dataset.trackId || '').trim();
  if (!trackId || button.disabled) return;

  if (!isPreviewHost() && !readMemberIdentity()) {
    window.alert('請先登入會員後再使用「不喜歡」。');
    return;
  }

  const title = card.querySelector('h3')?.textContent?.trim() || '這個音檔';
  if (!window.confirm(`確定不喜歡「${title}」嗎？`)) return;
  if (!window.confirm('再確認一次，真的不喜歡這個音檔嗎？')) return;

  button.disabled = true;
  const label = button.querySelector('span');
  if (label) label.textContent = '處理中…';
  try {
    await persistDislike(trackId);
    syncAllCards();
    window.dispatchEvent(new CustomEvent('echostars:member-hidden-tracks-changed', {
      detail: { trackId }
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

function syncAllCards() {
  document.querySelectorAll<HTMLElement>('.audio-card[data-track-id]').forEach(card => {
    syncCardVisibility(card);
    installDislikeButton(card);
  });
}

async function loadMemberHiddenTracks() {
  hiddenTrackIds.clear();

  if (isPreviewHost()) {
    readPreviewHiddenIds().forEach(id => hiddenTrackIds.add(id));
    syncAllCards();
    return;
  }

  if (!readMemberIdentity()) {
    syncAllCards();
    return;
  }

  try {
    const response = await fetch('/api/member-hidden-tracks', {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store'
    });
    if (response.status === 401) {
      syncAllCards();
      return;
    }
    if (!response.ok) throw new Error(`hidden tracks: ${response.status}`);
    const data = await response.json().catch(() => ({}));
    const ids = Array.isArray(data?.trackIds) ? data.trackIds : [];
    ids.map(String).filter(Boolean).forEach((id: string) => hiddenTrackIds.add(id));
  } catch (error) {
    console.warn('Failed to load member disliked tracks:', error);
  }
  syncAllCards();
}

function syncMemberIdentity() {
  const identity = readMemberIdentity();
  const effectiveIdentity = isPreviewHost() ? (identity || 'preview-guest') : identity;
  if (effectiveIdentity === lastMemberIdentity) return;
  lastMemberIdentity = effectiveIdentity;
  void loadMemberHiddenTracks();
}

function startV181HomeControls() {
  syncAudioPlayingState();
  syncMemberIdentity();
  syncAllCards();

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

  window.addEventListener('focus', syncMemberIdentity);
  window.addEventListener('storage', syncMemberIdentity);
}

if (document.body) startV181HomeControls();
else window.addEventListener('DOMContentLoaded', startV181HomeControls, { once: true });
