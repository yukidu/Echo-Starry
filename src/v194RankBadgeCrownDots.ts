import './v194RankBadgeCrownDots.css';

const PROD_ORIGIN = 'https://echostars.yukidu.workers.dev';
const DENSE_DOT_COUNT = 32;
const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V194_RANK_BADGE_CROWN_DOTS__?: boolean;
};

function rewritePreviewBadgeSource(image: HTMLImageElement) {
  if (window.location.origin === PROD_ORIGIN) return;
  if (!window.location.hostname.endsWith('yukidu.workers.dev')) return;
  try {
    const current = new URL(image.src, window.location.origin);
    if (current.pathname.startsWith('/api/r2/file/')) {
      image.src = `${PROD_ORIGIN}${current.pathname}${current.search}`;
    }
  } catch {
    // Keep the current source if URL parsing fails.
  }
}

function removeLegacyStars(motion: HTMLElement) {
  for (const node of motion.querySelectorAll<HTMLElement>('.v190-rank-badge-sparkle, [data-v193-rank-sparkle]')) {
    node.remove();
  }
}

function ensureDenseCrownDots(motion: HTMLElement) {
  const existing = motion.querySelectorAll<HTMLElement>('[data-v194-rank-dot="1"]');
  if (existing.length === DENSE_DOT_COUNT) return;
  for (const node of existing) node.remove();

  for (let index = 0; index < DENSE_DOT_COUNT; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / DENSE_DOT_COUNT;
    const point = document.createElement('span');
    point.className = 'v194-rank-badge-dot';
    point.dataset.v194RankDot = '1';
    point.setAttribute('aria-hidden', 'true');
    point.style.setProperty('--spark-x', `${(50 + Math.cos(angle) * 48.5).toFixed(2)}%`);
    point.style.setProperty('--spark-y', `${(50 + Math.sin(angle) * 48.5).toFixed(2)}%`);
    point.style.setProperty('--spark-size', `${(0.16 + (index % 5) * 0.018).toFixed(3)}em`);
    point.style.setProperty('--spark-duration', `${(5.6 + (index % 7) * 0.47).toFixed(2)}s`);
    point.style.setProperty('--spark-delay', `${(-0.31 * index).toFixed(2)}s`);
    point.style.setProperty('--spark-min', String(0.08 + (index % 4) * 0.025));
    point.style.setProperty('--spark-max', String(0.74 + (index % 5) * 0.055));
    point.style.setProperty('--spark-scale', String(1.28 + (index % 4) * 0.04));
    motion.appendChild(point);
  }
}

function removeHomeBadges() {
  for (const image of document.querySelectorAll<HTMLElement>('[data-v193-home-rank-badge="1"], .v193-home-rank-badge')) {
    image.remove();
  }
}

function decorateDetailBadges() {
  removeHomeBadges();
  for (const image of document.querySelectorAll<HTMLImageElement>('img.v190-rank-badge-image')) {
    rewritePreviewBadgeSource(image);
    const motion = image.closest<HTMLElement>('.v190-rank-badge-motion');
    if (!motion) continue;
    removeLegacyStars(motion);
    ensureDenseCrownDots(motion);
  }
}

if (!runtime.__ECHOSTARS_V194_RANK_BADGE_CROWN_DOTS__) {
  runtime.__ECHOSTARS_V194_RANK_BADGE_CROWN_DOTS__ = true;
  decorateDetailBadges();
  window.setInterval(decorateDetailBadges, 700);
  window.addEventListener('focus', decorateDetailBadges);
}
