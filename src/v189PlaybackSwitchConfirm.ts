const PLAYER_SELECTOR = '[data-echostars-media-session="1"]';
const MEDIA_TOGGLE_SELECTOR = '[data-echostars-media-toggle="1"]';
const CONFIRM_LAYER_SELECTOR = '[data-v189-playback-switch-confirm="true"]';
const bypassOnce = new WeakSet<HTMLButtonElement>();

function activeAudio() {
  return Array.from(document.querySelectorAll<HTMLAudioElement>('audio'))
    .find(audio => !audio.paused && !audio.ended && Boolean(audio.currentSrc || audio.src));
}

function isStartPlaybackControl(button: HTMLButtonElement) {
  if (button.matches(MEDIA_TOGGLE_SELECTOR) || button.closest(PLAYER_SELECTOR)) return false;
  const aria = (button.getAttribute('aria-label') || '').trim();
  const title = (button.getAttribute('title') || '').trim();
  return /^(?:開始播放|繼續播放)$/.test(aria)
    || title === '播放'
    || title === '點擊照片播放';
}

function targetTrackId(button: HTMLButtonElement) {
  const card = button.closest<HTMLElement>('.audio-card[data-track-id]');
  const cardTrackId = String(card?.dataset.trackId || '').trim();
  if (cardTrackId) return cardTrackId;

  const state = window.history.state as { view?: string; trackId?: string } | null;
  if (state?.view === 'detail') return String(state.trackId || '').trim();
  return '';
}

function currentTrackId() {
  const player = document.querySelector<HTMLElement>(PLAYER_SELECTOR);
  return String(player?.dataset.mediaTrackId || '').trim();
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

function finishIntent(grant: boolean) {
  window.dispatchEvent(new Event(grant
    ? 'echostars:grant-playback-intent'
    : 'echostars:clear-playback-intent'));
}

function showPlaybackSwitchConfirm(button: HTMLButtonElement) {
  if (document.querySelector(CONFIRM_LAYER_SELECTOR)) return;

  const layer = document.createElement('div');
  layer.className = 'v181-confirm-layer';
  layer.dataset.v181ConfirmLayer = 'true';
  layer.dataset.v189PlaybackSwitchConfirm = 'true';
  layer.setAttribute('role', 'presentation');

  const card = document.createElement('div');
  card.className = 'v181-confirm-card';
  card.setAttribute('role', 'alertdialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'v189-playback-confirm-title');
  card.setAttribute('aria-describedby', 'v189-playback-confirm-message');

  const body = document.createElement('div');
  body.className = 'v181-confirm-body';

  const heading = document.createElement('p');
  heading.id = 'v189-playback-confirm-title';
  heading.className = 'v181-confirm-title';
  heading.textContent = '切換播放確認';

  const message = document.createElement('p');
  message.id = 'v189-playback-confirm-message';
  message.className = 'v181-confirm-message';
  message.textContent = '目前音檔正在播放中，確定要切換播放其他音檔嗎？';

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
  const close = (grant: boolean) => {
    if (settled) return;
    settled = true;
    document.removeEventListener('keydown', onKeydown, true);
    layer.remove();
    finishIntent(grant);
    if (grant && button.isConnected) {
      bypassOnce.add(button);
      button.click();
    }
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close(false);
  };

  cancel.addEventListener('click', () => close(false));
  confirm.addEventListener('click', () => close(true));
  layer.addEventListener('click', event => {
    if (event.target === layer) close(false);
  });
  document.addEventListener('keydown', onKeydown, true);

  actions.append(cancel, confirm);
  body.append(heading, message, actions);
  card.append(shieldAlertIcon(), body);
  layer.append(card);
  document.body.append(layer);
  window.setTimeout(() => confirm.focus(), 0);
}

function interceptPlaybackSwitch(event: MouseEvent) {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest<HTMLButtonElement>('button');
  if (!button || bypassOnce.has(button)) {
    if (button) bypassOnce.delete(button);
    return;
  }
  if (!isStartPlaybackControl(button)) return;

  const audio = activeAudio();
  if (!audio) return;

  const currentId = currentTrackId();
  const targetId = targetTrackId(button);
  if (!currentId || !targetId || currentId === targetId) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  showPlaybackSwitchConfirm(button);
}

document.addEventListener('click', interceptPlaybackSwitch, true);
