import './globalNavigationPolicy.css';

const NAVBAR_SELECTOR = 'header';
const MAIN_SELECTOR = 'main';
const MENU_PANEL_SELECTOR = '.mobile-menu-panel[data-react-menu="true"]';
const MENU_BUTTON_SELECTOR = '[data-main-menu="hamburger"]';
const MENU_KEEP_OPEN_SELECTOR = '.navbar-menu-font-controls, .navbar-menu-palette-shortcut';
const MENU_ACTION_SELECTOR = 'button, a, [role="button"], input, select, textarea, label';
const SUMMON_BUTTON_TITLE = '召喚繁星';

function installGlobalNavigationStyle() {
  if (document.getElementById('echostars-global-navigation-style')) return;

  const style = document.createElement('style');
  style.id = 'echostars-global-navigation-style';
  style.textContent = `
    :root {
      --echostars-navbar-height: 56px;
    }

    @media (min-width: 640px) {
      :root {
        --echostars-navbar-height: 64px;
      }
    }

    body[data-echostars-fixed-navbar="true"] {
      padding-top: var(--echostars-navbar-height);
    }

    body[data-echostars-fixed-navbar="true"] > #root > header,
    body[data-echostars-fixed-navbar="true"] #root > header:first-child,
    body[data-echostars-fixed-navbar="true"] header[data-echostars-navbar="true"] {
      position: fixed !important;
      inset: 0 0 auto 0 !important;
      width: 100% !important;
      z-index: 40 !important;
    }

    body[data-echostars-fixed-navbar="true"] main {
      scroll-margin-top: calc(var(--echostars-navbar-height) + 10px);
    }
  `;
  document.head.appendChild(style);
}

function navbarLooksPrimary(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  return Boolean(element.querySelector(MENU_BUTTON_SELECTOR));
}

function syncGlobalNavigationState() {
  const headers = Array.from(document.querySelectorAll<HTMLElement>(NAVBAR_SELECTOR));
  const navbar = headers.find(navbarLooksPrimary) || null;

  if (!navbar) {
    delete document.body.dataset.echostarsFixedNavbar;
    return;
  }

  navbar.dataset.echostarsNavbar = 'true';
  document.body.dataset.echostarsFixedNavbar = 'true';

  const rect = navbar.getBoundingClientRect();
  const measured = Math.round(rect.height);
  if (measured > 0 && measured < 240) {
    document.documentElement.style.setProperty('--echostars-navbar-height', `${measured}px`);
  }

  const main = document.querySelector<HTMLElement>(MAIN_SELECTOR);
  if (main) main.style.scrollMarginTop = 'calc(var(--echostars-navbar-height) + 10px)';

  const summonButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    const title = button.getAttribute('title')?.trim();
    const text = button.textContent?.trim();
    return title === SUMMON_BUTTON_TITLE || text === SUMMON_BUTTON_TITLE;
  });

  if (summonButton) {
    summonButton.classList.add('echostars-summon-button');
    const button = summonButton;
    // Inline important properties keep this button stable against old mobile
    // compatibility rules that used selector specificity to force 50px/12px.
    button.style.setProperty('box-sizing', 'border-box', 'important');
    button.style.setProperty('height', '46px', 'important');
    button.style.setProperty('min-height', '46px', 'important');
    button.style.setProperty('max-height', '46px', 'important');
    button.style.setProperty('padding-top', '0', 'important');
    button.style.setProperty('padding-bottom', '0', 'important');
    button.style.setProperty('font-size', '22px', 'important');
    button.style.setProperty('line-height', '1', 'important');
  }
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

    if (panel.contains(target)) {
      // Keep the full press→release gesture owned by the menu action even if
      // React redraws the row during the gesture. Without capture, mobile
      // browsers can retarget pointerup/click to the page underneath.
      const action = target.closest<HTMLElement>(MENU_ACTION_SELECTOR);
      if (action && panel.contains(action)) {
        try {
          action.setPointerCapture(event.pointerId);
        } catch {
          // Some synthetic/legacy pointer sources cannot be captured. The
          // existing shield still protects outside taps in that case.
        }
      }
      return;
    }

    // Outside taps land on the transparent menu shell, not on the page below.
    closeOpenMainMenu();
  };

  const handleCompletedClick = (event: MouseEvent) => {
    const panel = getOpenMainMenu();
    if (!panel) return;

    const target = event.target instanceof Element ? event.target : null;
    if (!target || !panel.contains(target)) return;

    // Font-size controls and 好心情 are the only actions that intentionally
    // keep the drawer open. All others close only after the complete browser
    // click gesture has settled. A short delay keeps the menu shield mounted
    // through compatibility mouse events and prevents the same tap from being
    // retargeted to content underneath when React redraws (for example theme).
    if (target.closest(MENU_KEEP_OPEN_SELECTOR)) return;
    if (!target.closest(MENU_ACTION_SELECTOR)) return;

    window.setTimeout(() => {
      if (getOpenMainMenu()) closeOpenMainMenu();
    }, 100);
  };

  const dismissOnMovement = () => closeOpenMainMenu();

  document.addEventListener('pointerdown', handlePointerDown, true);
  document.addEventListener('click', handleCompletedClick, true);
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
