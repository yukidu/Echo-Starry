import './v194RankBadgeCleanup.css';

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V194_RANK_BADGE_CLEANUP__?: boolean;
};

function cleanupLegacyRankBadgeDecorations() {
  document
    .querySelectorAll<HTMLElement>('[data-v193-home-rank-badge="1"], [data-v193-rank-sparkle="1"]')
    .forEach(node => node.remove());
}

if (!runtime.__ECHOSTARS_V194_RANK_BADGE_CLEANUP__) {
  runtime.__ECHOSTARS_V194_RANK_BADGE_CLEANUP__ = true;
  document.documentElement.setAttribute('data-echostars-v194-rank-badge-cleanup', 'true');
  cleanupLegacyRankBadgeDecorations();
  window.addEventListener('focus', cleanupLegacyRankBadgeDecorations);
}
