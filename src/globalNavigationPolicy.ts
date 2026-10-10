const STYLE_ID = 'echostars-global-navigation-policy';
const ROOT_CLASS = 'echostars-fixed-main-nav';
const NAV_SELECTOR = 'header.sticky.top-0';
const HAMBURGER_SELECTOR = 'button[data-main-menu="hamburger"]';
const MENU_PANEL_SELECTOR = '.mobile-menu-panel[data-react-menu="true"], .mobile-menu-panel';

function installGlobalNavigationStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    :root {
      --echostars-main-nav-height: 4rem;
    }

    @media (min-width: 640px) {
      :root {
        --echostars-main-nav-height: 72px;
      }
    }

    html.${ROOT_CLASS} ${NAV_SELECTOR} {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      right: 0 !important;
      width: 100% !important;
      z-index: 40 !important;
      transform: translateZ(0);
      -webkit-transform: translateZ(0);
    }

    html.${ROOT_CLASS} #root {
      padding-top: var(--echostars-main-nav-height);
    }
  `;
  document.head.appendChild(style);
}

function syncGlobalNavigationState() {
  const hasMainNav = Boolean(document.querySelector(NAV_SELECTOR));
  document.documentElement.classList.toggle(ROOT_CLASS, hasMainNav);
}

function openHamburgerButton() {
  const button = document.querySelector<HTMLButtonElement>(HAMBURGER_SELECTOR);
  return button?.getAttribute('aria-expanded') === 'true' ? button : null;
}

function targetIsInsideMenu(target: EventTarget | null) {
  return target instanceof Node && Boolean((target as Element).closest?.(MENU_PANEL_SELECTOR));
}

function targetIsHamburger(target: EventTarget | null) {
  return target instanceof Node && Boolean((target as Element).closest?.(HAMBURGER_SELECTOR));
}

function closeHamburgerMenu() {
  const button = openHamburgerButton();
  if (!button) return;
  button.click();
}

function installHamburgerDismissPolicy() {
  // One global owner for dismissal. React still owns opening, menu actions and
  // the two intentional keep-open controls (font size and 好心情/palette).
  // Clicking or swiping/scrolling anywhere outside the actual menu closes it.
  document.addEventListener('pointerdown', event => {
    if (!openHamburgerButton()) return;
    if (targetIsHamburger(event.target) || targetIsInsideMenu(event.target)) return;
    closeHamburgerMenu();
  }, true);

  document.addEventListener('touchmove', event => {
    if (!openHamburgerButton()) return;
    if (targetIsInsideMenu(event.target)) return;
    closeHamburgerMenu();
  }, { capture: true, passive: true });

  document.addEventListener('scroll', event => {
    if (!openHamburgerButton()) return;
    if (targetIsInsideMenu(event.target)) return;
    closeHamburgerMenu();
  }, true);

  window.addEventListener('blur', closeHamburgerMenu);
}

installGlobalNavigationStyle();
syncGlobalNavigationState();
installHamburgerDismissPolicy();

const observer = new MutationObserver(() => syncGlobalNavigationState());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('pageshow', syncGlobalNavigationState);
window.addEventListener('resize', syncGlobalNavigationState);
