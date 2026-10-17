(() => {
  if (window.__starryTranscriptPresentationV290) return;
  window.__starryTranscriptPresentationV290 = true;

  const LANGUAGES = [
    ['zh-Hant','繁體中文'],
    ['zh-Hans','简体中文'],
    ['en','English'],
    ['vi','Tiếng Việt'],
    ['id','Bahasa Indonesia'],
    ['yue','廣東話'],
    ['ja','日本語'],
    ['ko','한국어'],
    ['fr','Français'],
    ['hi','हिन्दी'],
    ['es','Español'],
    ['th','ไทย'],
    ['ms','Bahasa Melayu'],
    ['de','Deutsch'],
    ['pt','Português'],
    ['ar','العربية']
  ];
  const BREAKS = new Set(['，','。','！',',','.','!']);
  const state = {
    detailKey: '',
    trackId: '',
    language: 'zh-Hant',
    data: null,
    originalData: null,
    originalSegments: [],
    sourceSegments: [],
    units: [],
    activeIndex: -1,
    tracks: null,
    tracksPromise: null,
    generation: 0,
    sourceController: null,
    translationController: null,
    sourceLoading: false,
    translationSeq: 0,
    translationLanguage: '',
    loadTimer: 0,
    pollTimer: 0,
    observerTimer: 0,
    cache: new Map(),
    overlay: null,
    drag: null,
    longPressTimer: 0,
    overlayMoved: false
  };

  const style = document.createElement('style');
  style.textContent = `
    #v283-transcript-panel.v290-transcript-panel{order:-1000!important;margin-top:.65rem;border:1px solid rgba(244,63,94,.18);border-radius:1.5rem;background:rgba(255,255,255,.94);padding:.78rem;box-shadow:0 6px 22px rgba(15,23,42,.06)}
    .dark #v283-transcript-panel.v290-transcript-panel{background:rgba(15,23,42,.94);border-color:rgba(148,163,184,.18)}
    .v290-detail-layout{display:flex!important;flex-direction:column!important;gap:.625rem!important}.v290-detail-layout>*{margin-top:0!important}
    .v290-controls{display:flex;align-items:center;justify-content:center;gap:.55rem;width:100%;margin:0 auto .62rem;position:relative;z-index:5}
    .v290-translate-wrap{position:relative;display:flex;align-items:center;justify-content:center}
    .v290-control{min-height:2.8rem;border:1px solid rgba(148,163,184,.3);border-radius:.9rem;padding:.55rem .78rem;background:rgba(255,255,255,.95);color:#334155;font-size:.8rem;font-weight:900;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:.4rem;white-space:nowrap;box-shadow:0 3px 10px rgba(15,23,42,.06)}
    .dark .v290-control{background:rgba(30,41,59,.94);color:#f8fafc}.v290-expand{border:0;background:var(--color-primary,#c06c84);color:#fff}.v290-expand:disabled{opacity:.45;cursor:not-allowed}
    .v290-translate-icon{position:relative;display:inline-grid;place-items:center;width:1.65rem;height:1.45rem;font:900 .68rem/1 system-ui;letter-spacing:-.08em}
    .v290-translate-icon:before,.v290-translate-icon:after{content:"";position:absolute;width:1.05rem;height:1rem;border:1.5px solid currentColor;border-radius:.22rem;background:inherit}.v290-translate-icon:before{left:.05rem;top:.02rem}.v290-translate-icon:after{right:.02rem;bottom:.02rem}.v290-translate-icon b,.v290-translate-icon i{position:absolute;z-index:1;font-style:normal;background:rgba(255,255,255,.95);padding:0 .08rem}.dark .v290-translate-icon b,.dark .v290-translate-icon i{background:rgba(30,41,59,.94)}.v290-translate-icon b{left:.17rem;top:.2rem}.v290-translate-icon i{right:.12rem;bottom:.16rem}
    .v290-language-menu{position:absolute;left:50%;transform:translateX(-50%);top:calc(100% + .45rem);z-index:2147483646;width:min(15rem,82vw);max-height:19rem;overflow:auto;padding:.35rem;border:1px solid rgba(148,163,184,.3);border-radius:1rem;background:rgba(255,255,255,.99);box-shadow:0 14px 38px rgba(15,23,42,.28)}.dark .v290-language-menu{background:rgba(15,23,42,.99)}.v290-language-menu[hidden]{display:none!important}
    .v290-language-option{display:block;width:100%;border:0;border-radius:.7rem;padding:.64rem .72rem;background:transparent;color:#334155;text-align:left;font:800 .88rem/1.25 system-ui;cursor:pointer}.v290-language-option:hover,.v290-language-option.is-active{background:#f1f5f9}.dark .v290-language-option{color:#f8fafc}.dark .v290-language-option:hover,.dark .v290-language-option.is-active{background:#1e293b}
    .v290-status{min-height:5.4rem;border-radius:1.15rem;padding:.85rem;display:flex;align-items:center;justify-content:center;text-align:center;background:#fff7ed;color:#9a3412;font-size:.82rem;line-height:1.5}.dark .v290-status{background:rgba(124,45,18,.22);color:#fdba74}.v290-status.is-neutral{background:rgba(241,245,249,.78);color:#64748b}.dark .v290-status.is-neutral{background:rgba(30,41,59,.7);color:#cbd5e1}
    .v290-unlock{width:100%;margin-top:.6rem;border:0;border-radius:1rem;padding:.72rem .85rem;background:var(--color-primary,#c06c84);color:#fff;font-weight:900;cursor:pointer}.v290-unlock:disabled{opacity:.55;cursor:not-allowed}
    .v290-stage{min-height:6.2rem;border-radius:1.2rem;padding:.8rem .65rem;background:linear-gradient(180deg,rgba(255,241,242,.92),rgba(255,255,255,.72));display:flex;align-items:center;justify-content:center;overflow:hidden}.dark .v290-stage{background:linear-gradient(180deg,rgba(136,19,55,.22),rgba(15,23,42,.5))}
    .v290-line{width:100%;border:0;background:transparent;padding:.15rem .2rem;text-align:center;font-family:inherit;cursor:pointer;overflow-wrap:anywhere;word-break:break-word;font-size:1.55rem;font-weight:950;line-height:1.48;color:var(--color-primary,#c06c84)}.dark .v290-line{color:#f8fafc}.v290-line:disabled{cursor:default}
    .v290-meta{display:flex;justify-content:flex-start;padding:.38rem .2rem 0;color:#94a3b8;font-size:.68rem}.v290-time{font:800 .68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}
    .v290-toast{margin:.45rem 0;padding:.48rem .62rem;border-radius:.75rem;background:#ecfdf5;color:#047857;font-size:.75rem;font-weight:800;text-align:center}.dark .v290-toast{background:rgba(6,78,59,.3);color:#6ee7b7}
    .v290-editor{border:1px solid #fda4af;border-radius:1rem;padding:.6rem;background:#fff;margin-top:.55rem}.dark .v290-editor{background:#0f172a;border-color:#9f1239}.v290-editor-label{font-size:.72rem;font-weight:900;color:#881337;margin-bottom:.35rem}.dark .v290-editor-label{color:#fecdd3}.v290-editor textarea{width:100%;min-height:5rem;resize:vertical;border:1px solid #cbd5e1;border-radius:.7rem;padding:.55rem;background:transparent;color:inherit;font-size:1rem;line-height:1.55;box-sizing:border-box}.v290-editor-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.45rem}.v290-editor-actions button{border:0;border-radius:.7rem;padding:.42rem .72rem;font-weight:800;cursor:pointer}.v290-save{background:var(--color-primary,#c06c84);color:#fff}.v290-cancel{background:#e2e8f0;color:#334155}
    #v284-transcript-overlay.v290-overlay{top:auto!important;bottom:var(--v290-overlay-bottom,7rem)!important;left:.45rem!important;right:.45rem!important;z-index:2147483646;min-height:4.8rem!important;max-height:7rem;border-radius:1rem;background:rgba(0,0,0,.18)!important;backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);box-shadow:0 12px 42px rgba(0,0,0,.28);padding:.55rem 3.45rem .55rem .65rem!important;display:flex;align-items:center;justify-content:center;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none}
    #v284-transcript-overlay.v290-overlay.v290-manual-position{right:auto!important;bottom:auto!important}
    .v290-overlay-line{display:block;width:100%;margin:0;text-align:center;white-space:nowrap;overflow:hidden;color:#fff!important;font-weight:950;line-height:1.12;font-size:4.7rem}
    .v290-overlay-close{position:absolute;right:.48rem;top:50%;transform:translateY(-50%);width:2.55rem;height:2.55rem;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:rgba(0,0,0,.18);color:#fff;display:grid;place-items:center;padding:0;font:900 1.65rem/1 system-ui;cursor:pointer}
    .v290-dragging{box-shadow:0 18px 70px rgba(0,0,0,.5)!important;outline:2px solid rgba(255,255,255,.45)}
    @media(max-width:420px){.v290-transcript-panel{padding:.68rem!important}.v290-controls{gap:.4rem}.v290-control{padding:.5rem .62rem;font-size:.74rem;min-height:2.6rem}.v290-stage{min-height:5.8rem;padding:.7rem .42rem}.v290-line{font-size:1.35rem}#v284-transcript-overlay.v290-overlay{left:.32rem!important;right:.32rem!important;min-height:4.4rem!important;padding-right:3.2rem!important}.v290-overlay-close{width:2.35rem;height:2.35rem;font-size:1.5rem}}
  `;
  document.head.appendChild(style);

  const text = value => value == null ? '' : String(value).trim();
  const chars = value => Array.from(String(value == null ? '' : value));
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const formatTime = seconds => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0') : m + ':' + String(sec).padStart(2,'0');
  };
  const translateIcon = () => '<span class="v290-translate-icon" aria-hidden="true"><b>文</b><i>A</i></span><span>Translate</span><span aria-hidden="true">▾</span>';

  function detailContext() {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline) return null;
    const root = timeline.closest('.max-w-2xl') || timeline.parentElement || document.body;
    const h1 = root.querySelector('h1');
    const title = text(h1 && h1.textContent);
    if (!title) return null;
    const speakerLine = text(h1 && h1.nextElementSibling && h1.nextElementSibling.textContent);
    return { timeline, root, title, speakerLine, key:title + '\u241f' + speakerLine };
  }

  async function tracks() {
    if (state.tracks) return state.tracks;
    if (state.tracksPromise) return state.tracksPromise;
    state.tracksPromise = fetch('/api/tracks', { credentials:'same-origin', cache:'no-store' })
      .then(res => res.ok ? res.json() : [])
      .then(raw => {
        state.tracks = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.tracks) ? raw.tracks : (Array.isArray(raw && raw.data) ? raw.data : []));
        return state.tracks;
      })
      .catch(() => { state.tracks = []; return state.tracks; })
      .finally(() => { state.tracksPromise = null; });
    return state.tracksPromise;
  }

  async function resolveTrack(context) {
    const list = await tracks();
    if (!context || detailContext()?.key !== context.key) return null;
    const exact = list.filter(item => text(item && item.title) === context.title);
    if (exact.length === 1) return exact[0];
    return exact.find(item => context.speakerLine.includes(text(item && item.speaker))) || exact[0] || null;
  }

  function makePanel(context) {
    let panel = document.getElementById('v283-transcript-panel');
    if (panel && !panel.classList.contains('v290-transcript-panel')) panel.remove();
    panel = document.getElementById('v283-transcript-panel');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'v283-transcript-panel';
      panel.className = 'v290-transcript-panel';
      panel.innerHTML = '<div class="v290-controls"><div class="v290-translate-wrap"><button type="button" class="v290-control" data-v290-translate aria-haspopup="menu">' + translateIcon() + '</button><div class="v290-language-menu" data-v290-language-menu hidden></div></div><button type="button" class="v290-control v290-expand" data-v290-expand disabled>放大逐字稿</button></div><div data-v290-toast-host></div><div data-v290-body class="v290-status is-neutral">逐字稿載入中…</div><div data-v290-editor-host></div>';
      context.timeline.insertAdjacentElement('beforebegin', panel);
      buildLanguageMenu(panel);
      panel.querySelector('[data-v290-translate]').addEventListener('click', event => {
        event.stopPropagation();
        const menu = panel.querySelector('[data-v290-language-menu]');
        menu.hidden = !menu.hidden;
      });
      panel.querySelector('[data-v290-expand]').addEventListener('click', openOverlay);
    }
    arrangeLayout(context, panel);
    return panel;
  }

  function arrangeLayout(context, panel) {
    if (!context || !panel) return;
    const root = context.root;
    root.classList.add('v290-detail-layout');
    panel.style.setProperty('order','-1000','important');
    context.timeline.style.setProperty('order','-999','important');
    const keyword = Array.from(root.children).find(child => child !== panel && child !== context.timeline && text(child.textContent).includes('網友關鍵字'));
    if (keyword) keyword.style.setProperty('order','-998','important');
  }

  function buildLanguageMenu(panel) {
    const menu = panel.querySelector('[data-v290-language-menu]');
    menu.innerHTML = '';
    LANGUAGES.forEach(([code,label]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'v290-language-option' + (code === state.language ? ' is-active' : '');
      option.dataset.language = code;
      option.textContent = label;
      option.addEventListener('click', event => {
        event.stopPropagation();
        menu.hidden = true;
        void selectLanguage(code);
      });
      menu.appendChild(option);
    });
  }

  function panel() { return document.getElementById('v283-transcript-panel'); }
  function body() { return panel()?.querySelector('[data-v290-body]'); }

  function showStatus(message, neutral = true, action = '') {
    const host = body();
    if (!host) return;
    host.className = 'v290-status' + (neutral ? ' is-neutral' : '');
    host.innerHTML = '<div style="width:100%"><div>' + escapeHtml(message) + '</div>' + (action ? '<button type="button" class="v290-unlock" data-v290-unlock>' + escapeHtml(action) + '</button>' : '') + '</div>';
  }

  function toast(message, duration = 4200) {
    const host = panel()?.querySelector('[data-v290-toast-host]');
    if (!host) return;
    host.innerHTML = '<div class="v290-toast">' + escapeHtml(message) + '</div>';
    window.setTimeout(() => { if (host.isConnected) host.innerHTML = ''; }, duration);
  }

  function playbackTime() {
    const slider = document.querySelector('#audio-timeline input[type="range"]');
    return Number(slider && slider.value || 0);
  }

  function splitSegment(segment, sourceIndex) {
    const sourceChars = chars(segment && segment.text || '');
    if (!sourceChars.length) return [];
    const ranges = [];
    let from = 0;
    const push = to => {
      let a = from, b = to;
      while (a < b && /\s/u.test(sourceChars[a])) a++;
      while (b > a && /\s/u.test(sourceChars[b - 1])) b--;
      if (b > a) ranges.push({ from:a, to:b, text:sourceChars.slice(a,b).join('') });
      from = to;
    };
    for (let i = 0; i < sourceChars.length; i++) if (BREAKS.has(sourceChars[i])) push(i + 1);
    if (from < sourceChars.length) push(sourceChars.length);
    if (!ranges.length) ranges.push({ from:0, to:sourceChars.length, text:sourceChars.join('').trim() });
    const start = Number(segment.start || 0);
    const end = Math.max(start + .2, Number(segment.end || start + 2));
    const total = Math.max(1, sourceChars.length);
    return ranges.filter(item => item.text).map(item => ({
      sourceIndex,
      segmentId:text(segment.id),
      from:item.from,
      to:item.to,
      text:item.text,
      start:start + (end - start) * item.from / total,
      end:Math.max(start + .05, start + (end - start) * item.to / total)
    }));
  }

  function rebuildUnits() {
    state.units = state.sourceSegments.flatMap((segment,index) => splitSegment(segment,index));
    state.activeIndex = -1;
  }

  function activeUnitIndex(t) {
    if (!state.units.length) return -1;
    const exact = state.units.findIndex(unit => t >= unit.start && t < unit.end);
    if (exact >= 0) return exact;
    let prior = -1;
    for (let i = 0; i < state.units.length; i++) {
      if (state.units[i].start <= t) prior = i; else break;
    }
    return prior >= 0 ? prior : 0;
  }

  function renderTranscript() {
    const host = body();
    if (!host || !state.units.length) return;
    host.className = '';
    if (!host.querySelector('.v290-stage')) {
      host.innerHTML = '<div class="v290-stage"><button type="button" class="v290-line" data-v290-current></button></div><div class="v290-meta"><span class="v290-time" data-v290-time>0:00</span></div>';
      host.querySelector('[data-v290-current]').addEventListener('click', () => openEditor(state.activeIndex));
    }
    const expand = panel()?.querySelector('[data-v290-expand]');
    if (expand) expand.disabled = false;
    paint(true);
  }

  function paint(force = false) {
    if (!state.units.length) return;
    const index = activeUnitIndex(playbackTime());
    if (index < 0) return;
    const unit = state.units[index];
    const host = body();
    const line = host && host.querySelector('[data-v290-current]');
    const time = host && host.querySelector('[data-v290-time]');
    if (!line) return;
    if (force || state.activeIndex !== index) {
      state.activeIndex = index;
      line.textContent = unit.text;
      const canCorrect = state.language === 'zh-Hant' && Boolean(state.data && state.data.canCorrect);
      line.disabled = !canCorrect;
      line.title = canCorrect ? '點這一句修正錯字' : '';
      if (time) time.textContent = formatTime(unit.start);
    }
    if (state.overlay && state.overlay.isConnected) {
      const overlayLine = state.overlay.querySelector('[data-v290-overlay-line]');
      if (overlayLine && overlayLine.textContent !== unit.text) {
        overlayLine.textContent = unit.text;
        fitOverlayLine(overlayLine);
      }
    }
  }

  function setLanguageActive(code) {
    panel()?.querySelectorAll('.v290-language-option').forEach(option => option.classList.toggle('is-active', option.dataset.language === code));
  }

  function applyData(trackId, code, data, segments) {
    state.trackId = trackId;
    state.language = code;
    state.data = data;
    state.sourceSegments = segments.map(item => ({ id:text(item.id), start:Number(item.start || 0), end:Number(item.end || 0), text:text(item.text) }));
    if (code === 'zh-Hant') {
      state.originalData = data;
      state.originalSegments = state.sourceSegments.map(item => ({...item}));
    }
    state.cache.set(trackId + '|' + code, { data, segments:state.sourceSegments.map(item => ({...item})) });
    rebuildUnits();
    setLanguageActive(code);
    if (state.units.length) renderTranscript();
    else showStatus('逐字稿已完成，但目前沒有可顯示的句子。');
  }

  function renderResponse(trackId, data) {
    state.data = data;
    const hasSegments = Array.isArray(data && data.segments) && data.segments.length > 0;
    if (hasSegments && !data.locked && !data.accessDenied && !data.loginRequired) {
      applyData(trackId, 'zh-Hant', data, data.segments);
      return;
    }
    const expand = panel()?.querySelector('[data-v290-expand]');
    if (expand) expand.disabled = true;
    if (!data || data.status === 'missing') return showStatus('這份錄音尚未建立逐字稿。');
    if (['pending','queued','processing'].includes(data.status)) return showStatus('AI 正在製作逐字稿，音檔仍可正常播放。');
    if (data.status === 'failed') return showStatus('這份逐字稿會自動重新處理，音檔仍可正常播放。');
    if (data.accessDenied) return showStatus(data.error || '目前沒有這份錄音的播放權限，因此不能開啟逐字稿。', false);
    if (data.loginRequired) return showStatus('登入會員後，可使用 ' + (data.unlockCost == null ? 1 : data.unlockCost) + ' 顆電池解鎖逐字稿。');
    if (data.locked) {
      const cost = data.unlockCost == null ? 1 : data.unlockCost;
      showStatus('逐字稿已完成。使用 ' + cost + ' 顆電池即可永久解鎖這份逐字稿。', true, '🔋 使用 ' + cost + ' 顆電池解鎖');
      const button = panel()?.querySelector('[data-v290-unlock]');
      if (button) button.addEventListener('click', () => void unlockTranscript(trackId, button));
      return;
    }
    showStatus('逐字稿暫時無法顯示，音檔仍可正常播放。');
  }

  async function unlockTranscript(trackId, button) {
    button.disabled = true;
    button.textContent = '解鎖中…';
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(trackId) + '/unlock', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '解鎖失敗');
      state.cache.delete(trackId + '|zh-Hant');
      toast('逐字稿已永久解鎖。');
      await loadOriginal(trackId, state.generation, true);
      window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
    } catch (error) {
      toast(error && error.message || '解鎖失敗');
      button.disabled = false;
      button.textContent = '重新嘗試解鎖';
    }
  }

  function audioNeedsPriority() {
    const audio = document.querySelector('audio');
    return Boolean(audio && !audio.paused && audio.readyState < 3);
  }

  function scheduleOriginal(trackId, generation) {
    clearTimeout(state.loadTimer);
    const started = Date.now();
    const attempt = () => {
      if (generation !== state.generation || trackId !== state.trackId) return;
      if (audioNeedsPriority() && Date.now() - started < 6000) {
        state.loadTimer = window.setTimeout(attempt, 350);
        return;
      }
      void loadOriginal(trackId, generation, false);
    };
    state.loadTimer = window.setTimeout(attempt, 650);
  }

  async function loadOriginal(trackId, generation, force) {
    if (!trackId || generation !== state.generation) return;
    const cached = state.cache.get(trackId + '|zh-Hant');
    if (cached && !force) {
      applyData(trackId, 'zh-Hant', cached.data, cached.segments);
      return;
    }
    if (state.sourceLoading && !force) return;
    state.sourceController?.abort();
    const controller = new AbortController();
    state.sourceController = controller;
    state.sourceLoading = true;
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(trackId), { credentials:'same-origin', cache:'no-store', signal:controller.signal });
      const data = await res.json().catch(() => ({}));
      if (generation !== state.generation || trackId !== state.trackId || controller.signal.aborted) return;
      if (!res.ok && res.status !== 401 && res.status !== 403) throw new Error(data.error || '讀取失敗');
      renderResponse(trackId, data);
    } catch (error) {
      if (controller.signal.aborted || generation !== state.generation) return;
      showStatus((error && error.message) || '逐字稿暫時無法讀取；音檔仍可正常播放。');
    } finally {
      if (state.sourceController === controller) state.sourceController = null;
      if (generation === state.generation) state.sourceLoading = false;
    }
  }

  async function selectLanguage(code) {
    if (!state.trackId) return;
    if (code === 'zh-Hant') {
      state.translationSeq++;
      state.translationController?.abort();
      state.translationController = null;
      const cached = state.cache.get(state.trackId + '|zh-Hant');
      if (cached) applyData(state.trackId, 'zh-Hant', cached.data, cached.segments);
      else await loadOriginal(state.trackId, state.generation, false);
      return;
    }
    if (!state.originalSegments.length) {
      toast('原始逐字稿尚未載入完成，音檔可以先繼續播放。');
      return;
    }
    const cacheKey = state.trackId + '|' + code;
    const cached = state.cache.get(cacheKey);
    if (cached) {
      applyData(state.trackId, code, cached.data, cached.segments);
      return;
    }
    if (state.translationLanguage === code && state.translationController) {
      toast('翻譯仍在背景處理，音檔不會中斷。');
      return;
    }
    state.translationController?.abort();
    const controller = new AbortController();
    state.translationController = controller;
    state.translationLanguage = code;
    const seq = ++state.translationSeq;
    const expectedTrack = state.trackId;
    const expectedGeneration = state.generation;
    const label = LANGUAGES.find(item => item[0] === code)?.[1] || code;
    toast('正在翻譯成 ' + label + '，音檔會繼續播放。', 5000);
    window.setTimeout(() => {
      if (seq === state.translationSeq && state.translationController === controller && !controller.signal.aborted) toast('翻譯仍在背景處理，完成後會自動顯示。', 5000);
    }, 8000);
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(expectedTrack) + '?translate=' + encodeURIComponent(code), {
        method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:'{}', signal:controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (controller.signal.aborted || seq !== state.translationSeq || expectedGeneration !== state.generation || expectedTrack !== state.trackId) return;
      if (!res.ok) throw new Error(data.error || '翻譯失敗');
      if (!Array.isArray(data.segments) || !data.segments.length) throw new Error('翻譯結果暫時無法顯示');
      applyData(expectedTrack, code, { ...state.originalData, ...data, canCorrect:false }, data.segments);
      toast('翻譯完成：' + label);
    } catch (error) {
      if (controller.signal.aborted || seq !== state.translationSeq) return;
      toast((error && error.message) || '翻譯暫時失敗，請稍後再試。', 5200);
    } finally {
      if (state.translationController === controller) {
        state.translationController = null;
        state.translationLanguage = '';
      }
    }
  }

  function openEditor(index) {
    const unit = state.units[index];
    const segment = unit && state.sourceSegments[unit.sourceIndex];
    if (!unit || !segment || state.language !== 'zh-Hant' || !(state.data && state.data.canCorrect) || !state.trackId) return;
    const host = panel()?.querySelector('[data-v290-editor-host]');
    if (!host) return;
    host.innerHTML = '<div class="v290-editor"><div class="v290-editor-label">修正這一句</div><textarea maxlength="1000"></textarea><div class="v290-editor-actions"><button type="button" class="v290-cancel">取消</button><button type="button" class="v290-save">儲存修正</button></div></div>';
    const area = host.querySelector('textarea');
    area.value = unit.text;
    host.querySelector('.v290-cancel').onclick = () => { host.innerHTML = ''; };
    host.querySelector('.v290-save').onclick = async () => {
      const sentence = area.value.trim();
      if (!sentence || sentence === unit.text) { host.innerHTML = ''; return; }
      const oldFull = text(segment.text);
      const sourceChars = chars(oldFull);
      const nextFull = sourceChars.slice(0, unit.from).join('') + sentence + sourceChars.slice(unit.to).join('');
      const save = host.querySelector('.v290-save');
      save.disabled = true; save.textContent = '儲存中…';
      try {
        const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/segments/' + encodeURIComponent(segment.id), {
          method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ expectedText:oldFull, newText:nextFull })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || '修正失敗');
        segment.text = result.text || nextFull;
        state.originalSegments = state.sourceSegments.map(item => ({...item}));
        state.cache.set(state.trackId + '|zh-Hant', { data:state.data, segments:state.originalSegments.map(item => ({...item})) });
        Array.from(state.cache.keys()).forEach(key => { if (key.startsWith(state.trackId + '|') && key !== state.trackId + '|zh-Hant') state.cache.delete(key); });
        rebuildUnits();
        host.innerHTML = '';
        renderTranscript();
        toast(result.rewardGranted ? '修正已儲存，獎勵 +' + result.reward + ' 顆電池 🎉' : '修正已儲存。');
        window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
      } catch (error) {
        save.disabled = false; save.textContent = '儲存修正';
        toast(error && error.message || '修正失敗');
      }
    };
    area.focus();
  }

  function miniPlayer() { return document.querySelector('[data-echostars-media-session="1"]'); }

  function setDefaultOverlayPosition() {
    if (!state.overlay || state.overlayMoved) return;
    const mini = miniPlayer();
    const gap = 9;
    const bottom = mini ? Math.max(10, window.innerHeight - mini.getBoundingClientRect().top + gap) : 92;
    state.overlay.style.setProperty('--v290-overlay-bottom', bottom + 'px');
  }

  function fitOverlayLine(line) {
    if (!line || !line.isConnected) return;
    window.requestAnimationFrame(() => {
      let size = Math.min(76, Math.max(34, window.innerWidth * .105));
      line.style.fontSize = size + 'px';
      while (size > 20 && line.scrollWidth > line.clientWidth) {
        size -= 2;
        line.style.fontSize = size + 'px';
      }
    });
  }

  function closeOverlay() {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = 0;
    if (state.overlay) state.overlay.remove();
    state.overlay = null;
    state.drag = null;
    state.overlayMoved = false;
  }

  function openOverlay() {
    if (!state.units.length) return;
    closeOverlay();
    const overlay = document.createElement('section');
    overlay.id = 'v284-transcript-overlay';
    overlay.className = 'v290-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-label','放大逐字稿');
    overlay.innerHTML = '<button type="button" class="v290-overlay-close" data-v284-overlay-close data-v290-overlay-close aria-label="關閉放大逐字稿">✕</button><div class="v290-overlay-line" data-v290-overlay-line></div>';
    document.body.appendChild(overlay);
    state.overlay = overlay;
    overlay.querySelector('[data-v290-overlay-close]').addEventListener('click', closeOverlay);
    attachOverlayDrag(overlay);
    setDefaultOverlayPosition();
    paint(true);
    fitOverlayLine(overlay.querySelector('[data-v290-overlay-line]'));
  }

  function clearLongPress() { clearTimeout(state.longPressTimer); state.longPressTimer = 0; }

  function attachOverlayDrag(overlay) {
    overlay.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-v290-overlay-close]')) return;
      clearLongPress();
      const rect = overlay.getBoundingClientRect();
      state.drag = { pointerId:event.pointerId, startX:event.clientX, startY:event.clientY, left:rect.left, top:rect.top, active:false };
      state.longPressTimer = window.setTimeout(() => {
        if (!state.drag || state.drag.pointerId !== event.pointerId) return;
        state.drag.active = true;
        state.overlayMoved = true;
        overlay.classList.add('v290-manual-position','v290-dragging');
        overlay.style.left = rect.left + 'px'; overlay.style.top = rect.top + 'px'; overlay.style.width = rect.width + 'px'; overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
        try { overlay.setPointerCapture(event.pointerId); } catch (_) {}
        if (navigator.vibrate) navigator.vibrate(20);
      }, 420);
    });
    overlay.addEventListener('pointermove', event => {
      const drag = state.drag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (!drag.active) {
        if (Math.abs(event.clientX - drag.startX) > 8 || Math.abs(event.clientY - drag.startY) > 8) clearLongPress();
        return;
      }
      event.preventDefault();
      const rect = overlay.getBoundingClientRect();
      const left = Math.max(5, Math.min(window.innerWidth - rect.width - 5, drag.left + event.clientX - drag.startX));
      const top = Math.max(5, Math.min(window.innerHeight - rect.height - 5, drag.top + event.clientY - drag.startY));
      overlay.style.left = left + 'px'; overlay.style.top = top + 'px';
    });
    const end = event => {
      clearLongPress();
      if (state.drag && state.drag.active) overlay.classList.remove('v290-dragging');
      state.drag = null;
      try { overlay.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    overlay.addEventListener('pointerup', end);
    overlay.addEventListener('pointercancel', end);
  }

  function resetForDetail(context) {
    state.generation++;
    state.sourceController?.abort();
    state.translationController?.abort();
    state.sourceController = null;
    state.translationController = null;
    state.sourceLoading = false;
    state.translationLanguage = '';
    state.translationSeq++;
    clearTimeout(state.loadTimer);
    closeOverlay();
    state.detailKey = context ? context.key : '';
    state.trackId = '';
    state.language = 'zh-Hant';
    state.data = null;
    state.originalData = null;
    state.originalSegments = [];
    state.sourceSegments = [];
    state.units = [];
    state.activeIndex = -1;
    const host = body();
    if (host) showStatus('逐字稿載入中…');
    const expand = panel()?.querySelector('[data-v290-expand]');
    if (expand) expand.disabled = true;
  }

  async function refresh() {
    const context = detailContext();
    if (!context) {
      if (state.detailKey) resetForDetail(null);
      panel()?.remove();
      return;
    }
    const transcriptPanel = makePanel(context);
    arrangeLayout(context, transcriptPanel);
    if (context.key !== state.detailKey) resetForDetail(context);
    const generation = state.generation;
    const track = await resolveTrack(context);
    if (!track || generation !== state.generation || detailContext()?.key !== context.key) return;
    if (state.trackId !== track.id) {
      state.trackId = track.id;
      state.language = 'zh-Hant';
      state.data = null;
      state.originalData = null;
      state.originalSegments = [];
      state.sourceSegments = [];
      state.units = [];
      state.activeIndex = -1;
      const cached = state.cache.get(track.id + '|zh-Hant');
      if (cached) applyData(track.id, 'zh-Hant', cached.data, cached.segments);
      else scheduleOriginal(track.id, generation);
    }
  }

  const schedule = () => {
    clearTimeout(state.observerTimer);
    state.observerTimer = window.setTimeout(() => { void refresh(); }, 160);
  };

  document.addEventListener('click', event => {
    if (!event.target.closest('.v290-translate-wrap')) panel()?.querySelector('[data-v290-language-menu]')?.setAttribute('hidden','');
  });
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('popstate', () => { resetForDetail(null); schedule(); });
  window.addEventListener('resize', () => { setDefaultOverlayPosition(); if (state.overlay) fitOverlayLine(state.overlay.querySelector('[data-v290-overlay-line]')); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  state.pollTimer = window.setInterval(() => { paint(false); const context = detailContext(); if ((context && context.key !== state.detailKey) || (!context && state.detailKey)) schedule(); }, 180);
  schedule();
})();