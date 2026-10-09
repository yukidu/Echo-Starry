const STYLE_ID = 'echostars-v156-fast-ui-polish';
const FAVORITES_PIN_KEY = 'echostars_favorites_top_pin_v156';
let syncQueued = false;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Four home filters: same visual font size as 召喚繁星, but shorter buttons. */
    .v145-filter-button {
      height: 40px !important;
      min-height: 40px !important;
      font-size: .875rem !important;
      line-height: 1 !important;
    }
    .v145-filter-sliders { display: none !important; }
    @media (max-width: 639px) {
      .v145-filter-button {
        height: 40px !important;
        min-height: 40px !important;
        font-size: .875rem !important;
      }
    }
    @media (max-width: 365px) {
      .v145-filter-button { font-size: .875rem !important; }
    }

    /* v156: 召喚繁星的活動焦點固定在第一張卡片。 */
    .audio-card-grid.lucky-spin-active > .lucky-card:nth-child(2) {
      opacity: .48;
      z-index: 10;
      box-shadow: none;
      animation: none;
    }
    .audio-card-grid.lucky-spin-active > .lucky-card:first-child {
      filter: none;
      opacity: 1;
      z-index: 20;
      box-shadow: 0 0 0 3px var(--color-primary,#c06c84), 0 0 24px var(--color-primary,#c06c84);
      animation: echostars-lucky-reel-focus 160ms ease-in-out infinite alternate;
    }
    @media (prefers-reduced-motion: reduce) {
      .audio-card-grid.lucky-spin-active > .lucky-card:first-child { animation: none !important; }
    }

    .v156-favorites-top {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 13%,transparent);
      border-radius: .75rem;
      background: rgb(241 245 249);
      color: rgb(51 65 85);
      box-shadow: 0 8px 20px rgba(15,23,42,.08);
      cursor: pointer;
    }
    html.dark .v156-favorites-top {
      background: rgba(23,34,53,.95);
      border-color: rgba(71,85,105,.48);
      color: rgb(226 232 240);
    }
    .v156-favorites-top svg { width: 1rem; height: 1rem; }
    .v156-favorites-pin-check { width: .9rem; height: .9rem; display: block; }
  `;
  document.head.appendChild(style);
}

function currentUserKey() {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    if (!raw) return '';
    const user = JSON.parse(raw);
    return String(user?.id || user?.email || '').trim();
  } catch {
    return '';
  }
}

function deviceKind() {
  const shortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  if (shortSide < 600) return 'mobile';
  if (shortSide < 1024) return 'tablet';
  return 'desktop';
}

function storageKey() {
  return `${FAVORITES_PIN_KEY}:${currentUserKey()}:${deviceKind()}`;
}

function favoritesPinned() {
  if (!currentUserKey()) return false;
  try { return localStorage.getItem(storageKey()) === '1'; }
  catch { return false; }
}

function setFavoritesPinned(pinned: boolean) {
  if (!currentUserKey()) return;
  try { localStorage.setItem(storageKey(), pinned ? '1' : '0'); } catch {}
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

function makeCheckSvg() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'v156-favorites-pin-check');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'm5 12 4 4L19 6');
  svg.appendChild(path);
  return svg;
}

function openFavoritesFromTop() {
  const existing = document.querySelector<HTMLButtonElement>('[data-v142-favorites-menu] > button[aria-label="我的收藏"]');
  if (existing) {
    existing.click();
    return;
  }
  const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
  if (!hamburger) return;
  if (hamburger.getAttribute('aria-expanded') !== 'true') hamburger.click();
  let attempts = 0;
  const clickWhenReady = () => {
    const button = document.querySelector<HTMLButtonElement>('[data-v142-favorites-menu] > button[aria-label="我的收藏"]');
    if (button) {
      button.click();
      return;
    }
    attempts += 1;
    if (attempts < 5) window.setTimeout(clickWhenReady, 35);
  };
  window.setTimeout(clickWhenReady, 0);
}

function syncFavoritesTopButton() {
  const toolbar = document.querySelector<HTMLElement>('[data-echostars-top-toolbar="true"]');
  if (!toolbar) return;
  let button = toolbar.querySelector<HTMLButtonElement>('[data-v156-favorites-top]');
  if (!favoritesPinned()) {
    button?.remove();
    return;
  }
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'v156-favorites-top';
    button.dataset.v156FavoritesTop = '1';
    button.title = '我的收藏';
    button.setAttribute('aria-label', '我的收藏');
    button.appendChild(makeBookmarkSvg());
    button.addEventListener('click', openFavoritesFromTop);
    toolbar.appendChild(button);
  }
}

function syncFavoritesPin() {
  const row = document.querySelector<HTMLElement>('[data-v142-favorites-menu]');
  if (!row || !currentUserKey()) return;
  const actionButton = row.querySelector<HTMLButtonElement>('button[aria-label="我的收藏"]');
  if (!actionButton) return;

  let pin = row.querySelector<HTMLButtonElement>('[data-v156-favorites-pin]');
  if (!pin) {
    pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'navbar-inline-pin';
    pin.dataset.v156FavoritesPin = '1';
    pin.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      setFavoritesPinned(!favoritesPinned());
      syncFavoritesPin();
      syncFavoritesTopButton();
    });
    const spacer = row.querySelector<HTMLElement>('.navbar-pin-placeholder');
    if (spacer) spacer.replaceWith(pin);
    else row.insertBefore(pin, actionButton);
  }

  const checked = favoritesPinned();
  pin.classList.toggle('is-selected', checked);
  pin.setAttribute('aria-pressed', String(checked));
  pin.setAttribute('aria-label', `${checked ? '取消置頂' : '置頂'}：我的收藏`);
  pin.title = checked ? '取消顯示在置頂主選單' : '顯示在置頂主選單';
  pin.textContent = '';
  if (checked) pin.appendChild(makeCheckSvg());
  else {
    const dot = document.createElement('span');
    dot.className = 'navbar-inline-pin-empty';
    pin.appendChild(dot);
  }
}

function syncGuestCommentPlaceholder() {
  if (currentUserKey()) return;
  document.querySelectorAll<HTMLTextAreaElement>('textarea').forEach(textarea => {
    if (textarea.placeholder === '按這裡寫下您的心得收穫...') {
      textarea.placeholder = '按此分享你的心得收穫';
    }
  });
}

function removeAdvancedFilterIcon() {
  document.querySelectorAll<SVGElement>('[data-v145-button="advanced"] .v145-filter-sliders').forEach(icon => icon.remove());
}

function syncDynamicUi() {
  installStyles();
  removeAdvancedFilterIcon();
  syncGuestCommentPlaceholder();
  syncFavoritesPin();
  syncFavoritesTopButton();
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  window.requestAnimationFrame(() => {
    syncQueued = false;
    syncDynamicUi();
    window.setTimeout(syncDynamicUi, 60);
    window.setTimeout(syncDynamicUi, 180);
  });
}

installStyles();
queueSync();

document.addEventListener('click', queueSync, true);
window.addEventListener('popstate', queueSync);
window.addEventListener('pageshow', queueSync);
window.addEventListener('resize', queueSync);
window.addEventListener('storage', event => {
  if (event.key?.startsWith(FAVORITES_PIN_KEY) || event.key === 'sq_current_user_v1') queueSync();
});
