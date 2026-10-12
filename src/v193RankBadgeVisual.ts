import './v193RankBadgeVisual.css';

const PROD_ORIGIN = 'https://echostars.yukidu.workers.dev';
const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V193_RANK_BADGE_VISUAL__?: boolean;
};

function syncPreviewBadgeSources() {
  for (const image of document.querySelectorAll<HTMLImageElement>('img.v190-rank-badge-image')) {
    if (window.location.origin === PROD_ORIGIN || !window.location.hostname.endsWith('yukidu.workers.dev')) continue;
    try {
      const current = new URL(image.src, window.location.origin);
      if (current.pathname.startsWith('/api/r2/file/')) {
        image.src = `${PROD_ORIGIN}${current.pathname}${current.search}`;
      }
    } catch {
      // Keep the current source if URL parsing fails.
    }
  }
}

function removeLegacyV193Decorations() {
  document.querySelectorAll<HTMLElement>('[data-v193-home-rank-badge="1"], [data-v193-rank-sparkle="1"]')
    .forEach(node => node.remove());
}

function syncV193RankBadgeVisual() {
  removeLegacyV193Decorations();
  syncPreviewBadgeSources();
}

if (!runtime.__ECHOSTARS_V193_RANK_BADGE_VISUAL__) {
  runtime.__ECHOSTARS_V193_RANK_BADGE_VISUAL__ = true;
  syncV193RankBadgeVisual();
  window.setInterval(syncV193RankBadgeVisual, 800);
  window.addEventListener('focus', syncV193RankBadgeVisual);
}
