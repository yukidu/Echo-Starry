const STYLE_ID = 'echostars-v144-guest-cta-filter-preview';
let syncFrame = 0;
let registrationObserver: MutationObserver | null = null;
let registrationTimer = 0;

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* v144 試用版：完全獨立於原始篩選按鈕樣式，移除此檔即可復原。 */
    .v141-member-teaser-summary {
      font-size: 1.05rem !important;
      font-weight: 900 !important;
      gap: .34rem !important;
      line-height: 1.45 !important;
    }
    .v141-member-teaser-summary strong {
      font-size: 1.24rem !important;
      font-weight: 950 !important;
    }
    .v144-guest-stat-separator {
      color: color-mix(in srgb,var(--theme-text-secondary,#64748b) 78%,transparent);
      font-weight: 700;
      padding-inline: .12rem;
    }

    html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview {
      gap: .42rem !important;
      padding: .18rem 0 !important;
      border: 0 !important;
      border-radius: 0 !important;
      background: transparent !important;
      box-shadow: none !important;
    }
    html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview .sort-toolbar-item > button {
      height: 46px !important;
      border-radius: 14px !important;
      background: linear-gradient(180deg,#1c2738 0%,#111827 100%) !important;
      color: #f8fafc !important;
      border: 1px solid #334155 !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,.055), 0 7px 16px rgba(2,6,23,.24) !important;
      opacity: 1 !important;
      filter: none !important;
    }
    html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview .sort-toolbar-item > button:hover {
      background: linear-gradient(180deg,#263449 0%,#172033 100%) !important;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 42%,#475569) !important;
      transform: translateY(-1px);
    }
    html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview .sort-toolbar-item > button.ring-2 {
      background: linear-gradient(180deg,
        color-mix(in srgb,var(--color-primary,#c06c84) 86%,#1f2937),
        color-mix(in srgb,var(--color-primary,#c06c84) 68%,#111827)) !important;
      border-color: color-mix(in srgb,var(--color-primary,#c06c84) 78%,white) !important;
      box-shadow: 0 0 0 1px color-mix(in srgb,var(--color-primary,#c06c84) 28%,transparent),
                  0 8px 20px color-mix(in srgb,var(--color-primary,#c06c84) 24%,rgba(2,6,23,.25)) !important;
    }
    html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview .sort-direction-icon {
      background: rgba(255,255,255,.96) !important;
      color: var(--color-primary,#c06c84) !important;
    }
    html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview .sort-toolbar-item > div {
      background: #111827 !important;
      border-color: #334155 !important;
      color: #f8fafc !important;
    }

    @media (max-width: 639px) {
      .v141-member-teaser-summary {
        font-size: .92rem !important;
        gap: .22rem !important;
      }
      .v141-member-teaser-summary strong {
        font-size: 1.08rem !important;
      }
      .v144-guest-stat-separator { padding-inline: 0; }
      html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview {
        gap: .3rem !important;
      }
      html.echostars-v141-home .sort-toolbar.v144-filter-dark-preview .sort-toolbar-item > button {
        border-radius: 12px !important;
        font-size: 9px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function patchGuestStatisticsCopy() {
  if (!isGuestMode()) return;
  const summary = document.querySelector<HTMLElement>('.v141-member-teaser-summary');
  if (!summary || summary.dataset.v144ExactGuestCopy === '1') return;

  const guestCount = summary.querySelector<HTMLElement>('[data-v141-guest-count]');
  const totalCount = summary.querySelector<HTMLElement>('[data-v142-total-count]');
  const unlock = summary.querySelector<HTMLButtonElement>('.v141-member-teaser-unlock');
  if (!guestCount || !totalCount || !unlock) return;

  const guestLabel = document.createElement('span');
  guestLabel.className = 'v144-guest-stat-label';
  guestLabel.append('訪客可聽 ', guestCount, ' 部音檔');

  const separator = document.createElement('span');
  separator.className = 'v144-guest-stat-separator';
  separator.textContent = ' | ';

  const totalLabel = document.createElement('span');
  totalLabel.className = 'v144-guest-stat-label';
  totalLabel.append('全站音檔共 ', totalCount, ' 部');

  summary.replaceChildren(guestLabel, separator, totalLabel, unlock);
  summary.dataset.v144ExactGuestCopy = '1';
}

function patchFilterPreview() {
  const toolbar = document.querySelector<HTMLElement>('.sort-toolbar');
  if (!toolbar) return;
  toolbar.classList.add('v144-filter-dark-preview');
  toolbar.dataset.v144FilterPreview = 'dark';
}

function findAndOpenGuestProfile() {
  const identity = document.querySelector<HTMLButtonElement>('.navbar-menu-identity');
  if (identity) {
    registrationObserver?.disconnect();
    registrationObserver = null;
    if (registrationTimer) window.clearTimeout(registrationTimer);
    registrationTimer = 0;
    identity.click();
    return true;
  }
  const login = Array.from(document.querySelectorAll<HTMLButtonElement>('.navbar-menu-footer-button'))
    .find(button => button.textContent?.trim() === '登入');
  if (login) {
    registrationObserver?.disconnect();
    registrationObserver = null;
    if (registrationTimer) window.clearTimeout(registrationTimer);
    registrationTimer = 0;
    login.click();
    return true;
  }
  return false;
}

function openGuestRegistration() {
  if (!isGuestMode()) return;
  if (findAndOpenGuestProfile()) return;

  const hamburger = document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]');
  if (!hamburger) return;
  if (hamburger.getAttribute('aria-expanded') !== 'true') hamburger.click();

  registrationObserver?.disconnect();
  registrationObserver = new MutationObserver(() => {
    findAndOpenGuestProfile();
  });
  registrationObserver.observe(document.body, { childList: true, subtree: true });

  if (registrationTimer) window.clearTimeout(registrationTimer);
  registrationTimer = window.setTimeout(() => {
    if (!findAndOpenGuestProfile()) {
      registrationObserver?.disconnect();
      registrationObserver = null;
    }
    registrationTimer = 0;
  }, 2000);

  window.requestAnimationFrame(() => findAndOpenGuestProfile());
}

function sync() {
  installStyles();
  patchGuestStatisticsCopy();
  patchFilterPreview();
}

function queueSync() {
  if (syncFrame) return;
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0;
    sync();
  });
}

installStyles();
sync();

/*
 * v143 在 document capture 階段攔截 CTA；v144 改在更早的 window capture 階段處理，
 * 保證點擊一定進入有上限（2 秒）的登入／註冊開啟流程，不做無限輪詢。
 */
window.addEventListener('click', event => {
  const target = event.target as Element | null;
  if (!target?.closest('.v141-member-teaser-unlock')) return;
  event.preventDefault();
  event.stopPropagation();
  openGuestRegistration();
}, true);

window.addEventListener('pageshow', queueSync);
window.addEventListener('storage', event => {
  if (event.key === 'sq_current_user_v1' || event.key === 'echostars_home_cache_v3_3') queueSync();
});

function shouldSkipLuckyGridMutations(records: MutationRecord[]) {
  const grid = document.querySelector<HTMLElement>('.audio-card-grid.lucky-spin-active');
  return Boolean(grid && records.length && records.every(record => record.target === grid || grid.contains(record.target)));
}

const observer = new MutationObserver(records => {
  if (shouldSkipLuckyGridMutations(records)) return;
  queueSync();
});
observer.observe(document.body, { childList: true, subtree: true });
