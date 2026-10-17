(() => {
  if (window.__starryV303RuntimeFixes) return;
  window.__starryV303RuntimeFixes = true;

  const PROXY_ROOT_ID = 'v303-transcript-time-proxy-root';
  const PROXY_FLAG = 'v303Proxy';
  let syncTimer = 0;

  const style = document.createElement('style');
  style.id = 'starry-v303-runtime-fixes-style';
  style.textContent = `
    body .v161-track-editor-overlay{overflow:hidden!important;overscroll-behavior:contain!important}
    body .v161-track-editor-overlay .upload-modal-overlay{position:absolute!important;inset:4.4rem 0 0 0!important;height:auto!important;max-height:none!important;overflow-y:auto!important;overflow-x:hidden!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-y:contain!important;touch-action:pan-y!important}
    body .v161-track-editor-overlay .upload-modal-overlay>div:first-child{min-height:100%!important;height:max-content!important;overflow:visible!important}
    [data-v303-keyword-placeholder="1"]{display:none!important}
    @media(max-width:767px){body .v161-track-editor-overlay .upload-modal-overlay{inset:4rem 0 0 0!important}}
  `;
  document.head.appendChild(style);

  function realTimeline() {
    return [...document.querySelectorAll('#audio-timeline')]
      .find(element => element instanceof HTMLElement && element.dataset[PROXY_FLAG] !== '1') || null;
  }

  function proxyRoot() {
    return document.getElementById(PROXY_ROOT_ID);
  }

  function ensureProxyRoot() {
    let root = proxyRoot();
    if (root) return root;
    root = document.createElement('div');
    root.id = PROXY_ROOT_ID;
    root.hidden = true;
    root.setAttribute('aria-hidden', 'true');
    const timeline = document.createElement('div');
    timeline.id = 'audio-timeline';
    timeline.dataset[PROXY_FLAG] = '1';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '86400';
    input.step = '0.01';
    input.value = '0';
    input.dataset.v303TimeProxy = '1';
    timeline.appendChild(input);
    root.appendChild(timeline);
    document.body.appendChild(root);
    return root;
  }

  function proxyTimeline(root = proxyRoot()) {
    return root?.querySelector?.('#audio-timeline[data-v303-proxy="1"]') || null;
  }

  function activeAudio() {
    const audios = [...document.querySelectorAll('audio')];
    return audios.find(audio => !audio.paused && !audio.ended)
      || audios.find(audio => Boolean(audio.currentSrc || audio.src))
      || audios[0]
      || null;
  }

  function stashTranscriptPanel(panel) {
    if (!(panel instanceof HTMLElement)) return;
    const timeline = realTimeline();
    if (timeline) {
      if (panel.parentElement !== timeline.parentElement || panel.nextElementSibling !== timeline) {
        timeline.insertAdjacentElement('beforebegin', panel);
      }
      return;
    }
    const root = ensureProxyRoot();
    const proxy = proxyTimeline(root);
    if (proxy && (panel.parentElement !== root || panel.nextElementSibling !== proxy)) {
      root.insertBefore(panel, proxy);
    }
  }

  function syncTranscriptTimeProxy() {
    const timeline = realTimeline();
    const root = proxyRoot();
    if (timeline) {
      const stashedPanel = root?.querySelector?.('#v290-transcript-panel');
      if (stashedPanel instanceof HTMLElement) {
        timeline.insertAdjacentElement('beforebegin', stashedPanel);
      }
      root?.remove();
      return;
    }

    const overlay = document.getElementById('v290-overlay');
    if (!overlay && !root) return;
    const audio = activeAudio();
    if (!audio) return;
    const nextRoot = root || ensureProxyRoot();
    const input = nextRoot.querySelector('input[data-v303-time-proxy="1"]');
    if (!(input instanceof HTMLInputElement)) return;
    const duration = Number(audio.duration);
    input.max = String(Number.isFinite(duration) && duration > 0 ? Math.max(duration + 1, 60) : 86400);
    input.value = String(Math.max(0, Number(audio.currentTime) || 0));
  }

  function findKeywordBlock(root, timeline) {
    return [...root.children].find(element =>
      element !== timeline
      && element instanceof HTMLElement
      && element.dataset.v303KeywordPlaceholder !== '1'
      && String(element.textContent || '').includes('網友關鍵字')
      && Boolean(element.querySelector('button[aria-expanded]'))
    ) || null;
  }

  function findAudioPhotoCard(root, timeline, keywordBlock) {
    const marked = root.querySelector(':scope > [data-v301-audio-info-card="1"]');
    if (marked instanceof HTMLElement) return marked;
    return [...root.children].find(element =>
      element !== timeline
      && element !== keywordBlock
      && element instanceof HTMLElement
      && element.matches('.relative.rounded-3xl')
      && Boolean(element.querySelector('h1'))
      && Boolean(element.querySelector('img'))
    ) || null;
  }

  function stabilizeKeywordBelowPhoto() {
    const timeline = realTimeline();
    const root = timeline?.parentElement;
    if (!timeline || !root) return;
    const keywordBlock = findKeywordBlock(root, timeline);
    if (!(keywordBlock instanceof HTMLElement)) return;
    const info = findAudioPhotoCard(root, timeline, keywordBlock);
    if (!(info instanceof HTMLElement)) return;

    keywordBlock.removeAttribute('data-v301-keywords-block');
    let placeholder = root.querySelector(':scope > [data-v303-keyword-placeholder="1"]');
    if (!(placeholder instanceof HTMLElement)) {
      placeholder = document.createElement('span');
      placeholder.hidden = true;
      placeholder.dataset.v303KeywordPlaceholder = '1';
      placeholder.setAttribute('data-v301-keywords-block', '1');
    }
    if (timeline.nextElementSibling !== placeholder) {
      timeline.insertAdjacentElement('afterend', placeholder);
    }
    if (placeholder.nextElementSibling !== info) {
      placeholder.insertAdjacentElement('afterend', info);
    }
    if (info.nextElementSibling !== keywordBlock) {
      info.insertAdjacentElement('afterend', keywordBlock);
    }
  }

  function scheduleSync() {
    clearTimeout(syncTimer);
    syncTimer = window.setTimeout(() => {
      syncTranscriptTimeProxy();
      stabilizeKeywordBelowPhoto();
    }, 0);
  }

  const observer = new MutationObserver(records => {
    if (!realTimeline()) {
      for (const record of records) {
        for (const removed of record.removedNodes || []) {
          if (!(removed instanceof Element)) continue;
          const panel = removed.id === 'v290-transcript-panel'
            ? removed
            : removed.querySelector?.('#v290-transcript-panel');
          if (panel instanceof HTMLElement) stashTranscriptPanel(panel);
        }
      }
    }
    scheduleSync();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('play', event => {
    if (event.target instanceof HTMLAudioElement) scheduleSync();
  }, true);
  document.addEventListener('timeupdate', event => {
    if (event.target instanceof HTMLAudioElement && !realTimeline()) syncTranscriptTimeProxy();
  }, true);
  window.addEventListener('resize', scheduleSync);

  window.setInterval(syncTranscriptTimeProxy, 120);
  scheduleSync();
})();
