const CROWN_MENU_ATTR = 'data-taiwan-crown-menu';
const MENU_PANEL_SELECTOR = '.mobile-menu-panel[data-react-menu="true"]';

function crownPageUrl() {
  const primary = getComputedStyle(document.documentElement)
    .getPropertyValue('--color-primary')
    .trim() || '#c06c84';
  const dark = document.documentElement.classList.contains('dark')
    || document.body.classList.contains('dark')
    || localStorage.getItem('sq_theme_dark') === 'true';
  const url = new URL('/taiwan-crown.html', window.location.origin);
  url.searchParams.set('primary', primary);
  url.searchParams.set('dark', dark ? '1' : '0');
  return url.toString();
}

function buildCrownMenuRow() {
  const row = document.createElement('div');
  row.setAttribute(CROWN_MENU_ATTR, 'true');
  row.className = 'mobile-menu-row flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800';

  const spacer = document.createElement('span');
  spacer.className = 'navbar-pin-placeholder';
  spacer.setAttribute('aria-hidden', 'true');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex min-w-0 flex-1 items-center gap-3 text-left py-0.5';
  button.setAttribute('aria-label', '臺灣皇冠大使');
  button.title = '臺灣皇冠大使';

  const icon = document.createElement('span');
  icon.className = 'w-4 shrink-0 text-center leading-none';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '👑';

  const label = document.createElement('span');
  label.textContent = '臺灣皇冠大使';

  button.append(icon, label);
  button.addEventListener('click', () => {
    window.location.assign(crownPageUrl());
  });
  row.append(spacer, button);
  return row;
}

function ensureCrownMenuRow(panel: Element) {
  if (panel.querySelector(`[${CROWN_MENU_ATTR}]`)) return;
  const footerActions = panel.querySelector('.navbar-menu-footer-actions');
  const footerDivider = footerActions?.previousElementSibling;
  const row = buildCrownMenuRow();
  panel.insertBefore(row, footerDivider || footerActions || null);
}

function syncCrownMenuRows() {
  document.querySelectorAll(MENU_PANEL_SELECTOR).forEach(ensureCrownMenuRow);
}

function startCrownMenuLink() {
  syncCrownMenuRows();
  const observer = new MutationObserver(syncCrownMenuRows);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) startCrownMenuLink();
else window.addEventListener('DOMContentLoaded', startCrownMenuLink, { once: true });
