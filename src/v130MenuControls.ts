const FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';
const STYLE_ID = 'echostars-v130-menu-controls';

function readFontZoom() {
  try {
    const value = Number(localStorage.getItem(FONT_ZOOM_KEY));
    return Number.isFinite(value) ? Math.min(1.4, Math.max(1, value)) : 1;
  } catch {
    return 1;
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* v130: user font zoom must not enlarge the hamburger menu itself. */
    .mobile-menu-panel {
      transform-origin: top right;
      position: relative;
    }

    .navbar-menu-home-shortcut {
      flex-direction: column !important;
      gap: 0.12rem !important;
      min-width: 3.15rem !important;
      min-height: 2.75rem !important;
      padding: 0.3rem 0.22rem !important;
      font-size: 0.58rem !important;
      line-height: 1.05 !important;
    }
    .navbar-menu-home-shortcut > svg {
      width: 1rem !important;
      height: 1rem !important;
    }
    .navbar-menu-home-shortcut > span {
      display: block !important;
      margin: 0 !important;
      font-size: 0.58rem !important;
      font-weight: 850 !important;
      line-height: 1.05 !important;
      white-space: nowrap !important;
    }

    .v130-font-row {
      justify-content: flex-start !important;
    }
    .v130-font-row .v130-font-label {
      flex: 0 0 auto !important;
      min-width: 0 !important;
      margin-right: 0.1rem !important;
    }
    .v130-font-row .navbar-menu-mini-control {
      margin-left: 0 !important;
      margin-right: 0 !important;
    }

    .v130-logout-row {
      width: auto !important;
      align-self: flex-start;
      padding-right: 0.65rem !important;
    }
    .v130-reset-menu-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      align-self: flex-end;
      margin-top: -2.55rem;
      margin-right: 0.15rem;
      margin-bottom: 0.2rem;
      padding: 0.5rem 0.65rem;
      border-radius: 0.75rem;
      font-size: 0.78rem;
      font-weight: 850;
      white-space: nowrap;
      color: rgb(71 85 105) !important;
      background: rgb(241 245 249);
    }
    .v130-reset-menu-button:hover {
      background: rgb(226 232 240);
    }
    .dark .v130-reset-menu-button {
      color: rgb(226 232 240) !important;
      background: rgb(51 65 85);
    }
    .dark .v130-reset-menu-button:hover {
      background: rgb(71 85 105);
    }
  `;
  document.head.appendChild(style);
}

function syncHomeShortcut(panel: HTMLElement) {
  const home = panel.querySelector<HTMLButtonElement>('.navbar-menu-home-shortcut');
  if (!home) return;
  home.title = '回首頁';
  home.setAttribute('aria-label', '回首頁');
  let label = home.querySelector<HTMLSpanElement>('span');
  if (!label) {
    label = document.createElement('span');
    home.appendChild(label);
  }
  label.textContent = '回首頁';
}

function syncMoodShortcut(panel: HTMLElement) {
  const mood = panel.querySelector<HTMLButtonElement>('.navbar-menu-palette-shortcut');
  if (!mood) return;
  mood.title = '換個心情';
  mood.setAttribute('aria-label', '換個心情');
  let label = mood.querySelector<HTMLSpanElement>('span');
  if (!label) {
    label = document.createElement('span');
    mood.appendChild(label);
  }
  label.textContent = '換個心情';
}

function syncFontRow(panel: HTMLElement) {
  const minus = panel.querySelector<HTMLButtonElement>('button[aria-label="縮小字體"]');
  const row = minus?.closest<HTMLElement>('.mobile-menu-row');
  if (!row) return;
  row.classList.add('v130-font-row');

  const spans = Array.from(row.children).filter(child => child instanceof HTMLSpanElement) as HTMLSpanElement[];
  const fontLabel = spans.find(span => span.textContent?.trim() === '字體');
  fontLabel?.classList.add('v130-font-label');
}

function applyMenuZoomCompensation(panel: HTMLElement) {
  const zoom = readFontZoom();
  panel.style.setProperty('zoom', String(Math.round((1 / zoom) * 10000) / 10000));
}

function pinButtons(panel: HTMLElement) {
  return Array.from(panel.querySelectorAll<HTMLButtonElement>('.navbar-inline-pin'));
}

function resetCurrentDeviceMenu(panel: HTMLElement) {
  // Use Navbar's existing pin handlers so React state, local cache, and the
  // debounced member cloud sync all stay on the same code path.
  pinButtons(panel)
    .filter(button => button.getAttribute('aria-pressed') === 'true')
    .forEach(button => button.click());

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const freshPanel = document.querySelector<HTMLElement>('.mobile-menu-panel');
      if (!freshPanel) return;
      const buttons = pinButtons(freshPanel);
      const clickUnselected = (needle: string) => {
        const button = buttons.find(candidate => (candidate.getAttribute('aria-label') || '').includes(`：${needle}`));
        if (button && button.getAttribute('aria-pressed') !== 'true') button.click();
      };
      clickUnselected('字體');
      clickUnselected('淺色／暗色切換');
      scheduleSync();
    });
  });
}

function syncFooter(panel: HTMLElement) {
  const logout = Array.from(panel.querySelectorAll<HTMLButtonElement>('button'))
    .find(button => button.textContent?.trim() === '登出');
  if (!logout) return;
  logout.classList.add('v130-logout-row');

  if (panel.querySelector('.v130-reset-menu-button')) return;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'v130-reset-menu-button';
  reset.textContent = '重設選單';
  reset.title = '將此裝置的置頂選單恢復預設';
  reset.setAttribute('aria-label', '重設選單');
  reset.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    resetCurrentDeviceMenu(panel);
  });
  logout.insertAdjacentElement('afterend', reset);
}

function syncPanel(panel: HTMLElement) {
  applyMenuZoomCompensation(panel);
  syncHomeShortcut(panel);
  syncMoodShortcut(panel);
  syncFontRow(panel);
  syncFooter(panel);
}

function syncMenu() {
  installStyles();
  document.querySelectorAll<HTMLElement>('.mobile-menu-panel').forEach(syncPanel);
}

let scheduled = false;
function scheduleSync() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    syncMenu();
  }, 0);
  window.requestAnimationFrame(() => syncMenu());
}

installStyles();

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (
    target.closest('button[data-main-menu="hamburger"]') ||
    target.closest('.mobile-menu-panel') ||
    target.closest('button[aria-label="縮小字體"]') ||
    target.closest('button[aria-label="放大字體"]')
  ) {
    scheduleSync();
  }
}, true);

window.addEventListener('resize', scheduleSync);
window.addEventListener('orientationchange', scheduleSync);
window.addEventListener('pageshow', scheduleSync);
window.addEventListener('storage', event => {
  if (event.key === FONT_ZOOM_KEY) scheduleSync();
});

syncMenu();
