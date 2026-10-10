const STYLE_ID = 'echostars-global-navigation-policy';
const ROOT_CLASS = 'echostars-fixed-main-nav';
const NAV_SELECTOR = 'header.sticky.top-0';
const MENU_PANEL_SELECTOR = '.mobile-menu-panel[data-react-menu="true"]';
const MENU_SHELL_SELECTOR = '.mobile-menu-shell';
const MENU_BUTTON_SELECTOR = '[data-main-menu="hamburger"]';
const MENU_KEEP_OPEN_SELECTOR = '.navbar-menu-font-controls, .navbar-menu-palette-shortcut';
const MENU_ACTION_SELECTOR = 'button, a, [role="button"], input, select, textarea, label';
const SUMMON_BUTTON_SELECTOR = 'button[title="從目前條件下可播放的音檔中召喚繁星解答"]';
const SUMMON_BUTTON_CLASS = 'echostars-summon-button';

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

    /* v164: while the drawer is open, a transparent interaction shield owns
       the area below the navbar. Taps outside the panel close the menu instead
       of falling through to buttons/cards underneath. */
    ${MENU_SHELL_SELECTOR} {
      position: fixed !important;
      top: 56px !important;
      right: 0 !important;
      bottom: 0 !important;
      left: 0 !important;
      z-index: 55 !important;
      display: flex !important;
      align-items: flex-start !important;
      justify-content: flex-end !important;
      padding: 12px !important;
      background: transparent !important;
      pointer-events: auto !important;
      overflow: hidden !important;
    }

    @media (min-width: 640px) {
      ${MENU_SHELL_SELECTOR} {
        top: 64px !important;
      }
    }

    ${MENU_SHELL_SELECTOR} ${MENU_PANEL_SELECTOR} {
      pointer-events: auto !important;
      max-height: calc(100dvh - 80px) !important;
      overflow-y: auto !important;
      overscroll-behavior: contain;
    }

    /* v164: summon presentation is injected from the same runtime policy that
       is known to execute on the live site. Inline-important sizing is also
       applied in syncGlobalNavigationState so older high-specificity mobile
       rules cannot shrink this dedicated action again. */
    .${SUMMON_BUTTON_CLASS} {
      position: relative !important;
      isolation: isolate !important;
      overflow: hidden !important;
      box-sizing: border-box !important;
      height: 46px !important;
      min-height: 46px !important;
      max-height: 46px !important;
      padding-block: 0 !important;
      padding-inline: 1.05rem !important;
      gap: 0.38rem !important;
      font-size: 1.28rem !important;
      line-height: 1 !important;
      letter-spacing: 0.025em !important;
      box-shadow: 0 5px 16px color-mix(in srgb, var(--color-primary, #c06c84) 36%, transparent), inset 0 0 0 1px rgb(255 255 255 / 0.24) !important;
    }

    .${SUMMON_BUTTON_CLASS}::before {
      content: "✦" !important;
      position: relative;
      z-index: 2;
      display: inline-grid;
      place-items: center;
      flex: 0 0 auto;
      font-size: 1.22em;
      line-height: 1;
      color: #fff7c2;
      text-shadow: 0 0 5px rgb(255 255 255 / 0.95), 0 0 13px rgb(255 231 122 / 0.92);
      animation: echostars-v164-summon-icon 1.35s ease-in-out infinite;
    }

    .${SUMMON_BUTTON_CLASS}::after {
      content: "" !important;
      position: absolute;
      inset: -50% -22%;
      z-index: 0;
      pointer-events: none;
      background:
        radial-gradient(circle at 12% 38%, rgb(255 255 255 / 0.98) 0 1px, transparent 2px),
        radial-gradient(circle at 30% 74%, rgb(255 244 180 / 0.95) 0 1.5px, transparent 2.5px),
        radial-gradient(circle at 57% 24%, rgb(255 255 255 / 0.94) 0 1px, transparent 2px),
        radial-gradient(circle at 80% 61%, rgb(255 236 150 / 0.98) 0 1.5px, transparent 2.5px),
        linear-gradient(108deg, transparent 28%, rgb(255 255 255 / 0.32) 48%, transparent 66%);
      transform: translateX(-20%) rotate(-4deg);
      animation: echostars-v164-summon-stars 2.1s ease-in-out infinite;
    }

    .${SUMMON_BUTTON_CLASS} > span {
      position: relative !important;
      z-index: 2 !important;
      white-space: nowrap !important;
      font-size: 0 !important;
      text-shadow: 0 1px 2px rgb(0 0 0 / 0.22), 0 0 10px rgb(255 255 255 / 0.24);
    }

    .${SUMMON_BUTTON_CLASS} > span::after {
      content: "召喚繁星";
      font-size: 1.28rem !important;
      font-weight: 900;
      line-height: 1;
    }

    @keyframes echostars-v164-summon-icon {
      0%, 100% { transform: rotate(-12deg) scale(0.84); opacity: 0.68; }
      48% { transform: rotate(12deg) scale(1.28); opacity: 1; }
    }

    @keyframes echostars-v164-summon-stars {
      0% { opacity: 0.32; transform: translateX(-20%) rotate(-4deg); }
      50% { opacity: 0.95; transform: translateX(8%) rotate(2deg); }
      100% { opacity: 0.4; transform: translateX(24%) rotate(5deg); }
    }

    /* v164 mobile: put both result messages in normal layout flow above the
       winning audio card. They no longer overlap filters, the badge, or card. */
    @media (max-width: 767px) {
      .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"] {
        overflow: visible !important;
        isolation: isolate;
        z-index: 90 !important;
      }

      .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"] > .lucky-answer-notice,
      .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"] > .lucky-winner-badge {
        position: relative !important;
        inset: auto !important;
        left: auto !important;
        right: auto !important;
        top: auto !important;
        bottom: auto !important;
        transform: none !important;
        pointer-events: none !important;
      }

      .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"] > .lucky-answer-notice {
        display: block !important;
        width: calc(100% - 1rem) !important;
        max-width: 30rem !important;
        margin: 0 auto 0.55rem !important;
        z-index: 2 !important;
      }

      .audio-card-grid.lucky-win-active > .lucky-card[data-lucky-winner="true"] > .lucky-winner-badge {
        display: block !important;
        width: max-content !important;
        max-width: calc(100% - 1rem) !important;
        margin: 0 auto 0.5rem !important;
        z-index: 2 !important;
      }

      .${SUMMON_BUTTON_CLASS} {
        padding-inline: 0.9rem !important;
      }
    }

    @media (max-width: 380px) {
      .${SUMMON_BUTTON_CLASS} {
        padding-inline: 0.68rem !important;
      }
      .${SUMMON_BUTTON_CLASS} > span::after {
        font-size: 1.08rem !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .${SUMMON_BUTTON_CLASS}::before,
      .${SUMMON_BUTTON_CLASS}::after {
        animation: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function syncGlobalNavigationState() {
  const hasMainNav = Boolean(document.querySelector(NAV_SELECTOR));
  document.documentElement.classList.toggle(ROOT_CLASS, hasMainNav);

  document.querySelectorAll<HTMLButtonElement>(SUMMON_BUTTON_SELECTOR).forEach(button => {
    button.classList.add(SUMMON_BUTTON_CLASS);
    // Inline !important deliberately wins against legacy presentation rules
    // that used selector specificity to force 50px/12px on this first button.
    button.style.setProperty('box-sizing', 'border-box', 'important');
    button.style.setProperty('height', '46px', 'important');
    button.style.setProperty('min-height', '46px', 'important');
    button.style.setProperty('max-height', '46px', 'important');
    button.style.setProperty('padding-top', '0', 'important');
    button.style.setProperty('padding-bottom', '0', 'important');
    button.style.setProperty('font-size', '22px', 'important');
    button.style.setProperty('line-height', '1', 'important');
  });
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
    // keep the drawer open. All others close only AFTER their real click has
    // already been dispatched to the target, preventing tap-through.
    if (target.closest(MENU_KEEP_OPEN_SELECTOR)) return;
    if (!target.closest(MENU_ACTION_SELECTOR)) return;

    window.setTimeout(() => {
      if (getOpenMainMenu()) closeOpenMainMenu();
    }, 0);
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
