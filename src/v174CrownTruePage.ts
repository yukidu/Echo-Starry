import './v174CrownTruePage.css';
import './v176CrownAvatarShine';
import './v177CrownPaletteRing';
import './v178CrownDiagonalReflection';
import './v179CrownPolish';

const PAGE_ID = 'taiwan-crown-integrated-page';
let crownWasOpen = false;
let returnScrollY = 0;

function crownIsOpen() {
  const page = document.getElementById(PAGE_ID);
  return document.body.dataset.taiwanCrownOpen === 'true' && Boolean(page && !page.hidden);
}

function syncCrownPageMode() {
  const open = crownIsOpen();
  const page = document.getElementById(PAGE_ID);

  if (open && !crownWasOpen) {
    returnScrollY = window.scrollY;
    page?.setAttribute('data-v174-true-page', 'true');
    document.documentElement.setAttribute('data-taiwan-crown-page', 'true');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  } else if (!open && crownWasOpen) {
    page?.removeAttribute('data-v174-true-page');
    document.documentElement.removeAttribute('data-taiwan-crown-page');
    window.requestAnimationFrame(() => window.scrollTo({ top: returnScrollY, behavior: 'auto' }));
  }

  crownWasOpen = open;
}

function startV174CrownPageMode() {
  syncCrownPageMode();
  const observer = new MutationObserver(syncCrownPageMode);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ['data-taiwan-crown-open']
  });
}

if (document.body) startV174CrownPageMode();
else window.addEventListener('DOMContentLoaded', startV174CrownPageMode, { once: true });
