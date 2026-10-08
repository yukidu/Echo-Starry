const STYLE_ID = 'echostars-home-density-policy';
const ROOT_CLASS = 'echostars-home-density';
const HOME_GRID_SELECTOR = '.audio-card-grid';
const USER_FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';

function readFontZoom() {
  try {
    const value = Number(localStorage.getItem(USER_FONT_ZOOM_KEY));
    return Number.isFinite(value) ? Math.min(1.4, Math.max(1, value)) : 1;
  } catch {
    return 1;
  }
}

function applyPersonalFontZoom() {
  document.documentElement.style.fontSize = `${Math.round(16 * readFontZoom() * 100) / 100}px`;
}

function installHomeDensityStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html.${ROOT_CLASS} {
      --echostars-home-columns: 1;
      --echostars-home-gap: 6px;
      --echostars-home-max-width: 760px;
    }
    html.${ROOT_CLASS} main {
      padding-top: .55rem !important;
      max-width: min(var(--echostars-home-max-width), calc(100vw - .5rem)) !important;
    }
    html.${ROOT_CLASS} main > .space-y-4 > * + * { margin-top: .5rem !important; }
    html.${ROOT_CLASS} main > .space-y-4 p,
    html.${ROOT_CLASS} main > .space-y-4 span,
    html.${ROOT_CLASS} main > .space-y-4 button,
    html.${ROOT_CLASS} main > .space-y-4 input { line-height: 1.1 !important; }
    html.${ROOT_CLASS} main > .space-y-4 > div:first-child input,
    html.${ROOT_CLASS} main > .space-y-4 > div:first-child > button { padding-top: .45rem !important; padding-bottom: .45rem !important; }
    html.${ROOT_CLASS} .sort-toolbar { gap: .2rem !important; padding-top: 0 !important; }
    html.${ROOT_CLASS} .sort-toolbar button { padding-top: .2rem !important; padding-bottom: .2rem !important; line-height: 1 !important; }
    html.${ROOT_CLASS} .audio-card-grid {
      grid-template-columns: repeat(var(--echostars-home-columns), minmax(0, 1fr)) !important;
      gap: var(--echostars-home-gap) !important;
      padding-top: .1rem !important;
    }
    html.${ROOT_CLASS} .audio-card { padding-top: .4rem !important; padding-bottom: .4rem !important; padding-left: .5rem !important; }
    html.${ROOT_CLASS} .audio-card > div { gap: .5rem !important; }
    html.${ROOT_CLASS} .audio-card h3 { line-height: 1.05 !important; margin: 0 !important; }
    html.${ROOT_CLASS} .audio-card p { line-height: 1.05 !important; margin-top: .1rem !important; margin-bottom: 0 !important; }
    html.${ROOT_CLASS} .audio-card .mt-1 { margin-top: .2rem !important; }
    html.${ROOT_CLASS} .audio-card .border-t { padding-top: .25rem !important; gap: .15rem !important; }
    html.${ROOT_CLASS} .audio-card .reaction-button { padding-top: .15rem !important; padding-bottom: .15rem !important; gap: .3rem !important; line-height: 1 !important; }
    html.${ROOT_CLASS} .audio-card .rating-star { padding: .1rem !important; }
    html.${ROOT_CLASS} .audio-card [class*="rounded-md"] { line-height: 1 !important; }
    html.${ROOT_CLASS} main > footer { margin-top: 1.5rem !important; padding-top: .65rem !important; line-height: 1.05 !important; }

    @media (max-width: 639px) {
      html.${ROOT_CLASS} main { padding-left: .75rem !important; padding-right: .75rem !important; }
      html.${ROOT_CLASS} .audio-card { padding-top: .35rem !important; padding-bottom: .35rem !important; padding-left: .4rem !important; }
      html.${ROOT_CLASS} .audio-card > div { gap: .4rem !important; }
    }
    @media (min-width: 640px) and (orientation: landscape) {
      html.${ROOT_CLASS} {
        --echostars-home-columns: 3;
        --echostars-home-gap: 8px;
        --echostars-home-max-width: 1180px;
      }
    }
    @media (min-width: 1024px) {
      html.${ROOT_CLASS} {
        --echostars-home-columns: 3;
        --echostars-home-gap: 10px;
        --echostars-home-max-width: 1440px;
      }
    }
  `;
  document.head.appendChild(style);
}

function syncHomeDensityState() {
  document.documentElement.classList.toggle(ROOT_CLASS, Boolean(document.querySelector(HOME_GRID_SELECTOR)));
}

installHomeDensityStyles();
applyPersonalFontZoom();
syncHomeDensityState();

let queued = false;
const queueSync = () => {
  if (queued) return;
  queued = true;
  queueMicrotask(() => {
    queued = false;
    syncHomeDensityState();
  });
};

const observer = new MutationObserver(queueSync);
observer.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener('resize', applyPersonalFontZoom);
window.addEventListener('orientationchange', applyPersonalFontZoom);
window.addEventListener('storage', event => {
  if (event.key === USER_FONT_ZOOM_KEY) applyPersonalFontZoom();
});
window.addEventListener('pageshow', () => {
  applyPersonalFontZoom();
  syncHomeDensityState();
});
