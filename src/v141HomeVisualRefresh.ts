const STYLE_ID = 'echostars-v141-home-visual-refresh';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
let syncFrame = 0;

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
    html.echostars-v141-home body {
      background: var(--theme-gradient-bg, linear-gradient(135deg,#fff 0%,#f8fafc 100%));
    }
    html.echostars-v141-home header {
      border-bottom-color: color-mix(in srgb,var(--color-primary,#c06c84) 18%,transparent) !important;
      box-shadow: 0 8px 30px color-mix(in srgb,var(--color-primary,#c06c84) 8%,transparent) !important;
    }
    html.echostars-v141-home.dark header {
      background: rgba(11,16,27,.94) !important;
      border-bottom-color: color-mix(in srgb,var(--color-primary,#c06c84) 32%,transparent) !important;
      box-shadow: 0 10px 32px rgba(0,0,0,.32) !important;
    }
    html.echostars-v141-home .navbar-main-row {
      max-width: 52rem;
      margin-inline: auto;
      height: 4rem;
    }
    html.echostars-v141-home .brand-logo-glow > div:first-child {
      box-shadow: 0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 45%,transparent),
                  0 0 22px color-mix(in srgb,var(--color-primary,#c06c84) 38%,transparent) !important;
    }
    html.echostars-v141-home main:not([hidden]) {
      padding-top: .8rem !important;
      max-width: 52rem !important;
    }
    .v141-home-shell { gap: .7rem !important; }
    .v141-home-search-row {
      gap: .55rem !important;
      align-items: stretch !important;
    }
    .v141-home-search-row > button:first-child {
      min-height: 48px !important;
      border-radius: 16px !important;
      padding-inline: 1rem !important;
      box-shadow: 0 8px 18px color-mix(in srgb,var(--color-primary,#c06c84) 22%,transparent) !important;
    }
    .v141-home-search-row input {
      height: 48px !important;
      border-radius: 16px !important;
      background: color-mix(in srgb,var(--color-primary,#c06c84) 16%, var(--theme-card-bg,#fff)) !important;
      color: var(--theme-text-primary,#0f172a) !important;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 30%,transparent) !important;
      box-shadow: 0 8px 22px rgba(15,23,42,.06) !important;
    }
    .v141-home-search-row input::placeholder {
      color: color-mix(in srgb,var(--theme-text-secondary,#475569) 76%,transparent) !important;
    }
    .v141-home-search-row svg { color: var(--color-primary,#c06c84) !important; }
    html.dark .v141-home-search-row input {
      background: rgba(24,28,40,.94) !important;
      color: #f8fafc !important;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 38%,#334155) !important;
      box-shadow: 0 10px 24px rgba(0,0,0,.22) !important;
    }
    html.dark .v141-home-search-row input::placeholder { color: #94a3b8 !important; }
    .v141-keywords {
      border-radius: 16px;
      padding: .15rem .25rem;
    }
    html.echostars-v141-home .sort-toolbar {
      gap: .32rem !important;
      padding: .2rem !important;
      border-radius: 18px;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 92%,transparent);
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 14%,transparent);
      box-shadow: 0 8px 24px rgba(15,23,42,.045);
    }
    html.dark.echostars-v141-home .sort-toolbar {
      background: rgba(17,24,39,.72);
      border-color: rgba(71,85,105,.6);
    }
    html.echostars-v141-home .sort-toolbar button {
      height: 40px !important;
      border-radius: 13px !important;
      box-shadow: none !important;
    }
    html.echostars-v141-home .sort-hide-portrait { display: block !important; }
    .v141-member-teaser {
      position: relative;
      overflow: hidden;
      border-radius: 22px;
      padding: .85rem .95rem;
      border: 1px solid color-mix(in srgb,var(--color-primary,#c06c84) 36%,transparent);
      background: linear-gradient(135deg,
        color-mix(in srgb,var(--color-primary,#c06c84) 20%,var(--theme-card-bg,#fff)),
        color-mix(in srgb,var(--color-primary,#c06c84) 8%,var(--theme-card-bg,#fff)));
      box-shadow: 0 12px 30px color-mix(in srgb,var(--color-primary,#c06c84) 14%,transparent);
    }
    html.dark .v141-member-teaser {
      background: linear-gradient(135deg,
        color-mix(in srgb,var(--color-primary,#c06c84) 25%,#111827),
        #111827 72%);
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 50%,#334155);
      box-shadow: 0 14px 34px rgba(0,0,0,.28);
    }
    .v141-member-teaser-summary {
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
    .v141-member-teaser-summary strong {
      color: var(--color-primary,#c06c84);
      font-size: 1rem;
      font-weight: 950;
    }
    .v141-member-teaser-divider { opacity: .42; }
    .v141-member-teaser-cta {
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
    }
    html.echostars-v141-home .audio-card-grid {
      gap: .65rem !important;
      padding-top: .1rem !important;
    }
    html.echostars-v141-home .audio-card {
      border-radius: 20px !important;
      box-shadow: 0 10px 26px rgba(15,23,42,.075) !important;
      background: color-mix(in srgb,var(--theme-card-bg,#fff) 96%,var(--color-primary,#c06c84) 4%) !important;
    }
    html.dark.echostars-v141-home .audio-card {
      background: rgba(20,25,36,.97) !important;
      border-color: rgba(71,85,105,.56) !important;
      box-shadow: 0 14px 30px rgba(0,0,0,.25) !important;
    }
    html.echostars-v141-home .audio-card h3 { letter-spacing: -.02em; }
    html.echostars-v141-home .audio-card img { filter: saturate(.96) contrast(1.02); }
    @media (max-width: 639px) {
      html.echostars-v141-home main:not([hidden]) { padding-inline: .7rem !important; }
      .v141-home-search-row > button:first-child {
        padding-inline: .72rem !important;
        font-size: .75rem !important;
      }
      .v141-member-teaser { padding: .78rem .8rem; }
      .v141-member-teaser-summary { font-size: .76rem; gap: .3rem; }
      .v141-member-teaser-summary strong { font-size: .92rem; }
      html.echostars-v141-home .sort-toolbar {
        grid-template-columns: repeat(7,minmax(0,1fr)) !important;
      }
      html.echostars-v141-home .sort-toolbar button {
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

function createMemberTeaser() {
  const teaser = document.createElement('section');
  teaser.className = 'v141-member-teaser';
  teaser.setAttribute('aria-label', '訪客與會員可收聽內容比較');

  const summary = document.createElement('div');
  summary.className = 'v141-member-teaser-summary';

  const guestLabel = document.createElement('span');
  guestLabel.append('訪客可收聽 ');
  const guestCount = document.createElement('strong');
  guestCount.dataset.v141GuestCount = '1';
  guestLabel.append(guestCount, ' 則');

  const divider = document.createElement('span');
  divider.className = 'v141-member-teaser-divider';
  divider.textContent = '｜';

  const memberLabel = document.createElement('span');
  memberLabel.append('註冊會員可收聽 ');
  const memberCount = document.createElement('strong');
  memberCount.dataset.v141MemberCount = '1';
  memberLabel.append(memberCount, ' 則');

  summary.append(guestLabel, divider, memberLabel);
  teaser.append(summary);

  const cta = document.createElement('button');
  cta.type = 'button';
  cta.className = 'v141-member-teaser-cta';
  cta.textContent = '免費註冊，立即解鎖更多內容 →';
  cta.addEventListener('click', openRegistration);
  teaser.append(cta);
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
  const memberCount = tracks.filter(track => isPublicRecording(track) && !track.isPrivateVip).length;
  const guestNode = teaser.querySelector<HTMLElement>('[data-v141-guest-count]');
  const memberNode = teaser.querySelector<HTMLElement>('[data-v141-member-count]');
  const guestText = String(guestCount);
  const memberText = String(memberCount);
  if (guestNode && guestNode.textContent !== guestText) guestNode.textContent = guestText;
  if (memberNode && memberNode.textContent !== memberText) memberNode.textContent = memberText;
}

function syncHomeLayout() {
  installStyles();
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
  if (firstChild && firstChild !== sortToolbar) firstChild.classList.add('v141-home-search-row');
  const keywordBlock = firstChild?.nextElementSibling as HTMLElement | null;
  if (keywordBlock && keywordBlock !== sortToolbar && !keywordBlock.classList.contains('v141-member-teaser')) {
    keywordBlock.classList.add('v141-keywords');
  }

  ensureMemberTeaser(homeShell, sortToolbar);
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

const observer = new MutationObserver(queueSync);
observer.observe(document.body, { childList: true, subtree: true });
window.addEventListener('pageshow', syncHomeLayout);
window.addEventListener('storage', event => {
  if (event.key === HOME_CACHE_KEY || event.key === 'sq_current_user_v1') queueSync();
});
