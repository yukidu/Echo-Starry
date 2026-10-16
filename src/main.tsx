import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './mobileMenuHalfLayout.css';
import './v166FilterSearchMatch.css';
import './v190RankBadge.css';
import './taiwanCrownMenuLink';
import './v181PreviewProductionReadBridge';
import './v181HomeToolbarDislike';
import './v189PlaybackSwitchConfirm';
import './memberProfileSchemaBridge';
import './batteryTerminologyPolicy';

{
  const legacyUrl = new URL(window.location.href);
  if (legacyUrl.searchParams.has('vipToken') || legacyUrl.searchParams.has('trackId')) {
    legacyUrl.searchParams.delete('vipToken');
    legacyUrl.searchParams.delete('trackId');
    const query = legacyUrl.searchParams.toString();
    window.history.replaceState(window.history.state, '', `${legacyUrl.pathname}${query ? `?${query}` : ''}${legacyUrl.hash}`);
  }
}

const embeddedShareTrack = document.querySelector<HTMLMetaElement>('meta[name="echostars-share-track"]')?.content.trim();
const originalShareSearch = window.location.pathname.startsWith('/share/') ? window.location.search : '';
let removeBootstrapTrackParam = false;
if (embeddedShareTrack && window.location.pathname.startsWith('/share/')) {
  const bootstrapUrl = new URL(window.location.href);
  if (!bootstrapUrl.searchParams.get('track')) {
    bootstrapUrl.searchParams.set('track', embeddedShareTrack);
    window.history.replaceState(window.history.state, '', `${bootstrapUrl.pathname}${bootstrapUrl.search}${bootstrapUrl.hash}`);
    removeBootstrapTrackParam = true;
  }
}

const nativeMediaPlay = HTMLMediaElement.prototype.play;
let explicitPlaybackIntentUntil = 0;

function isPlaybackControl(target: EventTarget | null) {
  const element = target instanceof Element ? target.closest('button') : null;
  if (!element) return false;
  const ariaLabel = element.getAttribute('aria-label') || '';
  const title = element.getAttribute('title') || '';
  const label = `${ariaLabel} ${title}`;
  return /(?:開始播放|繼續播放|暫停播放|照片播放|照片暫停)/.test(label) || title === '播放' || title === '暫停';
}

function rememberPlaybackIntent(target: EventTarget | null) {
  if (isPlaybackControl(target)) explicitPlaybackIntentUntil = performance.now() + 30_000;
}

document.addEventListener('pointerdown', event => rememberPlaybackIntent(event.target), true);
document.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') rememberPlaybackIntent(document.activeElement);
}, true);
window.addEventListener('echostars:grant-playback-intent', () => {
  explicitPlaybackIntentUntil = performance.now() + 30_000;
});
window.addEventListener('echostars:clear-playback-intent', () => {
  explicitPlaybackIntentUntil = 0;
});

function syncBlockedAutoplayUi(media: HTMLMediaElement, attempt = 0) {
  media.pause();
  const pauseButton = document.querySelector<HTMLButtonElement>('button[aria-label="暫停播放"], button[title="點擊照片暫停"]');
  if (pauseButton) {
    pauseButton.click();
    return;
  }
  if (attempt < 10) window.setTimeout(() => syncBlockedAutoplayUi(media, attempt + 1), 80);
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
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(error => console.warn('Service worker registration failed:', error));
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
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${originalShareSearch}${window.location.hash}`);
    }
  }, 1000);
}