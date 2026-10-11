import './v181HomeToolbarDislike.css';

const PRODUCTION_HOST = 'echostars.yukidu.workers.dev';
const PREVIEW_STORAGE_PREFIX = 'preview-disliked-speakers';
const hiddenSpeakers = new Set<string>();
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

function syncAudioPlayingState() {
  const playing = Array.from(document.querySelectorAll<HTMLAudioElement>('audio'))
    .some(audio => !audio.paused && !audio.ended && audio.currentSrc !== '');
  document.documentElement.dataset.echostarsAudioPlaying = playing ? 'true' : 'false';
}

function cardWrapper(card: HTMLElement) {
  return card.closest<HTMLElement>('.lucky-card') || card;
}

function speakerNameFromCard(card: HTMLElement) {
  return String(card.querySelector<HTMLImageElement>('img[alt]')?.alt || '').trim();
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

function styledDislikeConfirm(message: string, title: string) {
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
    card.setAttribute('aria-labelledby', 'v181-confirm-title');
    card.setAttribute('aria-describedby', 'v181-confirm-message');

    const icon = shieldAlertIcon();
    const body = document.createElement('div');
    body.className = 'v181-confirm-body';

    const heading = document.createElement('p');
    heading.id = 'v181-confirm-title';
    heading.className = 'v181-confirm-title';
    heading.textContent = title;

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
    body.append(heading, copy, actions);
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

async function handleDislike(card: HTMLElement, button: HTMLButtonElement) {
  const speakerName = speakerNameFromCard(card);
  if (!speakerName || button.disabled) return;

  if (!isPreviewHost() && !readMemberIdentity()) {
    window.alert('請先登入會員後再使用「不喜歡」。');
    return;
  }

  if (!await styledDislikeConfirm(`確定不喜歡「${speakerName}」嗎？`, '不喜歡確認')) return;
  if (!await styledDislikeConfirm(`再確認一次，真的不喜歡「${speakerName}」嗎？`, '再次確認')) return;

  button.disabled = true;
  const label = button.querySelector('span');
  if (label) label.textContent = '處理中…';
  try {
    await persistDislike(speakerName);
    syncAllCards();
    window.dispatchEvent(new CustomEvent('echostars:member-hidden-speakers-changed', {
      detail: { speakerName }
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
