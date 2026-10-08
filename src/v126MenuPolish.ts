const FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';
const VISITOR_KEY = 'sq_visitor_identity_v1';
const LEGACY_FONT_CONTROL_SELECTOR = '[data-echostars-font-control]';
const FONT_MINUS_SELECTOR = 'button[aria-label="縮小字體"]';
const STYLE_ID = 'echostars-v126-menu-polish';

type InstallNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
};

let pwaInstalled = false;

function clampPersonalFontZoom() {
  try {
    const raw = Number(localStorage.getItem(FONT_ZOOM_KEY));
    const normalized = Number.isFinite(raw) ? Math.min(1.4, Math.max(1, raw)) : 1;
    if (!Number.isFinite(raw) || raw !== normalized) {
      localStorage.setItem(FONT_ZOOM_KEY, String(normalized));
    }
    return normalized;
  } catch {
    return 1;
  }
}

function isStandalone() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as InstallNavigator).standalone === true
  );
}

async function detectInstalledPwa() {
  if (isStandalone()) {
    pwaInstalled = true;
    syncMenuPolish();
    return;
  }

  const installNavigator = navigator as InstallNavigator;
  if (typeof installNavigator.getInstalledRelatedApps !== 'function') return;

  try {
    const apps = await installNavigator.getInstalledRelatedApps();
    if (apps.some(app => app.platform === 'webapp')) {
      pwaInstalled = true;
      syncMenuPolish();
    }
  } catch {
    // Browser support differs. The existing install button remains the fallback.
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Font zoom changes page content, but the main brand stays visually fixed. */
    .brand-logo-glow {
      gap: 8px !important;
    }
    .brand-logo-glow > div:first-child {
      width: 32px !important;
      height: 32px !important;
      flex-basis: 32px !important;
      border-radius: 16px !important;
    }
    .brand-logo-glow > div:first-child > svg {
      width: 16px !important;
      height: 16px !important;
    }
    .brand-logo-glow .echo-wave-text {
      font-size: 16px !important;
      line-height: 20px !important;
      letter-spacing: 0.05em !important;
    }
    .v126-visitor-animal {
      display: inline-block;
      margin-right: 6px;
      font-size: 18px !important;
      line-height: 1 !important;
      vertical-align: -1px;
    }
    .navbar-menu-palette-shortcut {
      display: inline-flex !important;
      width: 3.45rem;
      min-height: 2.75rem;
      flex: 0 0 3.45rem;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 0.12rem;
      padding: 0.3rem 0.22rem;
      border-radius: 0.65rem;
      background: rgb(241 245 249);
      color: rgb(51 65 85);
      font-size: 0.58rem;
      font-weight: 850;
      line-height: 1.05;
      white-space: nowrap;
    }
    .dark .navbar-menu-palette-shortcut {
      background: rgb(51 65 85);
      color: rgb(241 245 249);
    }
    .navbar-menu-palette-shortcut > svg {
      width: 16px !important;
      height: 16px !important;
      flex: 0 0 16px;
    }
    .navbar-menu-palette-shortcut > span {
      margin: 0 !important;
      font-size: 0.58rem !important;
      font-weight: 850 !important;
      line-height: 1.05 !important;
      color: inherit !important;
    }
    @media (min-width: 640px) {
      .brand-logo-glow {
        gap: 10px !important;
      }
      .brand-logo-glow > div:first-child {
        width: 40px !important;
        height: 40px !important;
        flex-basis: 40px !important;
        border-radius: 16px !important;
      }
      .brand-logo-glow > div:first-child > svg {
        width: 20px !important;
        height: 20px !important;
      }
      .brand-logo-glow .echo-wave-text {
        font-size: 20px !important;
        line-height: 24px !important;
      }
    }
    @media (max-width: 420px) {
      .navbar-menu-palette-shortcut {
        width: 3.15rem;
        flex-basis: 3.15rem;
      }
    }
  `;
  document.head.appendChild(style);
}

function readVisitorEmoji() {
  try {
    const visitor = JSON.parse(localStorage.getItem(VISITOR_KEY) || 'null');
    return typeof visitor?.emoji === 'string' && visitor.emoji.trim() ? visitor.emoji.trim() : '🦁';
  } catch {
    return '🦁';
  }
}

function removeLegacyFontControl(panel: HTMLElement) {
  panel.querySelectorAll<HTMLElement>(LEGACY_FONT_CONTROL_SELECTOR).forEach(element => {
    if (element.dataset.echostarsFontControl !== 'v126-disabled') element.remove();
  });

  if (!panel.querySelector(LEGACY_FONT_CONTROL_SELECTOR)) {
    // The old density policy checks only for this marker before injecting its
    // duplicate row. A hidden sentinel permanently disables that retired UI.
    const sentinel = document.createElement('span');
    sentinel.dataset.echostarsFontControl = 'v126-disabled';
    sentinel.hidden = true;
    sentinel.setAttribute('aria-hidden', 'true');
    panel.prepend(sentinel);
  }
}

function isVisitorMenu(panel: HTMLElement) {
  const head = panel.querySelector<HTMLElement>('.navbar-menu-profile-head');
  if (!head) return false;
  return Array.from(head.querySelectorAll<HTMLElement>('div')).some(element => element.textContent?.trim() === '訪客');
}

function addVisitorAnimal(panel: HTMLElement) {
  if (!isVisitorMenu(panel)) return;
  const head = panel.querySelector<HTMLElement>('.navbar-menu-profile-head');
  const info = head?.firstElementChild as HTMLElement | null;
  const name = info?.firstElementChild as HTMLElement | null;
  if (!name || name.querySelector('.v126-visitor-animal')) return;

  const animal = document.createElement('span');
  animal.className = 'v126-visitor-animal';
  animal.setAttribute('aria-hidden', 'true');
  animal.textContent = readVisitorEmoji();
  name.prepend(animal);
}

function simplifyVisitorStickerLabel(panel: HTMLElement) {
  if (!isVisitorMenu(panel)) return;
  const button = Array.from(panel.querySelectorAll<HTMLButtonElement>('.mobile-menu-row > button'))
    .find(element => (element.textContent || '').includes('我的貼紙'));
  const label = button?.querySelector<HTMLElement>('span');
  if (label && label.textContent?.trim() !== '我的貼紙') label.textContent = '我的貼紙';
}

function findPaletteAction(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>('.mobile-menu-row > button'))
    .find(element => (element.textContent || '').includes('切換配色')) || null;
}

function syncInstalledHeaderAction(panel: HTMLElement) {
  const headerActions = panel.querySelector<HTMLElement>('.navbar-menu-header-actions');
  const installButton = panel.querySelector<HTMLButtonElement>('.navbar-menu-install-shortcut');
  const paletteButton = findPaletteAction(panel);
  const paletteRow = paletteButton?.closest<HTMLElement>('.mobile-menu-row') || null;
  const componentReportsInstalled = installButton?.getAttribute('aria-label') === '繁星回聲已安裝';
  const installedNow = pwaInstalled || componentReportsInstalled || isStandalone();

  if (!installedNow) {
    installButton?.style.removeProperty('display');
    paletteRow?.style.removeProperty('display');
    headerActions?.querySelector('.navbar-menu-palette-shortcut')?.remove();
    return;
  }

  pwaInstalled = true;
  installButton?.style.setProperty('display', 'none', 'important');
  paletteRow?.style.setProperty('display', 'none', 'important');
  if (!headerActions || !paletteButton || headerActions.querySelector('.navbar-menu-palette-shortcut')) return;

  const shortcut = document.createElement('button');
  shortcut.type = 'button';
  shortcut.className = 'navbar-menu-palette-shortcut';
  shortcut.title = '隨機配色';
  shortcut.setAttribute('aria-label', '隨機配色');
  const icon = paletteButton.querySelector('svg')?.cloneNode(true);
  if (icon) shortcut.appendChild(icon);
  const text = document.createElement('span');
  text.textContent = '隨機配色';
  shortcut.appendChild(text);
  shortcut.addEventListener('click', () => paletteButton.click());
  headerActions.prepend(shortcut);
}

function syncFontMinusButtons() {
  const zoom = clampPersonalFontZoom();
  document.querySelectorAll<HTMLButtonElement>(FONT_MINUS_SELECTOR).forEach(button => {
    button.disabled = zoom <= 1;
    button.setAttribute('aria-disabled', zoom <= 1 ? 'true' : 'false');
  });
}

function syncMenuPolish() {
  installStyles();
  syncFontMinusButtons();
  document.querySelectorAll<HTMLElement>('.mobile-menu-panel').forEach(panel => {
    removeLegacyFontControl(panel);
    addVisitorAnimal(panel);
    simplifyVisitorStickerLabel(panel);
    syncInstalledHeaderAction(panel);
  });
}

// Normalize old 80% / 90% personal settings from earlier releases before the
// current controls can be used. 100% is now the lowest supported user scale.
clampPersonalFontZoom();
installStyles();

// Stop the React A− handler at 100%. At larger sizes React keeps its original
// behavior, so the control can step back down to exactly 100% but never lower.
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(FONT_MINUS_SELECTOR) : null;
  if (!target) return;
  if (clampPersonalFontZoom() <= 1) {
    event.preventDefault();
    event.stopImmediatePropagation();
    syncFontMinusButtons();
    return;
  }
  window.setTimeout(syncFontMinusButtons, 0);
}, true);

const observer = new MutationObserver(syncMenuPolish);
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['aria-label']
});

window.addEventListener('appinstalled', () => {
  pwaInstalled = true;
  syncMenuPolish();
});
window.addEventListener('pageshow', syncMenuPolish);
window.addEventListener('storage', event => {
  if (event.key === FONT_ZOOM_KEY) syncFontMinusButtons();
});

const standaloneMedia = window.matchMedia('(display-mode: standalone)');
standaloneMedia.addEventListener?.('change', event => {
  if (event.matches) pwaInstalled = true;
  syncMenuPolish();
});

void detectInstalledPwa();
syncMenuPolish();
