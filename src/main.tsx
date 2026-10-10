import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './mobileMenuHalfLayout.css';
import './v166FilterSearchMatch.css';

// Old long VIP links (?vipToken=...&trackId=...) are retired. Strip those
// named parameters before React starts, including when somebody appends them
// to an otherwise valid public share URL. A new VIP password such as ?1234 is
// a bare query key and is intentionally left untouched.
{
  const legacyUrl = new URL(window.location.href);
  if (legacyUrl.searchParams.has('vipToken') || legacyUrl.searchParams.has('trackId')) {
    legacyUrl.searchParams.delete('vipToken');
    legacyUrl.searchParams.delete('trackId');
    const query = legacyUrl.searchParams.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${legacyUrl.pathname}${query ? `?${query}` : ''}${legacyUrl.hash}`
    );
  }
}

// Share pages embed the real track id in HTML metadata. Temporarily expose it
// through the existing ?track bootstrap contract, then restore the exact
// original query string. The exact restoration matters for VIP links whose
// password is intentionally a bare query such as ?1234 rather than ?p=1234.
const embeddedShareTrack = document
  .querySelector<HTMLMetaElement>('meta[name="echostars-share-track"]')
  ?.content.trim();
const originalShareSearch = window.location.pathname.startsWith('/share/')
  ? window.location.search
  : '';
let removeBootstrapTrackParam = false;
if (embeddedShareTrack && window.location.pathname.startsWith('/share/')) {
  const bootstrapUrl = new URL(window.location.href);
  if (!bootstrapUrl.searchParams.get('track')) {
    bootstrapUrl.searchParams.set('track', embeddedShareTrack);
    window.history.replaceState(
      window.history.state,
      '',
      `${bootstrapUrl.pathname}${bootstrapUrl.search}${bootstrapUrl.hash}`
    );
    removeBootstrapTrackParam = true;
  }
}

/*
 * Playback policy: entering/opening a detail page must never start audio by
 * itself. App.tsx has a few historical bootstrap paths that can still call
 * HTMLMediaElement.play() while opening a shared track, so enforce the rule at
 * the single browser-media boundary instead of adding more route-specific
 * patches. Only an explicit playback control grants the next play() call.
 */
const nativeMediaPlay = HTMLMediaElement.prototype.play;
let explicitPlaybackIntentUntil = 0;

function isPlaybackControl(target: EventTarget | null) {
  const element = target instanceof Element ? target.closest('button') : null;
  if (!element) return false;
  const ariaLabel = element.getAttribute('aria-label') || '';
  const title = element.getAttribute('title') || '';
  const label = `${ariaLabel} ${title}`;
  return /(?:開始播放|繼續播放|暫停播放|照片播放|照片暫停)/.test(label)
    || title === '播放'
    || title === '暫停';
}

function rememberPlaybackIntent(target: EventTarget | null) {
  if (isPlaybackControl(target)) {
    // Keep the intent alive long enough for permission/sticker confirmation
    // dialogs; it is consumed by the next play() call.
    explicitPlaybackIntentUntil = performance.now() + 30_000;
  }
}

document.addEventListener('pointerdown', event => rememberPlaybackIntent(event.target), true);
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') rememberPlaybackIntent(document.activeElement);
}, true);

function syncBlockedAutoplayUi(media: HTMLMediaElement, attempt = 0) {
  media.pause();
  const pauseButton = document.querySelector<HTMLButtonElement>(
    'button[aria-label="暫停播放"], button[title="點擊照片暫停"]'
  );
  if (pauseButton) {
    // App.tsx historically marks a rejected play() as playing. Use its own
    // pause control once to bring React state back in line with the real media.
    pauseButton.click();
    return;
  }
  if (attempt < 10) {
    window.setTimeout(() => syncBlockedAutoplayUi(media, attempt + 1), 80);
  }
}

HTMLMediaElement.prototype.play = function manualPlaybackOnly() {
  const now = performance.now();
  if (explicitPlaybackIntentUntil >= now) {
    explicitPlaybackIntentUntil = 0;
    return nativeMediaPlay.call(this);
  }

  const media = this;
  window.setTimeout(() => syncBlockedAutoplayUi(media), 0);
  return Promise.reject(new DOMException('Playback requires an explicit user action.', 'NotAllowedError'));
};

if ('serviceWorker' in navigator) {
  // PWA updates are intentionally silent:
  // the browser downloads/activates the newest worker in the background,
  // and the new app version is picked up on the user's next natural reload/reopen.
  // Never interrupt playback or browsing with an update confirmation dialog.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if (removeBootstrapTrackParam && embeddedShareTrack) {
  window.setTimeout(() => {
    if (window.location.pathname.startsWith('/share/')) {
      window.history.replaceState(
        window.history.state,
        '',
        `${window.location.pathname}${originalShareSearch}${window.location.hash}`
      );
    }
  }, 1000);
}
