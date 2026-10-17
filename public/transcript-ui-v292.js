(() => {
  if (window.__starryTranscriptUiV292) return;
  window.__starryTranscriptUiV292 = true;

  const TRANSLATE_ICON = `
    <svg class="v292-translate-icon" viewBox="0 0 28 24" aria-hidden="true" focusable="false">
      <rect x="2" y="3" width="15" height="15" rx="4" class="v292-icon-back"></rect>
      <rect x="11" y="7" width="15" height="15" rx="4" class="v292-icon-front"></rect>
      <text x="9.5" y="13.6" text-anchor="middle" class="v292-icon-zh">文</text>
      <text x="18.5" y="18.1" text-anchor="middle" class="v292-icon-en">A</text>
      <path d="M6.2 19.1c2.6 1.7 5.6 2.2 8.7 1.4" class="v292-icon-arrow"></path>
      <path d="M6 19.2l2.9-.2-1.2 2.6" class="v292-icon-arrow"></path>
    </svg>`;

  const style = document.createElement('style');
  style.textContent = `
    #v290-transcript-panel .v290-title{display:none!important}
    #v290-transcript-panel .v290-head{justify-content:center!important;align-items:center!important;margin-bottom:.5rem!important}
    #v290-transcript-panel .v290-tools{margin-left:0!important;width:100%!important;justify-content:center!important;gap:.55rem!important}
    #v290-transcript-panel .v290-menu{right:auto!important;left:50%!important;transform:translateX(-50%)!important}
    #v290-transcript-panel .v290-btn{min-height:2.35rem!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:.38rem!important}
    #v290-transcript-panel .v290-btn:disabled{opacity:.72!important}
    #v290-transcript-panel .v290-stage{height:4.65rem!important;min-height:4.65rem!important;max-height:4.65rem!important;padding:.34rem .62rem!important;box-sizing:border-box!important;overflow:hidden!important}
    #v290-transcript-panel .v290-line{line-height:1.22!important;max-height:100%!important;overflow:hidden!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important}
    #v290-transcript-panel .v290-meta{padding-top:.3rem!important}
    .v292-translate-icon{width:1.72rem;height:1.48rem;display:block;overflow:visible;flex:none}
    .v292-icon-back{fill:#eef5ff;stroke:#3276d2;stroke-width:1.35}
    .v292-icon-front{fill:#fff;stroke:#7b61d1;stroke-width:1.35}
    .dark .v292-icon-back{fill:#172554;stroke:#7db5ff}.dark .v292-icon-front{fill:#312e81;stroke:#c4b5fd}
    .v292-icon-zh,.v292-icon-en{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:900;fill:#245da8;font-size:7px;dominant-baseline:middle}
    .v292-icon-en{fill:#6d4bc2;font-size:7.5px}.dark .v292-icon-zh{fill:#bfdbfe}.dark .v292-icon-en{fill:#ddd6fe}
    .v292-icon-arrow{fill:none;stroke:#5f6f86;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}.dark .v292-icon-arrow{stroke:#cbd5e1}
    #v290-overlay.v290-overlay{min-height:3.65rem!important;max-height:5.4rem!important;padding:.38rem 3.35rem .38rem .7rem!important;border-radius:.9rem!important}
    #v290-overlay .v290-overlay-close{right:.38rem!important;top:50%!important;transform:translateY(-50%)!important;width:2.7rem!important;height:2.7rem!important;font-size:1.85rem!important;line-height:1!important;background:rgba(255,255,255,.18)!important}
    @media(max-width:420px){
      #v290-transcript-panel .v290-tools{gap:.4rem!important}
      #v290-transcript-panel .v290-btn{padding:.48rem .6rem!important}
      #v290-transcript-panel .v290-stage{height:4.4rem!important;min-height:4.4rem!important;max-height:4.4rem!important;padding:.3rem .48rem!important}
      #v290-overlay.v290-overlay{min-height:3.35rem!important;max-height:4.9rem!important;padding:.32rem 3.1rem .32rem .55rem!important}
      #v290-overlay .v290-overlay-close{width:2.5rem!important;height:2.5rem!important;font-size:1.7rem!important}
    }
  `;
  document.head.appendChild(style);

  function translateLabel(button) {
    if (!button) return '翻譯';
    const raw = (button.textContent || '').trim();
    if (/Translating|翻譯中/i.test(raw)) return '翻譯中…';
    return '翻譯';
  }

  function redrawTranslateButton(button) {
    if (!button) return;
    const label = translateLabel(button);
    const signature = `${label}:${button.disabled ? '1' : '0'}`;
    if (button.dataset.v292Signature === signature && button.querySelector('.v292-translate-icon')) return;
    button.dataset.v292Signature = signature;
    button.innerHTML = `${TRANSLATE_ICON}<span data-v292-label>${label}</span><span aria-hidden="true">▾</span>`;
    button.setAttribute('aria-label', label === '翻譯中…' ? '逐字稿翻譯中' : '翻譯逐字稿');
  }

  function findKeywordBlock(root, panel) {
    if (!root) return null;
    const known = root.querySelector(':scope > [data-v292-keywords="1"]');
    if (known) return known;
    const candidates = Array.from(root.children);
    const keyword = candidates.find((el) => {
      if (el === panel) return false;
      const value = (el.textContent || '').replace(/\s+/g, '');
      return value.includes('網友關鍵字') && Boolean(el.querySelector('button'));
    });
    if (keyword) keyword.dataset.v292Keywords = '1';
    return keyword || null;
  }

  function swapPermanentPositions(panel) {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline || !panel) return;
    const root = timeline.closest('.max-w-2xl') || timeline.parentElement;
    if (!root || timeline.parentElement !== root || panel.parentElement !== root) return;
    const keyword = findKeywordBlock(root, panel);
    if (!keyword || keyword.parentElement !== root) return;

    // 逐字稿永久接手原本「網友關鍵字」的最上方位置。
    if (root.firstElementChild !== panel) root.insertBefore(panel, root.firstChild);
    // 網友關鍵字移到逐字稿原本所在的播放器上方位置。
    if (keyword.nextElementSibling !== timeline) root.insertBefore(keyword, timeline);
  }

  function fitTranscriptLine(line) {
    if (!line || !line.isConnected) return;
    const stage = line.closest('.v290-stage');
    if (!stage || stage.clientWidth < 20 || stage.clientHeight < 20) return;

    const computed = getComputedStyle(stage);
    const availableHeight = Math.max(20,
      stage.clientHeight - parseFloat(computed.paddingTop || '0') - parseFloat(computed.paddingBottom || '0'));
    const maxPx = window.innerWidth <= 420 ? 21.5 : 24.8;
    const minPx = 7.5;
    let size = maxPx;

    line.style.fontSize = `${size}px`;
    line.style.maxHeight = 'none';
    line.style.display = 'block';
    line.style.overflow = 'visible';

    while (size > minPx && line.scrollHeight > availableHeight + 1) {
      size -= 0.5;
      line.style.fontSize = `${size}px`;
    }

    line.style.fontSize = `${Math.max(minPx, size).toFixed(1)}px`;
    line.style.maxHeight = `${availableHeight}px`;
    line.style.overflow = 'hidden';
  }

  function polish() {
    const panel = document.getElementById('v290-transcript-panel');
    if (panel) {
      const title = panel.querySelector('.v290-title');
      if (title) title.remove();

      const translate = panel.querySelector('[data-v290-translate]');
      redrawTranslateButton(translate);

      const expand = panel.querySelector('[data-v290-expand]');
      if (expand) {
        expand.textContent = '放大';
        expand.setAttribute('aria-label', '放大逐字稿');
      }

      swapPermanentPositions(panel);
      fitTranscriptLine(panel.querySelector('[data-v290-line]'));
    }

    const overlay = document.getElementById('v290-overlay');
    if (overlay) {
      const close = overlay.querySelector('[data-v290-overlay-close]');
      if (close) {
        close.textContent = '✕';
        close.setAttribute('aria-label', '關閉放大逐字稿');
      }
    }
  }

  let timer = 0;
  let running = false;
  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (running) return;
      running = true;
      try { polish(); } finally { running = false; }
    }, 45);
  };

  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  polish();
})();
