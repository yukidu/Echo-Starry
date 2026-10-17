(() => {
  if (window.__starryTranscriptUiV296) return;
  window.__starryTranscriptUiV296 = true;

  const DISPLAY_END_PUNCTUATION = new Set(['、','，','！','。',',','!','.']);
  const nativeTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  const PAGE_TRANSLATE_SKIP = 'script,style,noscript,textarea,input,select,option,.v296-translate-dialog,[translate="no"],[data-v296-no-page-translate]';
  const floating = { trackId:'', segments:[], loading:false, generation:0, tracks:null };
  const pageTranslation = { translator:null, generation:0, observer:null, nodes:new Map(), queued:new Set(), timer:0 };

  const TRANSLATE_ICON = `
    <svg class="v296-translate-icon" viewBox="0 0 30 26" aria-hidden="true" focusable="false">
      <rect x="2.2" y="2.2" width="17" height="17" rx="5" class="v296-icon-back"/>
      <path d="M6.1 10.7h9.2M10.7 6.1v9.2M6.9 15.3c2.4-1.2 4.2-3.2 5.1-5.9M14.8 15.3c-2.3-1.2-4-3.2-4.9-5.9" class="v296-icon-mark"/>
      <rect x="10.8" y="6.8" width="17" height="17" rx="5" class="v296-icon-front"/>
      <path d="M15.1 18.7l3.7-7.5 3.7 7.5M16.4 16.2h4.8" class="v296-icon-a"/>
    </svg>`;

  const style = document.createElement('style');
  style.id = 'starry-transcript-ui-v296-style';
  style.textContent = `
    #v290-transcript-panel .v290-title{display:none!important}
    #v290-transcript-panel .v290-head{justify-content:center!important;align-items:center!important;margin-bottom:.5rem!important}
    #v290-transcript-panel .v290-tools{margin-left:0!important;width:100%!important;justify-content:center!important;gap:.55rem!important}
    #v290-transcript-panel .v290-menu{right:auto!important;left:50%!important;transform:translateX(-50%)!important}
    #v290-transcript-panel .v290-btn{min-height:2.5rem!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:.38rem!important}
    #v290-transcript-panel [data-v290-expand]{background:var(--color-primary,#c06c84)!important;border-color:var(--color-primary,#c06c84)!important;color:#fff!important;box-shadow:0 7px 18px color-mix(in srgb,var(--color-primary,#c06c84) 30%,transparent)!important;font-weight:950!important}
    #v290-transcript-panel [data-v290-expand]:active{transform:scale(.97)}
    #v290-transcript-panel .v290-stage{height:4.65rem!important;min-height:4.65rem!important;max-height:4.65rem!important;padding:.34rem .62rem!important;box-sizing:border-box!important;overflow:hidden!important}
    #v290-transcript-panel .v290-line{line-height:1.22!important;max-height:100%!important;overflow:hidden!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important}
    #v290-transcript-panel .v290-meta{padding-top:.3rem!important}
    .v296-translate-icon{width:1.75rem;height:1.52rem;display:block;overflow:hidden;flex:none}
    .v296-icon-back{fill:color-mix(in srgb,var(--color-primary,#c06c84) 13%,#fff);stroke:color-mix(in srgb,var(--color-primary,#c06c84) 86%,#315a9b);stroke-width:1.4}
    .v296-icon-front{fill:#fff;stroke:color-mix(in srgb,var(--color-primary,#c06c84) 72%,#6250a4);stroke-width:1.4}
    .dark .v296-icon-front{fill:#172033}.v296-icon-mark,.v296-icon-a{fill:none;stroke:var(--color-primary,#c06c84);stroke-width:1.45;stroke-linecap:round;stroke-linejoin:round}.v296-icon-a{stroke-width:1.7}
    #v290-overlay.v290-overlay{height:7.15rem!important;min-height:7.15rem!important;max-height:7.15rem!important;padding:.46rem 3.4rem .46rem .72rem!important;border-radius:1rem!important;background:rgba(0,0,0,.72)!important;box-sizing:border-box!important;overflow:hidden!important;box-shadow:0 12px 34px rgba(0,0,0,.34)!important}
    #v290-overlay .v290-overlay-line{position:absolute!important;left:.72rem!important;right:3.4rem!important;top:50%!important;transform:translateY(-50%)!important;width:auto!important;display:block!important;max-height:calc(100% - .92rem)!important;overflow:hidden!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;text-align:center!important;line-height:1.08!important}
    #v290-overlay .v290-overlay-close{right:.4rem!important;top:50%!important;transform:translateY(-50%)!important;width:2.7rem!important;height:2.7rem!important;font-size:1.85rem!important;line-height:1!important;background:rgba(255,255,255,.2)!important}
    .v296-translate-dialog{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.52);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
    .v296-translate-dialog[hidden]{display:none!important}.v296-translate-card{width:min(25rem,94vw);border-radius:1.25rem;padding:1.1rem;background:#fff;color:#0f172a;box-shadow:0 24px 80px rgba(15,23,42,.32);font:700 1rem/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.dark .v296-translate-card{background:#172033;color:#f8fafc}
    .v296-translate-card h3{margin:0 0 .45rem;font-size:1.15rem;font-weight:950}.v296-translate-card p{margin:.35rem 0}.v296-translate-note{font-size:.84rem;opacity:.72}.v296-translate-close{width:100%;margin-top:.75rem;border:0;border-radius:.85rem;padding:.72rem;background:var(--color-primary,#c06c84);color:#fff;font-weight:900;cursor:pointer}
    @media(max-width:420px){#v290-transcript-panel .v290-tools{gap:.4rem!important}#v290-transcript-panel .v290-btn{padding:.5rem .66rem!important}#v290-transcript-panel .v290-stage{height:4.4rem!important;min-height:4.4rem!important;max-height:4.4rem!important;padding:.3rem .48rem!important}#v290-overlay.v290-overlay{height:7rem!important;min-height:7rem!important;max-height:7rem!important;padding:.4rem 3.15rem .4rem .58rem!important}#v290-overlay .v290-overlay-line{left:.58rem!important;right:3.15rem!important;max-height:calc(100% - .8rem)!important}#v290-overlay .v290-overlay-close{width:2.5rem!important;height:2.5rem!important;font-size:1.7rem!important}}
  `;
  document.head.appendChild(style);

  function displaySubtitleText(value) {
    const raw = String(value == null ? '' : value);
    if (!raw) return raw;
    const parts = Array.from(raw);
    const last = parts[parts.length - 1] || '';
    return DISPLAY_END_PUNCTUATION.has(last) ? parts.slice(0, -1).join('') : raw;
  }

  function guardSubtitleDisplay(element) {
    if (!element || element.dataset.v296DisplayGuard === '1') return;
    element.dataset.v296DisplayGuard = '1';
    if (nativeTextContent?.get && nativeTextContent?.set) {
      try {
        Object.defineProperty(element, 'textContent', {
          configurable: true,
          get() { return nativeTextContent.get.call(this); },
          set(value) { nativeTextContent.set.call(this, displaySubtitleText(value)); }
        });
      } catch {}
    }
    const current = element.textContent || '';
    const visible = displaySubtitleText(current);
    if (visible !== current) element.textContent = visible;
  }

  function redrawTranslateButton(button, label = 'Translate') {
    if (!button) return;
    button.dataset.v296Ready = '1';
    button.disabled = false;
    button.innerHTML = `${TRANSLATE_ICON}<span>${String(label || 'Translate')}</span><span aria-hidden="true">▾</span>`;
    button.setAttribute('aria-label', '使用瀏覽器整頁翻譯');
  }

  function anchorTranscriptAbovePlayer(panel) {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline || !panel || !timeline.parentElement) return;
    if (panel.parentElement !== timeline.parentElement || panel.nextElementSibling !== timeline) timeline.insertAdjacentElement('beforebegin', panel);
  }

  function findRoundedBlockByText(label, partial = false) {
    const nodes = [...document.querySelectorAll('span,h2,h3,h4,button')];
    const hit = nodes.find(node => {
      const value = String(node.textContent || '').replace(/\s+/g,' ').trim();
      return partial ? value.includes(label) : value === label;
    });
    if (!hit) return null;
    return hit.closest('.rounded-2xl') || hit.closest('section') || hit.parentElement;
  }

  function moveKeywordsAboveReferences() {
    const keyword = findRoundedBlockByText('網友關鍵字', true);
    const reference = findRoundedBlockByText('參考資料');
    if (!keyword || !reference || keyword === reference || !reference.parentElement) return;
    if (keyword.parentElement === reference.parentElement && keyword.nextElementSibling !== reference) reference.parentElement.insertBefore(keyword, reference);
  }

  function fitTranscriptLine(line) {
    if (!line || !line.isConnected) return;
    const stage = line.closest('.v290-stage');
    if (!stage || stage.clientWidth < 20 || stage.clientHeight < 20) return;
    const computed = getComputedStyle(stage);
    const availableHeight = Math.max(20, stage.clientHeight - parseFloat(computed.paddingTop || '0') - parseFloat(computed.paddingBottom || '0'));
    const maxPx = window.innerWidth <= 420 ? 21.5 : 24.8;
    const minPx = 8;
    let size = maxPx;
    line.style.fontSize = `${size}px`;
    line.style.maxHeight = 'none';
    line.style.overflow = 'visible';
    while (size > minPx && line.scrollHeight > availableHeight + 1) {
      size -= .5;
      line.style.fontSize = `${size}px`;
    }
    line.style.fontSize = `${Math.max(minPx, size).toFixed(1)}px`;
    line.style.maxHeight = `${availableHeight}px`;
    line.style.overflow = 'hidden';
  }

  function fitOverlayLine(line) {
    if (!line || !line.isConnected) return;
    const overlay = line.closest('#v290-overlay');
    if (!overlay || overlay.hidden || overlay.clientWidth < 40 || overlay.clientHeight < 40) return;
    const computed = getComputedStyle(overlay);
    const availableHeight = Math.max(20, overlay.clientHeight - parseFloat(computed.paddingTop || '0') - parseFloat(computed.paddingBottom || '0'));
    const availableWidth = Math.max(40, overlay.clientWidth - parseFloat(computed.paddingLeft || '0') - parseFloat(computed.paddingRight || '0'));
    const maxPx = window.innerWidth <= 420 ? 43 : 57;
    const minPx = 9;
    let size = maxPx;
    line.style.fontSize = `${size}px`;
    line.style.maxHeight = 'none';
    line.style.overflow = 'visible';
    while (size > minPx && (line.scrollHeight > availableHeight + 1 || line.scrollWidth > availableWidth + 1)) {
      size -= 1;
      line.style.fontSize = `${size}px`;
    }
    line.style.fontSize = `${Math.max(minPx, size)}px`;
    line.style.maxHeight = `${availableHeight}px`;
    line.style.overflow = 'hidden';
  }

  function ensureDialog() {
    let dialog = document.getElementById('v296-browser-translate-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'v296-browser-translate-dialog';
    dialog.className = 'v296-translate-dialog';
    dialog.hidden = true;
    dialog.setAttribute('translate', 'no');
    dialog.innerHTML = '<div class="v296-translate-card" role="dialog" aria-modal="true"><h3>瀏覽器整頁翻譯</h3><p data-v296-instruction></p><p class="v296-translate-note">不使用 Cloudflare AI 外語翻譯；逐字稿仍只在雲端產生原文／繁體中文版本。</p><button type="button" class="v296-translate-close">知道了</button></div>';
    document.body.appendChild(dialog);
    dialog.querySelector('.v296-translate-close').onclick = () => { dialog.hidden = true; };
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.hidden = true; });
    return dialog;
  }

  function setDialogInstruction(dialog, value) {
    const instruction = dialog.querySelector('[data-v296-instruction]');
    if (instruction) { instruction.textContent = String(value || ''); instruction.style.whiteSpace = 'pre-line'; }
  }

  function browserInstruction(label) {
    const ua = navigator.userAgent || '';
    const safari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android/i.test(ua);
    if (safari) return `目標語言：${label}\n請點 Safari 網址列的「頁面選單／aA」→「翻譯網站」→ 選擇語言，Safari 會翻譯整頁。`;
    return `目標語言：${label}\n這台瀏覽器目前不允許網站直接按下內建翻譯。請開啟瀏覽器選單「翻譯」並選擇語言，即可翻譯整頁。`;
  }

  function stopAutomaticPageTranslation() {
    pageTranslation.generation += 1;
    pageTranslation.observer?.disconnect();
    pageTranslation.observer = null;
    clearTimeout(pageTranslation.timer);
    pageTranslation.queued.clear();
    for (const [node, saved] of pageTranslation.nodes.entries()) if (node?.isConnected && node.nodeValue === saved.translated) node.nodeValue = saved.original;
    pageTranslation.nodes.clear();
    try { pageTranslation.translator?.destroy?.(); } catch {}
    pageTranslation.translator = null;
    document.documentElement.lang = 'zh-Hant-TW';
  }

  function shouldTranslateTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const raw = String(node.nodeValue || '');
    if (!raw.trim() || !/[\p{L}\p{Script=Han}]/u.test(raw)) return false;
    const parent = node.parentElement;
    return Boolean(parent && !parent.closest(PAGE_TRANSLATE_SKIP));
  }

  function collectTextNodes(root) {
    if (!root) return [];
    if (root.nodeType === Node.TEXT_NODE) return shouldTranslateTextNode(root) ? [root] : [];
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (shouldTranslateTextNode(node)) nodes.push(node);
    return nodes;
  }

  async function translateNodes(nodes, generation = pageTranslation.generation) {
    const translator = pageTranslation.translator;
    if (!translator || generation !== pageTranslation.generation) return;
    for (const node of [...new Set(nodes)].filter(shouldTranslateTextNode)) {
      const raw = String(node.nodeValue || '');
      const previous = pageTranslation.nodes.get(node);
      if (previous && raw === previous.translated) continue;
      try {
        const translated = await translator.translate(raw);
        if (generation !== pageTranslation.generation || !node.isConnected) return;
        pageTranslation.nodes.set(node, { original: raw, translated });
        node.nodeValue = translated;
      } catch {}
    }
  }

  function watchDynamicTranslation() {
    pageTranslation.observer?.disconnect();
    pageTranslation.observer = new MutationObserver(records => {
      const nodes = [];
      for (const record of records) {
        if (record.type === 'characterData') nodes.push(record.target);
        for (const added of record.addedNodes || []) nodes.push(...collectTextNodes(added));
      }
      nodes.forEach(node => pageTranslation.queued.add(node));
      clearTimeout(pageTranslation.timer);
      pageTranslation.timer = window.setTimeout(() => {
        const queued = [...pageTranslation.queued];
        pageTranslation.queued.clear();
        void translateNodes(queued);
      }, 90);
    });
    pageTranslation.observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  }

  async function tryAutomaticBrowserPageTranslation(code, label, dialog) {
    const TranslatorApi = globalThis.Translator;
    if (!TranslatorApi?.availability || !TranslatorApi?.create) return false;
    const targetLanguage = code === 'zh-Hans' ? 'zh' : code;
    try {
      const options = { sourceLanguage:'zh-Hant', targetLanguage };
      const availability = await TranslatorApi.availability(options);
      if (availability === 'unavailable') return false;
      stopAutomaticPageTranslation();
      const generation = pageTranslation.generation;
      setDialogInstruction(dialog, `目標語言：${label}\n正在使用瀏覽器內建翻譯，整頁內容會一起翻譯…`);
      dialog.hidden = false;
      const translator = await TranslatorApi.create(options);
      if (generation !== pageTranslation.generation) { try { translator.destroy?.(); } catch {} return true; }
      pageTranslation.translator = translator;
      document.documentElement.lang = targetLanguage;
      await translateNodes(collectTextNodes(document.body), generation);
      watchDynamicTranslation();
      setDialogInstruction(dialog, `目標語言：${label}\n已使用瀏覽器內建功能完成整頁翻譯。`);
      return true;
    } catch { stopAutomaticPageTranslation(); return false; }
  }

  async function getTracks() {
    if (floating.tracks) return floating.tracks;
    try {
      const response = await fetch('/api/tracks', { credentials:'same-origin', cache:'force-cache' });
      const data = await response.json();
      floating.tracks = Array.isArray(data) ? data : (data.tracks || data.data || []);
    } catch { floating.tracks = []; }
    return floating.tracks;
  }

  async function detectTrackId() {
    const mini = document.querySelector('[data-echostars-media-session="1"][data-media-track-id]');
    const miniId = mini?.getAttribute('data-media-track-id') || '';
    if (miniId) return miniId;
    const timeline = document.getElementById('audio-timeline');
    if (!timeline) return floating.trackId;
    const root = timeline.closest('.max-w-2xl') || timeline.parentElement || document.body;
    const title = String(root.querySelector('h1')?.textContent || '').trim();
    if (!title) return floating.trackId;
    const tracks = await getTracks();
    const same = tracks.filter(item => String(item?.title || '').trim() === title);
    return same.length ? String(same[0].id || '') : floating.trackId;
  }

  function parseClock(value) {
    const parts = String(value || '').trim().split(':').map(Number);
    if (parts.some(Number.isNaN)) return NaN;
    if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
    if (parts.length === 2) return parts[0]*60 + parts[1];
    return Number(parts[0] || 0);
  }

  function currentPlaybackTime() {
    const audio = [...document.querySelectorAll('audio')].find(item => Number.isFinite(item.currentTime) && item.currentTime > 0) || document.querySelector('audio');
    if (audio && Number.isFinite(audio.currentTime)) return Number(audio.currentTime || 0);
    const mini = document.querySelector('[data-echostars-media-session="1"]');
    const match = String(mini?.textContent || '').match(/(\d{1,2}:\d{2}(?::\d{2})?)\s*\/\s*\d/);
    return match ? parseClock(match[1]) : 0;
  }

  async function loadFloatingTranscript(trackId) {
    if (!trackId || floating.loading) return;
    floating.loading = true;
    const generation = ++floating.generation;
    try {
      const response = await fetch('/api/v281/transcripts/' + encodeURIComponent(trackId), { credentials:'same-origin', cache:'no-store' });
      const data = await response.json().catch(() => ({}));
      if (generation !== floating.generation) return;
      floating.trackId = trackId;
      floating.segments = Array.isArray(data.segments) ? data.segments.map(segment => ({ start:Number(segment.start||0), end:Number(segment.end||0), text:String(segment.text||'') })) : [];
    } catch { if (generation === floating.generation) floating.segments = []; }
    finally { if (generation === floating.generation) floating.loading = false; }
  }

  function activeFloatingSegment(time) {
    if (!floating.segments.length) return null;
    let prior = floating.segments[0];
    for (const segment of floating.segments) {
      if (time >= segment.start && time < segment.end) return segment;
      if (segment.start <= time) prior = segment;
      else break;
    }
    return prior;
  }

  async function paintFloatingOverlay() {
    const overlay = document.getElementById('v290-overlay');
    if (!overlay || overlay.hidden) return;
    const trackId = await detectTrackId();
    if (trackId && trackId !== floating.trackId) await loadFloatingTranscript(trackId);
    if (!floating.segments.length) return;
    const segment = activeFloatingSegment(currentPlaybackTime());
    const line = overlay.querySelector('[data-v290-overlay-line]');
    if (line && segment) {
      const next = displaySubtitleText(segment.text);
      if (line.textContent !== next) line.textContent = next;
      fitOverlayLine(line);
    }
  }

  async function chargeTranslation(trackId) {
    if (!trackId) return { success:false, error:'目前無法辨識正在播放的音檔，請重新進入詳細頁後再使用翻譯。' };
    try {
      const response = await fetch('/api/v281/transcripts/' + encodeURIComponent(trackId) + '/translation-use', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}' });
      const data = await response.json().catch(() => ({}));
      return response.ok ? { success:true, ...data } : { success:false, error:data.error || '翻譯功能目前無法使用' };
    } catch { return { success:false, error:'翻譯功能目前無法連線，請稍後再試。' }; }
  }

  async function requestBrowserPageTranslation(option) {
    const code = option.dataset.language || '';
    const label = (option.textContent || '').trim() || code;
    const menu = option.closest('[data-v290-menu]');
    if (menu) menu.hidden = true;
    option.parentElement?.querySelectorAll('.v290-option').forEach(el => el.classList.toggle('is-active', el === option));
    redrawTranslateButton(document.querySelector('[data-v290-translate]'), code === 'zh-Hant' ? 'Translate' : label);
    const dialog = ensureDialog();
    if (code === 'zh-Hant') {
      stopAutomaticPageTranslation();
      setDialogInstruction(dialog, '已恢復繁體中文。若先前由 Safari／Chrome 選單啟動翻譯，請在瀏覽器選擇「顯示原文」。');
      dialog.hidden = false;
      return;
    }
    const trackId = await detectTrackId();
    const charge = await chargeTranslation(trackId);
    if (!charge.success) {
      setDialogInstruction(dialog, charge.error);
      dialog.hidden = false;
      return;
    }
    const charged = Number(charge.charged || 0);
    if (charged > 0) window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
    setDialogInstruction(dialog, `目標語言：${label}${charged > 0 ? `\n已扣除 ${charged} 顆電池。` : ''}\n正在檢查瀏覽器內建整頁翻譯…`);
    dialog.hidden = false;
    const automatic = await tryAutomaticBrowserPageTranslation(code, label, dialog);
    if (!automatic) setDialogInstruction(dialog, `${charged > 0 ? `已扣除 ${charged} 顆電池。\n` : ''}${browserInstruction(label)}`);
  }

  document.addEventListener('click', event => {
    const option = event.target?.closest?.('.v290-option[data-language]');
    if (!option) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void requestBrowserPageTranslation(option);
  }, true);

  function polish() {
    const panel = document.getElementById('v290-transcript-panel');
    if (panel) {
      panel.querySelector('.v290-title')?.remove();
      const translateButton = panel.querySelector('[data-v290-translate]');
      if (!translateButton?.dataset.v296Ready) redrawTranslateButton(translateButton);
      const expand = panel.querySelector('[data-v290-expand]');
      if (expand) { expand.textContent = '放大字幕'; expand.setAttribute('aria-label', '放大字幕'); }
      anchorTranscriptAbovePlayer(panel);
      const line = panel.querySelector('[data-v290-line]');
      guardSubtitleDisplay(line);
      fitTranscriptLine(line);
    }
    moveKeywordsAboveReferences();
    const overlay = document.getElementById('v290-overlay');
    if (overlay) {
      const overlayLine = overlay.querySelector('[data-v290-overlay-line]');
      guardSubtitleDisplay(overlayLine);
      fitOverlayLine(overlayLine);
      const close = overlay.querySelector('[data-v290-overlay-close]');
      if (close) { close.textContent = '✕'; close.setAttribute('aria-label', '關閉放大字幕'); }
    }
  }

  let polishTimer = 0;
  const schedule = () => { clearTimeout(polishTimer); polishTimer = window.setTimeout(polish, 20); };
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('resize', schedule);
  window.setInterval(() => { void paintFloatingOverlay(); }, 150);
  polish();
})();
