const STYLE_ID = 'echostars-v140-home-visual-refresh';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
let syncQueued = false;

type HomeTrack = {
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

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html.echostars-v140-home body {
      background: var(--theme-gradient-bg, linear-gradient(135deg,#fff 0%,#f8fafc 100%));
    }

    html.echostars-v140-home header {
      border-bottom-color: color-mix(in srgb,var(--color-primary,#c06c84) 18%,transparent) !important;
      box-shadow: 0 8px 30px color-mix(in srgb,var(--color-primary,#c06c84) 8%,transparent) !important;
    }
    html.echostars-v140-home.dark header {
      background: rgba(11,16,27,.94) !important;
      border-bottom-color: color-mix(in srgb,var(--color-primary,#c06c84) 32%,transparent) !important;
      box-shadow: 0 10px 32px rgba(0,0,0,.32) !important;
    }
    html.echostars-v140-home .navbar-main-row {
      max-width: 52rem;
      margin-inline: auto;
      height: 4rem;
    }
    html.echostars-v140-home .brand-logo-glow > div:first-child {
      box-shadow: 0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 45%,transparent),
                  0 0 22px color-mix(in srgb,var(--color-primary,#c06c84) 38%,transparent) !important;
    }

    html.echostars-v140-home main:not([hidden]) {
      padding-top: .8rem !important;
      max-width: 52rem !important;
    }
    .v140-home-shell {
      gap: .7rem !important;
    }
    .v140-home-search-row {
      gap: .55rem !important;
      align-items: stretch !important;
    }
    .v140-home-search-row > button:first-child {
      min-height: 48px !important;
      border-radius: 16px !important;
      padding-inline: 1rem !important;
      box-shadow: 0 8px 18px color-mix(in srgb,var(--color-primary,#c06c84) 22%,transparent) !important;
    }
    .v140-home-search-row input {
      height: 48px !important;
      border-radius: 16px !important;
      background: color-mix(in srgb,var(--color-primary,#c06c84) 16%, var(--theme-card-bg,#fff)) !important;
      color: var(--theme-text-primary,#0f172a) !important;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 30%,transparent) !important;
      box-shadow: 0 8px 22px rgba(15,23,42,.06) !important;
    }
    .v140-home-search-row input::placeholder {
      color: color-mix(in srgb,var(--theme-text-secondary,#475569) 76%,transparent) !important;
    }
    .v140-home-search-row svg {
      color: var(--color-primary,#c06c84) !important;
    }
    html.dark .v140-home-search-row input {
      background: rgba(24,28,40,.94) !important;
      color: #f8fafc !important;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 38%,#334155) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22) !important;
    }
    html.dark .v140-home-search-row input::placeholder { color: #94a3b8 !important; }

    .v140-keywords {
      border-radius: 16px;
      padding: .15rem .25rem;
    }

    html.echostars-v140-home .sort-toolbar {
      gap: .32rem !important;
      padding: .2rem !important;
      border-radius: 18px;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 92%,transparent);
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 14%,transparent);
      box-shadow: 0 8px 24px rgba(15,23,42,.045);
    }
    html.dark.echostars-v140-home .sort-toolbar {
      background: rgba(17,24,39,.72);
      border-color: rgba(71,85,105,.6);
    }
    html.echostars-v140-home .sort-toolbar button {
      height: 40px !important;
      border-radius: 13px !important;
      box-shadow: none !important;
    }
    html.echostars-v140-home .sort-hide-portrait {
      display: block !important;
    }

    .v140-member-teaser {
      position: relative;
      overflow: hidden;
      border-radius: 22px;
      padding: .85rem .95rem;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 36%,transparent);
      background:
        radial-gradient(circle at 8% 18%, color-mix(in srgb,var(--color-primary,#c06c84) 32%,transparent) 0 1px, transparent 2px),
        radial-gradient(circle at 88% 22%, color-mix(in srgb,var(--color-primary,#c06c84) 28%,transparent) 0 1.5px, transparent 2.5px),
        linear-gradient(135deg,
          color-mix(in srgb,var(--color-primary,#c06c84) 20%,var(--theme-card-bg,#fff)),
          color-mix(in srgb,var(--color-primary,#c06c84) 8%,var(--theme-card-bg,#fff)));
      box-shadow: 0 12px 30px color-mix(in srgb,var(--color-primary,#c06c84) 14%,transparent);
    }
    html.dark .v140-member-teaser {
      background:
        radial-gradient(circle at 8% 18%, color-mix(in srgb,var(--color-primary,#c06c84) 52%,transparent) 0 1px, transparent 2px),
        radial-gradient(circle at 88% 22%, color-mix(in srgb,var(--color-primary,#c06c84) 40%,transparent) 0 1.5px, transparent 2.5px),
        linear-gradient(135deg,
          color-mix(in srgb,var(--color-primary,#c06c84) 25%,#111827),
          #111827 72%);
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 50%,#334155);
      box-shadow: 0 14px 34px rgba(0,0,0,.28);
    }
    .v140-member-teaser-summary {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: .45rem;
      text-align: center;
      font-size: .83rem;
      font-weight: 800;
      line-height: 1.25;
      color: var(--theme-text-primary,#0f172a);
      flex-wrap: wrap;
    }
    .v140-member-teaser-summary strong {
      color: var(--color-primary,#c06c84);
      font-size: 1rem;
      font-weight: 950;
    }
    .v140-member-teaser-divider { opacity: .42; }
    .v140-member-teaser-cta {
      width: 100%;
      margin-top: .65rem;
      min-height: 40px;
      border: 0;
      border-radius: 14px;
      color: white;
      background: var(--color-primary,#c06c84);
      font-weight: 900;
      font-size: .85rem;
      box-shadow: 0 8px 18px color-mix(in srgb,var(--color-primary,#c06c84) 28%,transparent);
      transition: transform .15s ease, filter .15s ease;
    }
    .v140-member-teaser-cta:hover { filter: brightness(1.06); }
    .v140-member-teaser-cta:active { transform: scale(.985); }

    html.echostars-v140-home .audio-card-grid {
      gap: .65rem !important;
      padding-top: .1rem !important;
    }
    html.echostars-v140-home .audio-card {
      border-radius: 20px !important;
      box-shadow: 0 10px 26px rgba(15,23,42,.075) !important;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 96%,var(--color-primary,#c06c84) 4%) !important;
    }
    html.dark.echostars-v140-home .audio-card {
      background: rgba(20,25,36,.97) !important;
      border-color: rgba(71,85,105,.56) !important;
      box-shadow: 0 14px 30px rgba(0,0,0,.25) !important;
    }
    html.echostars-v140-home .audio-card h3 {
      letter-spacing: -.02em;
    }
    html.echostars-v140-home .audio-card img {
      filter: saturate(.96) contrast(1.02);
    }

    @media (max-width: 639px) {
      html.echostars-v140-home main:not([hidden]) { padding-inline: .7rem !important; }
      .v140-home-search-row > button:first-child {
        padding-inline: .72rem !important;
        font-size: .75rem !important;
      }
      .v140-member-teaser { padding: .78rem .8rem; }
      .v140-member-teaser-summary { font-size: .76rem; gap: .3rem; }
      .v140-member-teaser-summary strong { font-size: .92rem; }
      html.echostars-v140-home .sort-toolbar {
        grid-template-columns: repeat(7,minmax(0,1fr)) !important;
      }
      html.echostars-v140-home .sort-toolbar button {
        font-size: 9px !important;
        min-width: 0 !important;
      }
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

function ensureMemberTeaser(homeShell: HTMLElement, sortToolbar: HTMLElement, grid: HTMLElement) {
  let teaser = homeShell.querySelector<HTMLElement>('.v140-member-teaser');
  if (!teaser) {
    teaser = document.createElement('section');
    teaser.className = 'v140-member-teaser';
    teaser.setAttribute('aria-label', '訪客與會員可收聽內容比較');

    const summary = document.createElement('div');
    summary.className = 'v140-member-teaser-summary';

    const guestLabel = document.createElement('span');
    guestLabel.dataset.v140GuestCount = '1';
    const divider = document.createElement('span');
    divider.className = 'v140-member-teaser-divider';
    divider.textContent = '｜';
    const memberLabel = document.createElement('span');
    memberLabel.dataset.v140MemberCount = '1';

    summary.append(guestLabel, divider, memberLabel);
    teaser.append(summary);

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'v140-member-teaser-cta';
    cta.textContent = '免費註冊，立即解鎖更多內容 →';
    cta.addEventListener('click', openRegistration);
    teaser.append(cta);

    sortToolbar.after(teaser);
  }

  const tracks = readHomeTracks();
  const guestCount = tracks.filter(track => isPublicRecording(track) && !track.isPrivateVip && Math.max(0, Number(track.stickerUnlockCost || 0)) === 0).length;
  const memberCount = tracks.filter(track => isPublicRecording(track) && !track.isPrivateVip).length;
  const guestNode = teaser.querySelector<HTMLElement>('[data-v140-guest-count]');
  const memberNode = teaser.querySelector<HTMLElement>('[data-v140-member-count]');
  if (guestNode) guestNode.innerHTML = `訪客可收聽 <strong>${guestCount}</strong> 則`;
  if (memberNode) memberNode.innerHTML = `註冊會員可收聽 <strong>${memberCount}</strong> 則`;

  const cta = teaser.querySelector<HTMLButtonElement>('.v140-member-teaser-cta');
  if (cta) cta.hidden = !isGuestMode();

  if (teaser.nextElementSibling !== grid) sortToolbar.after(teaser);
}

function syncHomeLayout() {
  installStyles();
  const grid = document.querySelector<HTMLElement>('.audio-card-grid');
  if (!grid) {
    document.documentElement.classList.remove('echostars-v140-home');
    return;
  }

  const homeShell = grid.parentElement as HTMLElement | null;
  const sortToolbar = homeShell?.querySelector<HTMLElement>('.sort-toolbar');
  if (!homeShell || !sortToolbar) return;

  document.documentElement.classList.add('echostars-v140-home');
  homeShell.classList.add('v140-home-shell');

  const firstChild = homeShell.firstElementChild as HTMLElement | null;
  if (firstChild && firstChild !== sortToolbar) firstChild.classList.add('v140-home-search-row');
  const keywordBlock = firstChild?.nextElementSibling as HTMLElement | null;
  if (keywordBlock && keywordBlock !== sortToolbar && !keywordBlock.classList.contains('v140-member-teaser')) {
    keywordBlock.classList.add('v140-keywords');
  }

  ensureMemberTeaser(homeShell, sortToolbar, grid);
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  queueMicrotask(() => {
    syncQueued = false;
    syncHomeLayout();
  });
}

installStyles();
syncHomeLayout();

const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('pageshow', syncHomeLayout);
window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY || event.key === 'sq_current_user_v1') syncHomeLayout();
});
