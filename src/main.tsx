import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './mobileMenuHalfLayout.css';

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
const isVipSharePage = Boolean(
  document.querySelector<HTMLMetaElement>('meta[name="echostars-share-vip"]')
);
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

const VIP_AUTOPLAY_FALLBACK_ID = 'echostars-vip-autoplay-fallback';

function removeVipAutoplayFallback() {
  document.getElementById(VIP_AUTOPLAY_FALLBACK_ID)?.remove();
}

function syncVipPlayerUiToActualPlayback(audio: HTMLAudioElement, attempt = 0) {
  const expectedTitle = audio.paused ? '點擊照片暫停' : '點擊照片播放';
  const button = document.querySelector<HTMLButtonElement>(`button[title="${expectedTitle}"]`);
  if (button) {
    // React currently marks a rejected play() call as playing. Toggling the
    // existing player control brings the visual state back in line with the
    // real HTMLAudioElement without inventing a second playback state store.
    button.click();
    return;
  }
  if (attempt < 8) {
    window.setTimeout(() => syncVipPlayerUiToActualPlayback(audio, attempt + 1), 120);
  }
}

function showVipAutoplayFallback(audio: HTMLAudioElement) {
  if (document.getElementById(VIP_AUTOPLAY_FALLBACK_ID)) return;

  // Mobile Safari/Chrome may legally block audible autoplay even when the page
  // was opened from a link. Never pretend playback succeeded in that case:
  // stop the fake spinning state and provide one obvious real user gesture.
  syncVipPlayerUiToActualPlayback(audio);

  const wrapper = document.createElement('div');
  wrapper.id = VIP_AUTOPLAY_FALLBACK_ID;
  Object.assign(wrapper.style, {
    position: 'fixed',
    left: '50%',
    bottom: '96px',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    width: 'min(92vw, 360px)',
    padding: '10px',
    borderRadius: '18px',
    background: 'rgba(15, 23, 42, 0.94)',
    boxShadow: '0 12px 36px rgba(0,0,0,.28)',
    color: '#fff',
    textAlign: 'center',
    fontFamily: 'system-ui, sans-serif'
  });

  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '▶ 點一下開始播放';
  Object.assign(button.style, {
    width: '100%',
    border: '0',
    borderRadius: '13px',
    padding: '11px 14px',
    fontSize: '16px',
    fontWeight: '800',
    cursor: 'pointer',
    color: '#fff',
    background: 'var(--color-primary, #c06c84)'
  });

  const note = document.createElement('div');
  note.textContent = '瀏覽器阻擋了自動播放，點一次即可開始';
  Object.assign(note.style, {
    marginTop: '6px',
    fontSize: '11px',
    opacity: '.78'
  });

  audio.addEventListener('playing', () => {
    removeVipAutoplayFallback();
    window.setTimeout(() => syncVipPlayerUiToActualPlayback(audio), 0);
  }, { once: true });

  button.addEventListener('click', () => {
    // play() is called immediately inside this real click event so browsers
    // that require a user gesture can grant audible playback.
    const playPromise = audio.play();
    Promise.resolve(playPromise)
      .then(() => {
        removeVipAutoplayFallback();
        window.setTimeout(() => syncVipPlayerUiToActualPlayback(audio), 0);
      })
      .catch(() => {
        note.textContent = '仍無法播放，請再點一次播放器照片';
      });
  });

  wrapper.append(button, note);
  document.body.appendChild(wrapper);
}

function startVipShareAutoplay() {
  if (!isVipSharePage) return;

  let finished = false;
  let lookupAttempts = 0;
  let playbackAttempts = 0;

  const attemptPlayback = () => {
    if (finished) return;

    const audio = document.querySelector<HTMLAudioElement>('audio');
    if (!audio || !audio.src) {
      lookupAttempts += 1;
      if (lookupAttempts <= 80) {
        window.setTimeout(attemptPlayback, 150);
      }
      return;
    }

    audio.autoplay = true;
    audio.setAttribute('playsinline', '');

    const onPlaying = () => {
      if (finished) return;
      finished = true;
      removeVipAutoplayFallback();
      window.setTimeout(() => syncVipPlayerUiToActualPlayback(audio), 0);
    };

    audio.addEventListener('playing', onPlaying, { once: true });

    const playPromise = audio.play();
    Promise.resolve(playPromise)
      .then(() => {
        if (!audio.paused) onPlaying();
      })
      .catch((error: unknown) => {
        audio.removeEventListener('playing', onPlaying);
        if (finished) return;

        const name = error instanceof DOMException ? error.name : '';
        if (name === 'NotAllowedError') {
          showVipAutoplayFallback(audio);
          return;
        }

        playbackAttempts += 1;
        if (playbackAttempts <= 12) {
          // A freshly assigned audio src can reject once before metadata/buffer
          // becomes usable. Retry after the media element has had time to load.
          window.setTimeout(attemptPlayback, 250);
        } else {
          showVipAutoplayFallback(audio);
        }
      });
  };

  window.setTimeout(attemptPlayback, 0);
}

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

startVipShareAutoplay();
