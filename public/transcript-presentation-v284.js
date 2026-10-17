(() => {
  if (window.__starryTranscriptPresentationV284) return;
  window.__starryTranscriptPresentationV284 = true;

  const state = { overlay: null, mirrorTimer: 0, observerTimer: 0 };

  const style = document.createElement('style');
  style.textContent =
    '.v284-detail-layout{display:flex!important;flex-direction:column!important;gap:.625rem!important}.v284-detail-layout>*{margin-top:0!important}' +
    '.v283-transcript-note,.v283-font-tools,.v283-karaoke-help{display:none!important}' +
    '.v283-transcript-head{align-items:center!important}' +
    '.v283-lyric-current{font-size:1.5rem!important;color:var(--color-primary,#c06c84)!important}.dark .v283-lyric-current{color:#f8fafc!important}' +
    '.v283-lyric-next{font-size:1.06rem!important}' +
    '.v283-lyric-current .v283-lyric-text{background:none!important;-webkit-background-clip:border-box!important;background-clip:border-box!important;color:var(--color-primary,#c06c84)!important;-webkit-text-fill-color:currentColor!important}.dark .v283-lyric-current .v283-lyric-text{background:none!important;color:#f8fafc!important;-webkit-text-fill-color:currentColor!important}' +
    '.v284-expand-transcript{flex:0 0 auto;border:0;border-radius:.85rem;padding:.58rem .82rem;background:var(--color-primary,#c06c84);color:#fff;font-size:.78rem;font-weight:900;cursor:pointer;box-shadow:0 5px 14px rgba(15,23,42,.12)}.v284-expand-transcript:disabled{opacity:.45;cursor:not-allowed}' +
    '.v284-transcript-overlay{position:fixed;top:max(.5rem,env(safe-area-inset-top));left:.5rem;right:.5rem;z-index:2147483646;min-height:10rem;border-radius:1.25rem;background:rgba(0,0,0,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 18px 60px rgba(0,0,0,.38);padding:2.7rem .8rem 1rem;display:flex;flex-direction:column;justify-content:center;gap:.55rem;color:#fff}' +
    '.v284-transcript-overlay-close{position:absolute;right:.65rem;top:.55rem;border:1px solid rgba(255,255,255,.24);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;padding:.4rem .7rem;font-weight:900;font-size:.78rem;cursor:pointer}' +
    '.v284-transcript-overlay-line{display:block;width:100%;margin:0;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:clip;color:#fff!important;font-weight:950;line-height:1.2;letter-spacing:.015em}.v284-transcript-overlay-current{font-size:5rem}.v284-transcript-overlay-next{font-size:3.5rem;opacity:.76}' +
    '@media (max-width:420px){.v284-expand-transcript{padding:.54rem .7rem;font-size:.74rem}.v284-transcript-overlay{left:.35rem;right:.35rem;padding-left:.55rem;padding-right:.55rem}}';
  document.head.appendChild(style);

  function transcriptPanel() {
    return document.getElementById('v283-transcript-panel');
  }

  function detailRoot(timeline) {
    return timeline && (timeline.closest('.max-w-2xl') || timeline.parentElement) || null;
  }

  function arrangeDetailLayout() {
    const timeline = document.getElementById('audio-timeline');
    const panel = transcriptPanel();
    const root = detailRoot(timeline);
    if (!timeline || !panel || !root) return;

    root.classList.add('v284-detail-layout');
    const children = Array.from(root.children);
    children.forEach((child, index) => {
      if (!child.dataset.v284BaseOrder) child.dataset.v284BaseOrder = String(index * 10);
      child.style.order = child.dataset.v284BaseOrder;
    });

    panel.style.order = '-1000';
    const timelineOrder = Number(timeline.dataset.v284BaseOrder || (children.indexOf(timeline) * 10));
    const keywordPanel = children.find(child => child !== panel && child !== timeline && (child.textContent || '').includes('網友關鍵字'));
    if (keywordPanel) keywordPanel.style.order = String(timelineOrder + 1);
  }

  function currentText() {
    return (document.querySelector('#v283-transcript-panel .v283-lyric-current .v283-lyric-text')?.textContent || '').trim();
  }

  function nextText() {
    return (document.querySelector('#v283-transcript-panel .v283-lyric-next .v283-lyric-text')?.textContent || '').trim();
  }

  function fitLine(element, maxPx, minPx) {
    if (!element || !element.isConnected) return;
    let size = maxPx;
    element.style.fontSize = size + 'px';
    while (size > minPx && element.scrollWidth > element.clientWidth) {
      size -= 2;
      element.style.fontSize = size + 'px';
    }
  }

  function fitOverlay() {
    if (!state.overlay || !state.overlay.isConnected) return;
    requestAnimationFrame(() => {
      fitLine(state.overlay.querySelector('[data-v284-overlay-current]'), 96, 24);
      fitLine(state.overlay.querySelector('[data-v284-overlay-next]'), 72, 20);
    });
  }

  function mirrorTranscript() {
    const button = document.querySelector('[data-v284-expand-transcript]');
    const current = currentText();
    if (button) button.disabled = !current;
    if (!state.overlay || !state.overlay.isConnected) return;
    const currentEl = state.overlay.querySelector('[data-v284-overlay-current]');
    const nextEl = state.overlay.querySelector('[data-v284-overlay-next]');
    if (currentEl && currentEl.textContent !== current) currentEl.textContent = current;
    const next = nextText();
    if (nextEl && nextEl.textContent !== next) nextEl.textContent = next;
    fitOverlay();
  }

  function closeOverlay() {
    clearInterval(state.mirrorTimer);
    state.mirrorTimer = 0;
    if (state.overlay) state.overlay.remove();
    state.overlay = null;
  }

  function openOverlay() {
    if (!currentText()) return;
    closeOverlay();
    const overlay = document.createElement('section');
    overlay.id = 'v284-transcript-overlay';
    overlay.className = 'v284-transcript-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', '放大逐字稿');
    overlay.innerHTML = '<button type="button" class="v284-transcript-overlay-close" data-v284-overlay-close>縮小</button><div class="v284-transcript-overlay-line v284-transcript-overlay-current" data-v284-overlay-current></div><div class="v284-transcript-overlay-line v284-transcript-overlay-next" data-v284-overlay-next></div>';
    document.body.appendChild(overlay);
    state.overlay = overlay;
    overlay.querySelector('[data-v284-overlay-close]').addEventListener('click', closeOverlay);
    mirrorTranscript();
    state.mirrorTimer = window.setInterval(mirrorTranscript, 180);
    fitOverlay();
  }

  function ensureExpandButton() {
    const panel = transcriptPanel();
    if (!panel) {
      closeOverlay();
      return;
    }
    const head = panel.querySelector('.v283-transcript-head');
    if (!head) return;
    let button = head.querySelector('[data-v284-expand-transcript]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'v284-expand-transcript';
      button.dataset.v284ExpandTranscript = '1';
      button.textContent = '放大逐字稿';
      button.addEventListener('click', openOverlay);
      head.appendChild(button);
    }
    button.disabled = !currentText();
  }

  function refresh() {
    arrangeDetailLayout();
    ensureExpandButton();
    mirrorTranscript();
  }

  const schedule = () => {
    clearTimeout(state.observerTimer);
    state.observerTimer = window.setTimeout(refresh, 80);
  };

  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('resize', fitOverlay);
  window.addEventListener('popstate', () => { closeOverlay(); schedule(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();
})();
