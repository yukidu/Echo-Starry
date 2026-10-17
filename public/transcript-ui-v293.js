(() => {
  if (window.__starryTranscriptUiV295) return;
  window.__starryTranscriptUiV295 = true;

  const TRANSLATE_ICON = `
    <svg class="v293-translate-icon" viewBox="0 0 28 24" aria-hidden="true" focusable="false">
      <rect x="2" y="3" width="15" height="15" rx="4" class="v293-icon-back"></rect>
      <rect x="11" y="7" width="15" height="15" rx="4" class="v293-icon-front"></rect>
      <text x="9.5" y="13.6" text-anchor="middle" class="v293-icon-zh">文</text>
      <text x="18.5" y="18.1" text-anchor="middle" class="v293-icon-en">A</text>
      <path d="M6.2 19.1c2.6 1.7 5.6 2.2 8.7 1.4" class="v293-icon-arrow"></path>
      <path d="M6 19.2l2.9-.2-1.2 2.6" class="v293-icon-arrow"></path>
    </svg>`;
  const DISPLAY_END_PUNCTUATION = new Set(['、','，','！','。',',','!','.']);
  const nativeTextContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  const PAGE_TRANSLATE_SKIP = 'script,style,noscript,textarea,input,select,option,.v293-translate-dialog,[translate="no"],[data-v293-no-page-translate]';
  const pageTranslation = {
    translator: null,
    target: '',
    generation: 0,
    observer: null,
    nodes: new Map(),
    queued: new Set(),
    timer: 0
  };

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
    .v293-translate-icon{width:1.72rem;height:1.48rem;display:block;overflow:visible;flex:none}
    .v293-icon-back{fill:#eef5ff;stroke:#3276d2;stroke-width:1.35}.v293-icon-front{fill:#fff;stroke:#7b61d1;stroke-width:1.35}
    .dark .v293-icon-back{fill:#172554;stroke:#7db5ff}.dark .v293-icon-front{fill:#312e81;stroke:#c4b5fd}
    .v293-icon-zh,.v293-icon-en{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-weight:900;fill:#245da8;font-size:7px;dominant-baseline:middle}
    .v293-icon-en{fill:#6d4bc2;font-size:7.5px}.dark .v293-icon-zh{fill:#bfdbfe}.dark .v293-icon-en{fill:#ddd6fe}
    .v293-icon-arrow{fill:none;stroke:#5f6f86;stroke-width:1.25;stroke-linecap:round;stroke-linejoin:round}.dark .v293-icon-arrow{stroke:#cbd5e1}
    #v290-overlay.v290-overlay{height:8.8rem!important;min-height:8.8rem!important;max-height:8.8rem!important;padding:.55rem 3.35rem .55rem .7rem!important;border-radius:.9rem!important;background:rgba(0,0,0,.48)!important;box-sizing:border-box!important;overflow:hidden!important}
    #v290-overlay .v290-overlay-line{position:absolute!important;left:.7rem!important;right:3.35rem!important;top:50%!important;transform:translateY(-50%)!important;width:auto!important;display:block!important;max-height:calc(100% - 1.1rem)!important;overflow:hidden!important;white-space:normal!important;word-break:break-word!important;overflow-wrap:anywhere!important;text-align:center!important;line-height:1.08!important}
    #v290-overlay .v290-overlay-close{right:.38rem!important;top:50%!important;transform:translateY(-50%)!important;width:2.7rem!important;height:2.7rem!important;font-size:1.85rem!important;line-height:1!important;background:rgba(255,255,255,.18)!important}
    .v293-translate-dialog{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:1rem;background:rgba(15,23,42,.5);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)}
    .v293-translate-dialog[hidden]{display:none!important}.v293-translate-card{width:min(25rem,94vw);border-radius:1.25rem;padding:1.1rem;background:#fff;color:#0f172a;box-shadow:0 24px 80px rgba(15,23,42,.32);font:700 1rem/1.55 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.dark .v293-translate-card{background:#172033;color:#f8fafc}
    .v293-translate-card h3{margin:0 0 .45rem;font-size:1.15rem;font-weight:950}.v293-translate-card p{margin:.35rem 0}.v293-translate-target{font-size:1.1rem;font-weight:950;color:#6d4bc2}.dark .v293-translate-target{color:#ddd6fe}
    .v293-translate-note{font-size:.84rem;opacity:.72}.v293-translate-close{width:100%;margin-top:.75rem;border:0;border-radius:.85rem;padding:.72rem;background:#334155;color:#fff;font-weight:900;cursor:pointer}
    @media(max-width:420px){#v290-transcript-panel .v290-tools{gap:.4rem!important}#v290-transcript-panel .v290-btn{padding:.48rem .6rem!important}#v290-transcript-panel .v290-stage{height:4.4rem!important;min-height:4.4rem!important;max-height:4.4rem!important;padding:.3rem .48rem!important}#v290-overlay.v290-overlay{height:6.6rem!important;min-height:6.6rem!important;max-height:6.6rem!important;padding:.32rem 3.1rem .32rem .55rem!important}#v290-overlay .v290-overlay-line{left:.55rem!important;right:3.1rem!important;max-height:calc(100% - .64rem)!important}#v290-overlay .v290-overlay-close{width:2.5rem!important;height:2.5rem!important;font-size:1.7rem!important}}
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
    if (!element || element.dataset.v294DisplayGuard === '1') return;
    element.dataset.v294DisplayGuard = '1';
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
    button.dataset.v293Ready = '1';
    button.disabled = false;
    button.innerHTML = `${TRANSLATE_ICON}<span>${String(label || 'Translate')}</span><span aria-hidden="true">▾</span>`;
    button.setAttribute('aria-label', 'Translate whole page with browser');
  }

  // 唯一的永久版面規則：逐字稿永遠直接放在播放器前面。
  // 不再搬動播放器、關鍵字或其他 React 區塊，避免重新渲染後位置被蓋回去。
  function anchorTranscriptAbovePlayer(panel) {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline || !panel || !timeline.parentElement) return;
    if (panel.parentElement !== timeline.parentElement || panel.nextElementSibling !== timeline) {
      timeline.insertAdjacentElement('beforebegin', panel);
    }
  }

  function fitTranscriptLine(line) {
    if (!line || !line.isConnected) return;
    const stage = line.closest('.v290-stage');
    if (!stage || stage.clientWidth < 20 || stage.clientHeight < 20) return;
    const computed = getComputedStyle(stage);
    const availableHeight = Math.max(20, stage.clientHeight - parseFloat(computed.paddingTop || '0') - parseFloat(computed.paddingBottom || '0'));
    const maxPx = window.innerWidth <= 420 ? 21.5 : 24.8;
    const minPx = 7.5;
    let size = maxPx;
    line.style.fontSize = `${size}px`;
    line.style.maxHeight = 'none';
    line.style.display = 'block';
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
    const maxPx = window.innerWidth <= 420 ? 42 : 56;
    const minPx = 8;
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
    let dialog = document.getElementById('v293-browser-translate-dialog');
    if (dialog) return dialog;
    dialog = document.createElement('div');
    dialog.id = 'v293-browser-translate-dialog';
    dialog.className = 'v293-translate-dialog';
    dialog.hidden = true;
    dialog.setAttribute('translate', 'no');

    const card = document.createElement('div');
    card.className = 'v293-translate-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const title = document.createElement('h3');
    title.textContent = '🌐 瀏覽器整頁翻譯';
    const instruction = document.createElement('p');
    instruction.dataset.v293Instruction = '1';
    const note = document.createElement('p');
    note.className = 'v293-translate-note';
    note.textContent = '優先使用瀏覽器內建翻譯；不使用繁星回聲的 Cloudflare AI 外語翻譯。';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'v293-translate-close';
    close.textContent = '知道了';
    card.append(title, instruction, note, close);
    dialog.appendChild(card);
    document.body.appendChild(dialog);
    close.onclick = () => { dialog.hidden = true; };
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.hidden = true; });
    return dialog;
  }

  function browserInstruction(label) {
    const safeLabel = String(label || '').trim();
    const ua = navigator.userAgent || '';
    const safari = /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Android/i.test(ua);
    if (safari) return `目標語言：${safeLabel}\nSafari 不允許網站直接按下內建翻譯。請點網址列「頁面選單／aA」→「翻譯網站」→ 選擇這個語言，Safari 會翻譯整頁。`;
    return `目標語言：${safeLabel}\n目前這台瀏覽器不開放網站直接啟動整頁翻譯。請點瀏覽器選單「翻譯」並選擇這個語言，即可翻譯整頁。`;
  }

  function setDialogInstruction(dialog, value) {
    const instruction = dialog.querySelector('[data-v293-instruction]');
    if (instruction) {
      instruction.textContent = String(value || '');
      instruction.style.whiteSpace = 'pre-line';
    }
  }

  function stopAutomaticPageTranslation() {
    pageTranslation.generation += 1;
    pageTranslation.observer?.disconnect();
    pageTranslation.observer = null;
    clearTimeout(pageTranslation.timer);
    pageTranslation.timer = 0;
    pageTranslation.queued.clear();
    for (const [node, saved] of pageTranslation.nodes.entries()) {
      if (node?.isConnected && node.nodeValue === saved.translated) node.nodeValue = saved.original;
    }
    pageTranslation.nodes.clear();
    try { pageTranslation.translator?.destroy?.(); } catch {}
    pageTranslation.translator = null;
    pageTranslation.target = '';
    document.documentElement.lang = 'zh-Hant-TW';
  }

  function shouldTranslateTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE) return false;
    const raw = String(node.nodeValue || '');
    if (!raw.trim() || !/[\p{L}\p{Script=Han}]/u.test(raw)) return false;
    const parent = node.parentElement;
    if (!parent || parent.closest(PAGE_TRANSLATE_SKIP)) return false;
    return true;
  }

  function collectTextNodes(root) {
    const nodes = [];
    if (!root) return nodes;
    if (root.nodeType === Node.TEXT_NODE) return shouldTranslateTextNode(root) ? [root] : [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) if (shouldTranslateTextNode(node)) nodes.push(node);
    return nodes;
  }

  async function translateTextNode(node, translator, generation) {
    if (!shouldTranslateTextNode(node) || generation !== pageTranslation.generation) return;
    const raw = String(node.nodeValue || '');
    const previous = pageTranslation.nodes.get(node);
    if (previous && raw === previous.translated) return;
    const match = raw.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const prefix = match?.[1] || '';
    const core = match?.[2] || '';
    const suffix = match?.[3] || '';
    if (!core.trim()) return;
    try {
      const translatedCore = await translator.translate(core);
      if (generation !== pageTranslation.generation || !node.isConnected) return;
      const translated = `${prefix}${translatedCore}${suffix}`;
      pageTranslation.nodes.set(node, { original: raw, translated });
      node.nodeValue = translated;
    } catch {}
  }

  async function translateNodes(nodes, generation = pageTranslation.generation) {
    const translator = pageTranslation.translator;
    if (!translator || generation !== pageTranslation.generation) return;
    const unique = [...new Set(nodes)].filter(shouldTranslateTextNode);
    for (let index = 0; index < unique.length; index += 6) {
      if (generation !== pageTranslation.generation) return;
      await Promise.all(unique.slice(index, index + 6).map(node => translateTextNode(node, translator, generation)));
    }
  }

  function queueDynamicTranslation(nodes) {
    if (!pageTranslation.translator) return;
    nodes.forEach(node => pageTranslation.queued.add(node));
    clearTimeout(pageTranslation.timer);
    pageTranslation.timer = window.setTimeout(() => {
      const queued = [...pageTranslation.queued];
      pageTranslation.queued.clear();
      void translateNodes(queued);
    }, 80);
  }

  function watchDynamicPageTranslation() {
    pageTranslation.observer?.disconnect();
    pageTranslation.observer = new MutationObserver(records => {
      const nodes = [];
      for (const record of records) {
        if (record.type === 'characterData') nodes.push(record.target);
        for (const added of record.addedNodes || []) nodes.push(...collectTextNodes(added));
      }
      queueDynamicTranslation(nodes);
    });
    pageTranslation.observer.observe(document.body, { childList:true, subtree:true, characterData:true });
  }

  function browserTranslatorTarget(code) {
    if (code === 'zh-Hans') return 'zh';
    return code;
  }

  async function tryAutomaticBrowserPageTranslation(code, label, dialog) {
    const TranslatorApi = globalThis.Translator;
    if (!TranslatorApi?.availability || !TranslatorApi?.create) return false;
    const targetLanguage = browserTranslatorTarget(code);
    try {
      const options = { sourceLanguage: 'zh-Hant', targetLanguage };
      const availability = await TranslatorApi.availability(options);
      if (availability === 'unavailable') return false;
      stopAutomaticPageTranslation();
      const generation = pageTranslation.generation;
      setDialogInstruction(dialog, `目標語言：${label}\n正在啟動瀏覽器內建翻譯，整頁內容會一起翻譯…`);
      dialog.hidden = false;
      const translator = await TranslatorApi.create({
        ...options,
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', event => {
            const percent = Math.max(0, Math.min(100, Math.round(Number(event.loaded || 0) * 100)));
            setDialogInstruction(dialog, `目標語言：${label}\n第一次使用需下載瀏覽器語言包：${percent}%`);
          });
        }
      });
      if (generation !== pageTranslation.generation) {
        try { translator.destroy?.(); } catch {}
        return true;
      }
      pageTranslation.translator = translator;
      pageTranslation.target = targetLanguage;
      document.documentElement.lang = targetLanguage;
      await translateNodes(collectTextNodes(document.body), generation);
      watchDynamicPageTranslation();
      setDialogInstruction(dialog, `目標語言：${label}\n已使用瀏覽器內建功能完成整頁翻譯；後續畫面新出現的文字也會自動翻譯。`);
      return true;
    } catch {
      stopAutomaticPageTranslation();
      return false;
    }
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
      setDialogInstruction(dialog, '已恢復網站原本的繁體中文。若先前是 Safari／Chrome 選單啟動的翻譯，請在瀏覽器選擇「顯示原文」。');
      dialog.hidden = false;
      return;
    }
    document.documentElement.setAttribute('translate', 'yes');
    setDialogInstruction(dialog, `目標語言：${label}\n正在檢查這台瀏覽器能否自動使用內建整頁翻譯…`);
    dialog.hidden = false;
    const automatic = await tryAutomaticBrowserPageTranslation(code, label, dialog);
    if (!automatic) {
      setDialogInstruction(dialog, browserInstruction(label));
      dialog.hidden = false;
    }
  }

  // 捕捉舊翻譯選單事件：不再送 Cloudflare AI 翻譯 API，改成瀏覽器端整頁翻譯。
  document.addEventListener('click', (event) => {
    const option = event.target && event.target.closest ? event.target.closest('.v290-option[data-language]') : null;
    if (!option) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void requestBrowserPageTranslation(option);
  }, true);

  function polish() {
    const panel = document.getElementById('v290-transcript-panel');
    if (panel) {
      const title = panel.querySelector('.v290-title');
      if (title) title.remove();
      const translateButton = panel.querySelector('[data-v290-translate]');
      if (!translateButton?.dataset.v293Ready) redrawTranslateButton(translateButton);
      const expand = panel.querySelector('[data-v290-expand]');
      if (expand) { expand.textContent = '放大'; expand.setAttribute('aria-label', '放大逐字稿'); }
      anchorTranscriptAbovePlayer(panel);
      const line = panel.querySelector('[data-v290-line]');
      guardSubtitleDisplay(line);
      fitTranscriptLine(line);
    }
    const overlay = document.getElementById('v290-overlay');
    if (overlay) {
      const overlayLine = overlay.querySelector('[data-v290-overlay-line]');
      guardSubtitleDisplay(overlayLine);
      fitOverlayLine(overlayLine);
      const close = overlay.querySelector('[data-v290-overlay-close]');
      if (close) { close.textContent = '✕'; close.setAttribute('aria-label', '關閉放大逐字稿'); }
    }
  }

  let timer = 0;
  const schedule = () => { clearTimeout(timer); timer = window.setTimeout(polish, 16); };
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('resize', schedule);
  polish();
})();