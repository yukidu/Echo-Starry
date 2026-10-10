const STYLE_ID = 'echostars-global-navigation-policy';
const ROOT_CLASS = 'echostars-fixed-main-nav';
const NAV_SELECTOR = 'header.sticky.top-0';
const MENU_PANEL_SELECTOR = '.mobile-menu-panel[data-react-menu="true"]';
const MENU_BUTTON_SELECTOR = '[data-main-menu="hamburger"]';
const MENU_KEEP_OPEN_SELECTOR = '.navbar-menu-font-controls, .navbar-menu-palette-shortcut';

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

function getOpenMainMenu() {
  return document.querySelector<HTMLElement>(MENU_PANEL_SELECTOR);
}

function closeOpenMainMenu() {
  if (!getOpenMainMenu()) return;
  const button = document.querySelector<HTMLButtonElement>(MENU_BUTTON_SELECTOR);
  if (button?.getAttribute('aria-expanded') === 'true') button.click();
}

function installUniversalMainMenuDismissal() {
  const handlePointerDown = (event: PointerEvent) => {
    const panel = getOpenMainMenu();
    if (!panel) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target || target.closest(MENU_BUTTON_SELECTOR)) return;

    if (!panel.contains(target)) {
      closeOpenMainMenu();
      return;
    }

    // Font-size controls and the 好心情 palette are the only menu actions
    // intentionally allowed to keep the drawer open.
    if (target.closest(MENU_KEEP_OPEN_SELECTOR)) return;

    if (target.closest('button, a, [role="button"], input, select, textarea, label')) {
      window.requestAnimationFrame(() => {
        if (getOpenMainMenu()) closeOpenMainMenu();
      });
    }
  };

  const dismissOnMovement = () => closeOpenMainMenu();

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('scroll', dismissOnMovement, true);
  document.addEventListener('wheel', dismissOnMovement, { passive: true, capture: true });
  document.addEventListener('touchmove', dismissOnMovement, { passive: true, capture: true });
}

installGlobalNavigationStyle();
syncGlobalNavigationState();
installUniversalMainMenuDismissal();

const observer = new MutationObserver(() => syncGlobalNavigationState());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});

window.addEventListener('pageshow', syncGlobalNavigationState);
window.addEventListener('resize', syncGlobalNavigationState);
