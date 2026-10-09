const STYLE_ID = 'echostars-v147-navbar-overlay-fix';

function installNavbarOverlayFix() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* v147: keep homepage filters underneath the sticky navbar and hamburger menu. */
    .v145-filter-toolbar {
      z-index: 30 !important;
    }

    .v145-filter-menu {
      z-index: 35 !important;
    }
  `;
  document.head.appendChild(style);
}

installNavbarOverlayFix();
window.addEventListener('pageshow', installNavbarOverlayFix);
