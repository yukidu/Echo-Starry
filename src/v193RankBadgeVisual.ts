import './v193RankBadgeVisual.css';
import { speakerRankBadge } from './utils/speakerRankBadge';

type RankTrack = {
  id: string;
  speakerRank?: string;
};

const PROD_ORIGIN = 'https://echostars.yukidu.workers.dev';
const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V193_RANK_BADGE_VISUAL__?: boolean;
};

const trackMap = new Map<string, RankTrack>();
let lastTrackRefreshAt = 0;
let refreshInFlight: Promise<void> | null = null;

function badgeSrc(url: string) {
  if (!url.startsWith('/')) return url;
  if (window.location.origin === PROD_ORIGIN) return url;
  if (!window.location.hostname.endsWith('yukidu.workers.dev')) return url;
  return `${PROD_ORIGIN}${url}`;
}

async function refreshTracks(force = false) {
  const now = Date.now();
  if (!force && now - lastTrackRefreshAt < 12_000) return;
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const response = await fetch(`/api/tracks?v193_rank_badge=${now}`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
        cache: 'no-store'
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => []);
      if (!Array.isArray(data)) return;
      trackMap.clear();
      for (const raw of data) {
        if (!raw || typeof raw !== 'object' || !raw.id) continue;
        trackMap.set(String(raw.id), {
          id: String(raw.id),
          speakerRank: String(raw.speakerRank || '')
        });
      }
      lastTrackRefreshAt = Date.now();
      decorateAll();
    } catch {
      // Keep the existing UI when the network is temporarily unavailable.
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function decorateHomeBadges() {
  for (const card of document.querySelectorAll<HTMLElement>('.audio-card[data-track-id]')) {
    const id = String(card.dataset.trackId || '').trim();
    const track = trackMap.get(id);
    const badge = speakerRankBadge(track?.speakerRank || '');
    const photoButton = Array.from(card.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => Boolean(button.querySelector('img')));
    const existing = photoButton?.querySelector<HTMLImageElement>('img[data-v193-home-rank-badge="1"]');

    if (!photoButton || !badge) {
      existing?.remove();
      continue;
    }

    const src = badgeSrc(badge.url);
    if (existing) {
      if (existing.src !== new URL(src, window.location.origin).href) existing.src = src;
      existing.alt = `${badge.rank}獎章`;
      existing.title = badge.rank;
      continue;
    }

    const image = document.createElement('img');
    image.dataset.v193HomeRankBadge = '1';
    image.className = 'v193-home-rank-badge';
    image.src = src;
    image.alt = `${badge.rank}獎章`;
    image.title = badge.rank;
    image.loading = 'lazy';
    image.decoding = 'async';
    photoButton.appendChild(image);
  }
}

function decorateDetailBadge() {
  for (const image of document.querySelectorAll<HTMLImageElement>('img.v190-rank-badge-image')) {
    if (window.location.origin !== PROD_ORIGIN && window.location.hostname.endsWith('yukidu.workers.dev')) {
      try {
        const current = new URL(image.src, window.location.origin);
        if (current.pathname.startsWith('/api/r2/file/')) image.src = `${PROD_ORIGIN}${current.pathname}${current.search}`;
      } catch {
        // Keep the current source if URL parsing fails.
      }
    }

    const motion = image.closest<HTMLElement>('.v190-rank-badge-motion');
    if (!motion) continue;
    const extraClasses = [
      'v193-rank-badge-sparkle--four',
      'v193-rank-badge-sparkle--five',
      'v193-rank-badge-sparkle--six',
      'v193-rank-badge-sparkle--seven',
      'v193-rank-badge-sparkle--eight'
    ];
    for (const className of extraClasses) {
      if (motion.querySelector(`.${className}`)) continue;
      const star = document.createElement('span');
      star.setAttribute('aria-hidden', 'true');
      star.dataset.v193RankSparkle = '1';
      star.className = `v190-rank-badge-sparkle ${className}`;
      star.textContent = '✦';
      motion.appendChild(star);
    }
  }
}

function decorateAll() {
  decorateHomeBadges();
  decorateDetailBadge();
}

if (!runtime.__ECHOSTARS_V193_RANK_BADGE_VISUAL__) {
  runtime.__ECHOSTARS_V193_RANK_BADGE_VISUAL__ = true;
  void refreshTracks(true);
  window.setInterval(decorateAll, 800);
  window.setInterval(() => void refreshTracks(false), 12_000);
  window.addEventListener('focus', () => void refreshTracks(true));
}
