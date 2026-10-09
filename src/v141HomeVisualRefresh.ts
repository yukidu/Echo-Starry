const STYLE_ID = 'echostars-v142-home-visual-refresh';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
const FAVORITES_KEY = 'echostars_favorite_track_ids_v1';
let syncFrame = 0;
let favoritesMode = false;

type HomeTrack = {
  id?: string;
  requiredRank?: string;
  isPrivateVip?: boolean;
  stickerUnlockCost?: number | null;
};

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function isPublicRecording(track: HomeTrack) {
  return !track.requiredRank || track.requiredRank === '無' || track.requiredRank === '公開';
}

function readHomeTracks(): HomeTrack[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    return Array.isArray(parsed?.tracks) ? parsed.tracks : [];
  } catch {
    return [];
  }
}

function readFavoriteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return new Set<string>(Array.isArray(parsed) ? parsed.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html.echostars-v141-home body {
      background: var(--theme-gradient-bg, linear-gradient(135deg,#fff 0%,#f8fafc 100%));
    }
    html.echostars-v141-home header {
      border-bottom-color: color-mix(in srgb,var(--color-primary,#c06c84) 22%,transparent) !important;
      box-shadow: 0 9px 32px color-mix(in srgb,var(--color-primary,#c06c84) 10%,transparent) !important;
    }
    html.echostars-v141-home.dark header {
      background: rgba(8,14,26,.96) !important;
      border-bottom-color: color-mix(in srgb,var(--color-primary,#c06c84) 38%,transparent) !important;
      box-shadow: 0 12px 34px rgba(0,0,0,.35) !important;
    }
    html.echostars-v141-home .navbar-main-row {
      max-width: 52rem;
      margin-inline: auto;
      height: 4rem;
    }
    html.echostars-v141-home .brand-logo-glow > div:first-child {
      box-shadow: 0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 55%,transparent),
                  0 0 25px color-mix(in srgb,var(--color-primary,#c06c84) 45%,transparent) !important;
    }
    html.echostars-v141-home .echo-wave-text {
      text-shadow: 0 0 20px color-mix(in srgb,var(--color-primary,#c06c84) 35%,transparent);
    }
    html.echostars-v141-home .navbar-top-action,
    html.echostars-v141-home [data-main-menu="hamburger"] {
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 13%,transparent);
      box-shadow: 0 8px 20px rgba(15,23,42,.08);
    }
    html.dark.echostars-v141-home .navbar-top-action,
    html.dark.echostars-v141-home [data-main-menu="hamburger"] {
      background: rgba(23,34,53,.95) !important;
      border-color: rgba(71,85,105,.48);
      box-shadow: 0 10px 22px rgba(0,0,0,.24);
    }
    html.echostars-v141-home main:not([hidden]) {
      padding-top: .8rem !important;
      max-width: 52rem !important;
    }
    .v141-home-shell { gap: .78rem !important; }
    .v141-home-search-row {
      gap: .58rem !important;
      align-items: stretch !important;
    }
    .v141-home-search-row > button:first-child {
      min-height: 50px !important;
      border-radius: 17px !important;
      padding-inline: 1rem !important;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 72%,white) !important;
      box-shadow: 0 10px 22px color-mix(in srgb,var(--color-primary,#c06c84) 27%,transparent) !important;
    }
    .v141-home-search-row input {
      height: 50px !important;
      border-radius: 17px !important;
      background: color-mix(in srgb,var(--color-primary,#c06c84) 10%, var(--theme-card-bg,#fff)) !important;
      color: var(--theme-text-primary,#0f172a) !important;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 32%,transparent) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.55), 0 8px 22px rgba(15,23,42,.06) !important;
    }
    .v141-home-search-row input::placeholder {
      color: color-mix(in srgb,var(--theme-text-secondary,#475569) 76%,transparent) !important;
    }
    .v141-home-search-row svg { color: var(--color-primary,#c06c84) !important; }
    html.dark .v141-home-search-row input {
      background: rgba(18,25,40,.96) !important;
      color: #f8fafc !important;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 42%,#334155) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.035), 0 10px 24px rgba(0,0,0,.24) !important;
    }
    html.dark .v141-home-search-row input::placeholder { color: #94a3b8 !important; }
    .v141-keywords {
      border-radius: 16px;
      padding: .18rem .3rem;
    }
    html.echostars-v141-home .sort-toolbar {
      gap: .34rem !important;
      padding: .28rem !important;
      border-radius: 20px;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 94%,transparent);
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 18%,transparent);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.65), 0 9px 26px rgba(15,23,42,.05);
    }
    html.dark.echostars-v141-home .sort-toolbar {
      background: rgba(15,24,39,.78);
      border-color: rgba(71,85,105,.62);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.03), 0 12px 28px rgba(0,0,0,.19);
    }
    html.echostars-v141-home .sort-toolbar button {
      height: 42px !important;
      border-radius: 14px !important;
      box-shadow: 0 4px 10px color-mix(in srgb,var(--color-primary,#c06c84) 12%,transparent) !important;
    }
    html.echostars-v141-home .sort-hide-portrait { display: block !important; }
    .v141-member-teaser {
      position: relative;
      overflow: hidden;
      border-radius: 23px;
      padding: .96rem 1rem;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 56%,transparent);
      background: linear-gradient(135deg,
        color-mix(in srgb,var(--color-primary,#c06c84) 26%,var(--theme-card-bg,#fff)),
        color-mix(in srgb,var(--color-primary,#c06c84) 10%,var(--theme-card-bg,#fff)) 55%,
        color-mix(in srgb,var(--color-primary,#c06c84) 18%,var(--theme-card-bg,#fff)));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.58),
                  0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 10%,transparent),
                  0 14px 34px color-mix(in srgb,var(--color-primary,#c06c84) 19%,transparent);
    }
    .v141-member-teaser::before,
    .v141-member-teaser::after {
      position: absolute;
      color: color-mix(in srgb,var(--color-primary,#c06c84) 70%,#fbbf24);
      pointer-events: none;
      filter: drop-shadow(0 0 7px currentColor);
    }
    .v141-member-teaser::before { content: '✦'; left: .62rem; top: .35rem; font-size: 1rem; }
    .v141-member-teaser::after { content: '✧'; right: .72rem; bottom: .28rem; font-size: 1.15rem; }
    html.dark .v141-member-teaser {
      background: linear-gradient(135deg,
        color-mix(in srgb,var(--color-primary,#c06c84) 33%,#111827),
        #101827 58%,
        color-mix(in srgb,var(--color-primary,#c06c84) 19%,#101827));
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 65%,#334155);
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 0 24px color-mix(in srgb,var(--color-primary,#c06c84) 15%,transparent), 0 16px 36px rgba(0,0,0,.3);
    }
    .v141-member-teaser-summary {
      position: relative;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .28rem;
      text-align: center;
      font-size: .88rem;
      font-weight: 850;
      line-height: 1.42;
      color: var(--theme-text-primary,#0f172a);
      flex-wrap: wrap;
    }
    .v141-member-teaser-summary strong {
      color: var(--color-primary,#c06c84);
      font-size: 1.08rem;
      font-weight: 950;
      text-shadow: 0 0 12px color-mix(in srgb,var(--color-primary,#c06c84) 22%,transparent);
    }
    .v141-member-teaser-unlock {
      appearance: none;
      border: 0;
      padding: 0;
      margin: 0;
      background: transparent;
      color: var(--color-primary,#c06c84);
      font: inherit;
      font-weight: 950;
      cursor: pointer;
      text-decoration: none;
      text-underline-offset: 3px;
    }
    .v141-member-teaser-unlock:hover { text-decoration: underline; }
    html.echostars-v141-home .audio-card-grid {
      gap: .72rem !important;
      padding-top: .1rem !important;
      isolation: isolate;
    }
    html.echostars-v141-home .audio-card {
      border-radius: 21px !important;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 13%,var(--theme-border-subtle,#e2e8f0)) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.65), 0 11px 28px rgba(15,23,42,.085) !important;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 96%,var(--color-primary,#c06c84) 4%) !important;
    }
    html.dark.echostars-v141-home .audio-card {
      background: rgba(16,24,39,.98) !important;
      border-color: rgba(71,85,105,.62) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 15px 32px rgba(0,0,0,.27) !important;
    }
    html.echostars-v141-home .audio-card:has(button[aria-label="更多功能"][aria-expanded="true"]) {
      z-index: 300 !important;
      transform: translateZ(0);
    }
    html.echostars-v141-home .audio-card:has(button[aria-label="更多功能"][aria-expanded="true"]) > div:first-child {
      z-index: 320 !important;
    }
    html.echostars-v141-home .audio-card h3 { letter-spacing: -.02em; }
    html.echostars-v141-home .audio-card img { filter: saturate(.98) contrast(1.025); }
    .v142-favorites-menu-row[data-active="true"] {
      background: color-mix(in srgb,var(--color-primary,#c06c84) 14%,transparent) !important;
      color: var(--color-primary,#c06c84) !important;
      font-weight: 800 !important;
    }
    .v142-favorites-menu-icon { width: 1rem; text-align: center; flex: 0 0 auto; }
    .v142-favorites-header {
      display: flex;
      flex-direction: column;
      gap: .72rem;
      padding: .88rem .95rem;
      border-radius: 20px;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 28%,transparent);
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 94%,var(--color-primary,#c06c84) 6%);
      box-shadow: 0 10px 26px color-mix(in srgb,var(--color-primary,#c06c84) 10%,transparent);
    }
    html.dark .v142-favorites-header {
      background: color-mix(in srgb,#111827 92%,var(--color-primary,#c06c84) 8%);
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 36%,#334155);
    }
    .v142-favorites-header-main { display:flex; align-items:center; justify-content:space-between; gap:.75rem; }
    .v142-favorites-title { margin:0; font-size:1.05rem; line-height:1.2; font-weight:950; color:var(--theme-text-primary,#0f172a); }
    .v142-favorites-count { margin-left:.35rem; color:var(--color-primary,#c06c84); font-size:.88rem; font-weight:900; }
    .v142-favorites-back {
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 35%,transparent);
      background: var(--color-primary,#c06c84);
      color: #fff;
      border-radius: 12px;
      padding: .5rem .7rem;
      font-size: .76rem;
      font-weight: 900;
      white-space: nowrap;
      box-shadow: 0 6px 14px color-mix(in srgb,var(--color-primary,#c06c84) 22%,transparent);
    }
    .v142-favorites-empty { margin:0; text-align:center; color:var(--theme-text-secondary,#64748b); font-size:.83rem; line-height:1.55; }
    .v142-favorites-mode > .v141-home-search-row,
    .v142-favorites-mode > .v141-keywords,
    .v142-favorites-mode > .sort-toolbar,
    .v142-favorites-mode > .v141-member-teaser { display:none !important; }
    @media (max-width: 639px) {
      html.echostars-v141-home main:not([hidden]) { padding-inline: .7rem !important; }
      .v141-home-search-row > button:first-child {
        padding-inline: .72rem !important;
        font-size: .75rem !important;
      }
      .v141-member-teaser { padding: .82rem .78rem; }
      .v141-member-teaser-summary { font-size: .79rem; gap: .22rem; }
      .v141-member-teaser-summary strong { font-size: .96rem; }
      html.echostars-v141-home .sort-toolbar {
        grid-template-columns: repeat(7,minmax(0,1fr)) !important;
      }
      html.echostars-v141-home .sort-toolbar button {
        font-size: 9px !important;
        min-width: 0 !important;
      }
      .v142-favorites-header { padding:.78rem .8rem; }
      .v142-favorites-title { font-size:.98rem; }
    }
  `;
  document.head.appendChild(style);
}

function openRegistration() {
  const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
  hamburger?.click();
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLButtonElement>('.navbar-menu-identity')?.click();
    });
  });
}

function createMemberTeaser() {
  const teaser = document.createElement('section');
  teaser.className = 'v141-member-teaser';
  teaser.setAttribute('aria-label', '訪客可聽音檔與全站音檔數量');

  const summary = document.createElement('div');
  summary.className = 'v141-member-teaser-summary';

  const guestLabel = document.createElement('span');
  guestLabel.append('訪客可聽 ');
  const guestCount = document.createElement('strong');
  guestCount.dataset.v141GuestCount = '1';
  guestLabel.append(guestCount, ' 部音檔，');

  const totalLabel = document.createElement('span');
  totalLabel.append('全站共 ');
  const totalCount = document.createElement('strong');
  totalCount.dataset.v142TotalCount = '1';
  totalLabel.append(totalCount, ' 部，');

  const unlock = document.createElement('button');
  unlock.type = 'button';
  unlock.className = 'v141-member-teaser-unlock';
  unlock.textContent = '註冊會員解鎖更多';
  unlock.addEventListener('click', openRegistration);

  summary.append(guestLabel, totalLabel, unlock);
  teaser.append(summary);
  return teaser;
}

function ensureMemberTeaser(homeShell: HTMLElement, sortToolbar: HTMLElement) {
  let teaser = homeShell.querySelector<HTMLElement>('.v141-member-teaser');
  if (!isGuestMode()) {
    teaser?.remove();
    return;
  }

  if (!teaser) {
    teaser = createMemberTeaser();
    sortToolbar.after(teaser);
  } else if (teaser.previousElementSibling !== sortToolbar) {
    sortToolbar.after(teaser);
  }

  const tracks = readHomeTracks();
  const guestCount = tracks.filter(track => isPublicRecording(track) && !track.isPrivateVip && Math.max(0, Number(track.stickerUnlockCost || 0)) === 0).length;
  const totalCount = tracks.length;
  const guestNode = teaser.querySelector<HTMLElement>('[data-v141-guest-count]');
  const totalNode = teaser.querySelector<HTMLElement>('[data-v142-total-count]');
  const guestText = String(guestCount);
  const totalText = String(totalCount);
  if (guestNode && guestNode.textContent !== guestText) guestNode.textContent = guestText;
  if (totalNode && totalNode.textContent !== totalText) totalNode.textContent = totalText;
}

function closeFavoritesMode() {
  favoritesMode = false;
  queueSync();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openFavoritesMode() {
  const homeLogo = document.querySelector<HTMLButtonElement>('[data-tutorial-target="home-logo"]');
  homeLogo?.click();
  favoritesMode = true;
  queueSync();
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

function bindFavoritesExitButtons() {
  const exits = [
    document.querySelector<HTMLElement>('[data-tutorial-target="home-logo"]'),
    document.querySelector<HTMLElement>('.navbar-menu-home-shortcut')
  ].filter((node): node is HTMLElement => Boolean(node));
  exits.forEach(node => {
    if (node.dataset.v142FavoritesExitBound === '1') return;
    node.dataset.v142FavoritesExitBound = '1';
    node.addEventListener('click', () => {
      favoritesMode = false;
      queueSync();
    });
  });
}

function createFavoritesMenuRow() {
  const row = document.createElement('div');
  row.className = 'v142-favorites-menu-row mobile-menu-row flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800';
  row.dataset.v142FavoritesMenu = '1';

  const spacer = document.createElement('span');
  spacer.className = 'navbar-pin-placeholder';
  spacer.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex min-w-0 flex-1 items-center gap-3 text-left py-0.5';
  button.setAttribute('aria-label', '我的收藏');
  button.addEventListener('click', openFavoritesMode);

  const icon = document.createElement('span');
  icon.className = 'v142-favorites-menu-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🔖';

  const label = document.createElement('span');
  label.textContent = '我的收藏';
  button.append(icon, label);
  row.append(spacer, button);
  return row;
}

function ensureFavoritesMenu() {
  const panel = document.querySelector<HTMLElement>('.mobile-menu-panel');
  if (!panel) return;
  let row = panel.querySelector<HTMLElement>('[data-v142-favorites-menu]');
  if (!row) row = createFavoritesMenuRow();
  row.dataset.active = favoritesMode ? 'true' : 'false';

  const rankingButton = Array.from(panel.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.trim() === '排行榜');
  const rankingRow = rankingButton?.closest<HTMLElement>('.mobile-menu-row');
  if (rankingRow) {
    if (row.previousElementSibling !== rankingRow) rankingRow.after(row);
  } else if (!row.parentElement) {
    panel.append(row);
  }
}

function createFavoritesHeader() {
  const header = document.createElement('section');
  header.className = 'v142-favorites-header';
  header.dataset.v142FavoritesHeader = '1';
  header.hidden = true;

  const main = document.createElement('div');
  main.className = 'v142-favorites-header-main';

  const titleWrap = document.createElement('div');
  const title = document.createElement('h2');
  title.className = 'v142-favorites-title';
  title.textContent = '我的收藏';
  const count = document.createElement('span');
  count.className = 'v142-favorites-count';
  count.dataset.v142FavoritesCount = '1';
  titleWrap.append(title, count);

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'v142-favorites-back';
  back.textContent = '返回全部音檔';
  back.addEventListener('click', closeFavoritesMode);
  main.append(titleWrap, back);

  const empty = document.createElement('p');
  empty.className = 'v142-favorites-empty';
  empty.dataset.v142FavoritesEmpty = '1';
  empty.textContent = '還沒有收藏音檔，可回首頁從音檔卡右上角「⋮」加入收藏。';
  empty.hidden = true;

  header.append(main, empty);
  return header;
}

function applyFavoritesMode(homeShell: HTMLElement, grid: HTMLElement) {
  let header = homeShell.querySelector<HTMLElement>('[data-v142-favorites-header]');
  if (!header) {
    header = createFavoritesHeader();
    grid.before(header);
  } else if (header.nextElementSibling !== grid) {
    grid.before(header);
  }

  const cards = Array.from(grid.querySelectorAll<HTMLElement>('[data-track-card-id]'));
  if (!favoritesMode) {
    homeShell.classList.remove('v142-favorites-mode');
    header.hidden = true;
    cards.forEach(card => { card.hidden = false; });
    return;
  }

  homeShell.classList.add('v142-favorites-mode');
  header.hidden = false;
  const favoriteIds = readFavoriteIds();
  let visibleCount = 0;
  cards.forEach(card => {
    const trackId = String(card.dataset.trackCardId || '');
    const show = favoriteIds.has(trackId);
    card.hidden = !show;
    if (show) visibleCount += 1;
  });

  const count = header.querySelector<HTMLElement>('[data-v142-favorites-count]');
  const nextCountText = `收藏 ${visibleCount} 部`;
  if (count && count.textContent !== nextCountText) count.textContent = nextCountText;
  const empty = header.querySelector<HTMLElement>('[data-v142-favorites-empty]');
  if (empty) empty.hidden = visibleCount > 0;
}

function syncHomeLayout() {
  installStyles();
  ensureFavoritesMenu();
  bindFavoritesExitButtons();

  const grid = document.querySelector<HTMLElement>('.audio-card-grid');
  if (!grid) {
    document.documentElement.classList.remove('echostars-v141-home');
    return;
  }

  const homeShell = grid.parentElement as HTMLElement | null;
  const sortToolbar = homeShell?.querySelector<HTMLElement>('.sort-toolbar');
  if (!homeShell || !sortToolbar) return;

  document.documentElement.classList.add('echostars-v141-home');
  homeShell.classList.add('v141-home-shell');

  const firstChild = homeShell.firstElementChild as HTMLElement | null;
  if (firstChild && firstChild !== sortToolbar && !firstChild.classList.contains('v142-favorites-header')) firstChild.classList.add('v141-home-search-row');
  const keywordBlock = Array.from(homeShell.children).find(child => child !== firstChild && child !== sortToolbar && !child.classList.contains('v141-member-teaser') && !child.classList.contains('v142-favorites-header') && !child.classList.contains('audio-card-grid')) as HTMLElement | undefined;
  if (keywordBlock) keywordBlock.classList.add('v141-keywords');

  ensureMemberTeaser(homeShell, sortToolbar);
  applyFavoritesMode(homeShell, grid);
}

function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    syncHomeLayout();
  });
}

installStyles();
syncHomeLayout();

function shouldSkipLuckyGridMutations(records: MutationRecord[]) {
  const grid = document.querySelector<HTMLElement>('.audio-card-grid.lucky-spin-active');
  return Boolean(grid && records.length && records.every(record => record.target === grid || grid.contains(record.target)));
}

const observer = new MutationObserver(records => {
  if (shouldSkipLuckyGridMutations(records)) return;
  queueSync();
});
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('pageshow', syncHomeLayout);
window.addEventListener('echostars-favorites-changed', queueSync);
window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY || event.key === 'sq_current_user_v1' || event.key === FAVORITES_KEY) queueSync();
});