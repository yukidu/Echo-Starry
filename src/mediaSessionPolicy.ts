const MEDIA_PLAYER_SELECTOR = '[data-echostars-media-session="1"]';
const DEFAULT_ARTWORK = '/icon-512.png';
const APP_TITLE = '繁星回聲';
const DEFAULT_ARTWORK_PATHS = new Set(['/icon-192.png', '/icon-512.png', '/icon.svg']);

type MediaSessionActionName = 'play' | 'pause' | 'seekbackward' | 'seekforward' | 'seekto';

const asAbsoluteUrl = (value: string | null | undefined) => {
  const source = (value || '').trim();
  if (!source) return new URL(DEFAULT_ARTWORK, window.location.origin).href;
  try {
    return new URL(source, window.location.origin).href;
  } catch {
    return new URL(DEFAULT_ARTWORK, window.location.origin).href;
  }
};

const isDefaultArtworkUrl = (value: string) => {
  try {
    return DEFAULT_ARTWORK_PATHS.has(new URL(value, window.location.origin).pathname);
  } catch {
    return true;
  }
};

const mediaArtworkEntries = (value: string | null | undefined) => {
  const artwork = asAbsoluteUrl(value);

  // A real speaker portrait must be the only artwork candidate. Android/Chrome
  // can otherwise prefer an explicitly-sized app icon and hide the portrait.
  if (!isDefaultArtworkUrl(artwork)) {
    return [{ src: artwork }];
  }

  return [
    { src: asAbsoluteUrl('/icon-192.png'), sizes: '192x192', type: 'image/png' },
    { src: asAbsoluteUrl('/icon-512.png'), sizes: '512x512', type: 'image/png' }
  ];
};

const getMediaSession = (): any => {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return null;
  return (navigator as any).mediaSession || null;
};

const getAudio = () => document.querySelector<HTMLAudioElement>('audio');
const getPlayer = () => document.querySelector<HTMLElement>(MEDIA_PLAYER_SELECTOR);

let boundAudio: HTMLAudioElement | null = null;
let lastPositionSecond = -1;
let lastMetadataSignature = '';

function setPlaybackState(audio: HTMLAudioElement) {
  const mediaSession = getMediaSession();
  if (!mediaSession) return;
  try {
    mediaSession.playbackState = audio.ended ? 'none' : (audio.paused ? 'paused' : 'playing');
  } catch {}
}

function syncPositionState(audio: HTMLAudioElement, force = false) {
  const mediaSession = getMediaSession();
  if (!mediaSession || typeof mediaSession.setPositionState !== 'function') return;
  const duration = Number(audio.duration);
  const position = Number(audio.currentTime);
  const playbackRate = Number(audio.playbackRate) || 1;
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isFinite(position)) return;
  const second = Math.floor(position);
  if (!force && second === lastPositionSecond) return;
  lastPositionSecond = second;
  try {
    mediaSession.setPositionState({ duration, playbackRate, position: Math.max(0, Math.min(duration, position)) });
  } catch {}
}

function syncMetadata() {
  const mediaSession = getMediaSession();
  const player = getPlayer();
  const MediaMetadataCtor = (window as any).MediaMetadata;
  if (!mediaSession || !player || typeof MediaMetadataCtor !== 'function') return;

  const title = (player.dataset.mediaTitle || APP_TITLE).trim() || APP_TITLE;
  const artist = (player.dataset.mediaArtist || '').trim();
  const artwork = asAbsoluteUrl(player.dataset.mediaArtwork);
  const artworkEntries = mediaArtworkEntries(player.dataset.mediaArtwork);
  const signature = `${title}\u0000${artist}\u0000${artwork}`;
  if (signature === lastMetadataSignature) return;
  lastMetadataSignature = signature;

  try {
    mediaSession.metadata = new MediaMetadataCtor({
      title,
      artist,
      album: APP_TITLE,
      artwork: artworkEntries
    });
  } catch {
    try {
      mediaSession.metadata = new MediaMetadataCtor({ title, artist, album: APP_TITLE });
    } catch {}
  }
}

function safeSetActionHandler(action: MediaSessionActionName, handler: ((details: any) => void) | null) {
  const mediaSession = getMediaSession();
  if (!mediaSession) return;
  try {
    mediaSession.setActionHandler(action, handler);
  } catch {}
}

function grantSystemPlaybackIntent() {
  // main.tsx deliberately blocks script-driven autoplay. iOS lock-screen / Control
  // Center playback is a real user action but it is not a DOM click, so explicitly
  // bridge that trusted system intent before calling HTMLMediaElement.play().
  window.dispatchEvent(new Event('echostars:grant-playback-intent'));
}

function playFromSystemControl(audio: HTMLAudioElement) {
  if (!audio.paused && !audio.ended) {
    setPlaybackState(audio);
    return;
  }
  if (audio.ended && Number.isFinite(audio.duration) && audio.duration > 0) audio.currentTime = 0;
  grantSystemPlaybackIntent();
  void audio.play()
    .then(() => {
      setPlaybackState(audio);
      syncPositionState(audio, true);
    })
    .catch(error => {
      console.warn('System media play failed:', error);
      setPlaybackState(audio);
    });
}

function pauseFromSystemControl(audio: HTMLAudioElement) {
  if (!audio.paused) audio.pause();
  setPlaybackState(audio);
  syncPositionState(audio, true);
}

function bindSystemControls(audio: HTMLAudioElement) {
  safeSetActionHandler('play', () => playFromSystemControl(audio));
  safeSetActionHandler('pause', () => pauseFromSystemControl(audio));
  safeSetActionHandler('seekbackward', (details: any) => {
    const offset = Number(details?.seekOffset) || 10;
    audio.currentTime = Math.max(0, audio.currentTime - offset);
    syncPositionState(audio, true);
  });
  safeSetActionHandler('seekforward', (details: any) => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : Number.POSITIVE_INFINITY;
    const offset = Number(details?.seekOffset) || 10;
    audio.currentTime = Math.min(duration, audio.currentTime + offset);
    syncPositionState(audio, true);
  });
  safeSetActionHandler('seekto', (details: any) => {
    const requested = Number(details?.seekTime);
    if (!Number.isFinite(requested)) return;
    const fastSeek = (audio as any).fastSeek;
    if (details?.fastSeek && typeof fastSeek === 'function') fastSeek.call(audio, requested);
    else audio.currentTime = requested;
    syncPositionState(audio, true);
  });
}

function bindAudio(audio: HTMLAudioElement) {
  if (boundAudio === audio) return;
  boundAudio = audio;
  audio.setAttribute('playsinline', '');

  const onPlay = () => { syncMetadata(); setPlaybackState(audio); syncPositionState(audio, true); };
  const onPause = () => { setPlaybackState(audio); syncPositionState(audio, true); };
  const onMetadata = () => { syncMetadata(); syncPositionState(audio, true); };
  const onTime = () => syncPositionState(audio, false);
  const onRate = () => syncPositionState(audio, true);
  const onEnded = () => setPlaybackState(audio);

  audio.addEventListener('play', onPlay);
  audio.addEventListener('playing', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('loadedmetadata', onMetadata);
  audio.addEventListener('durationchange', onMetadata);
  audio.addEventListener('timeupdate', onTime);
  audio.addEventListener('ratechange', onRate);
  audio.addEventListener('ended', onEnded);

  bindSystemControls(audio);
  syncMetadata();
  setPlaybackState(audio);
  syncPositionState(audio, true);
}

function connectMediaSession() {
  if (!getMediaSession()) return;
  const audio = getAudio();
  if (audio) bindAudio(audio);
  syncMetadata();
}

connectMediaSession();

const observer = new MutationObserver(mutations => {
  const relevant = mutations.some(mutation =>
    mutation.type === 'childList' ||
    (mutation.type === 'attributes' && mutation.target instanceof HTMLElement && mutation.target.matches(MEDIA_PLAYER_SELECTOR))
  );
  if (relevant) connectMediaSession();
});

observer.observe(document.documentElement, {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: ['data-media-title', 'data-media-artist', 'data-media-artwork']
});

window.addEventListener('pageshow', connectMediaSession);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) connectMediaSession();
});