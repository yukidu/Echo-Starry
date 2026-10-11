import './v179CrownPolish.css';

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V179_CROWN_POLISH__?: boolean;
};

function ensureV179CrownPolish() {
  document.documentElement.setAttribute('data-echostars-v179-crown-polish', 'true');
}

if (!runtime.__ECHOSTARS_V179_CROWN_POLISH__) {
  runtime.__ECHOSTARS_V179_CROWN_POLISH__ = true;
  if (document.body) ensureV179CrownPolish();
  else window.addEventListener('DOMContentLoaded', ensureV179CrownPolish, { once: true });
}
