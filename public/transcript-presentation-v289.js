(() => {
  if (window.__starryTranscriptPresentationV289) return;
  window.__starryTranscriptPresentationV289 = true;

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
    trackId: '', language: 'zh-Hant', data: null,
    sourceSegments: [], units: [], activeIndex: -1,
    tracks: null, requestId: 0, timer: 0, observerTimer: 0
  };

  const style = document.createElement('style');
  style.textContent =
    '.v288-transcript-stage,.v288-transcript-meta,.v288-overlay-stage{display:none!important}' +
    '[data-v285-translate],.v285-language-menu{display:none!important}' +
    '.v289-stage{min-height:7rem;border-radius:1.25rem;padding:1rem .8rem;background:linear-gradient(180deg,rgba(255,241,242,.92),rgba(255,255,255,.72));display:flex;align-items:center;justify-content:center;overflow:hidden}' +
    '.dark .v289-stage{background:linear-gradient(180deg,rgba(136,19,55,.22),rgba(15,23,42,.5))}' +
    '.v289-line{width:100%;border:0;background:transparent;padding:.2rem .25rem;text-align:center;font-family:inherit;cursor:pointer;overflow-wrap:anywhere;word-break:break-word;font-size:1.55rem;font-weight:950;line-height:1.5;color:var(--color-primary,#c06c84)}' +
    '.dark .v289-line{color:#f8fafc}.v289-line:disabled{cursor:default}' +
    '.v289-meta{display:flex;justify-content:flex-start;padding:.45rem .2rem 0;color:#94a3b8;font-size:.68rem}' +
    '.v289-time{font:800 .68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}' +
    '#v284-transcript-overlay>.v289-overlay-stage{display:flex!important;align-items:center;justify-content:center;width:100%}' +
    '.v289-overlay-line{display:block;width:100%;margin:0;text-align:center;color:#fff!important;font-weight:950;line-height:1.18;overflow-wrap:anywhere;word-break:break-word;font-size:clamp(2rem,8vw,5.5rem)}' +
    '.v289-translate-wrap{position:relative;display:flex;align-items:center;flex:0 0 auto}' +
    '.v289-translate-button{display:inline-flex;align-items:center;gap:.38rem;border:1px solid rgba(148,163,184,.3);border-radius:.85rem;padding:.5rem .65rem;background:rgba(255,255,255,.94);color:#334155;font-size:.78rem;font-weight:900;cursor:pointer;white-space:nowrap}' +
    '.dark .v289-translate-button{background:rgba(30,41,59,.94);color:#f8fafc}.v289-translate-button:disabled{opacity:.62;cursor:wait}' +
    '.v289-translate-icon{position:relative;display:inline-grid;place-items:center;width:1.65rem;height:1.45rem;font:900 .68rem/1 system-ui;letter-spacing:-.08em}' +
    '.v289-translate-icon:before,.v289-translate-icon:after{content:"";position:absolute;width:1.05rem;height:1rem;border:1.5px solid currentColor;border-radius:.22rem;background:inherit}' +
    '.v289-translate-icon:before{left:.05rem;top:.02rem}.v289-translate-icon:after{right:.02rem;bottom:.02rem}' +
    '.v289-translate-icon b,.v289-translate-icon i{position:absolute;z-index:1;font-style:normal;background:rgba(255,255,255,.94);padding:0 .08rem}.dark .v289-translate-icon b,.dark .v289-translate-icon i{background:rgba(30,41,59,.94)}' +
    '.v289-translate-icon b{left:.17rem;top:.2rem}.v289-translate-icon i{right:.12rem;bottom:.16rem}' +
    '.v289-language-menu{position:absolute;right:0;top:calc(100% + .45rem);z-index:2147483646;width:min(15rem,82vw);max-height:19rem;overflow:auto;padding:.35rem;border:1px solid rgba(148,163,184,.3);border-radius:1rem;background:rgba(255,255,255,.99);box-shadow:0 14px 38px rgba(15,23,42,.28)}' +
    '.dark .v289-language-menu{background:rgba(15,23,42,.99)}.v289-language-menu[hidden]{display:none!important}' +
    '.v289-language-option{display:block;width:100%;border:0;border-radius:.7rem;padding:.64rem .72rem;background:transparent;color:#334155;text-align:left;font:800 .88rem/1.25 system-ui;cursor:pointer}' +
    '.v289-language-option:hover,.v289-language-option.is-active{background:#f1f5f9}.dark .v289-language-option{color:#f8fafc}.dark .v289-language-option:hover,.dark .v289-language-option.is-active{background:#1e293b}' +
    '.v289-editor{border:1px solid #fda4af;border-radius:1rem;padding:.6rem;background:#fff;margin-top:.55rem}.dark .v289-editor{background:#0f172a;border-color:#9f1239}' +
    '.v289-editor-label{font-size:.72rem;font-weight:900;color:#881337;margin-bottom:.35rem}.dark .v289-editor-label{color:#fecdd3}' +
    '.v289-editor textarea{width:100%;min-height:5rem;resize:vertical;border:1px solid #cbd5e1;border-radius:.7rem;padding:.55rem;background:transparent;color:inherit;font-size:1rem;line-height:1.55;box-sizing:border-box}' +
    '.v289-editor-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.45rem}.v289-editor-actions button{border:0;border-radius:.7rem;padding:.42rem .72rem;font-weight:800;cursor:pointer}.v289-save{background:var(--color-primary,#c06c84);color:#fff}.v289-cancel{background:#e2e8f0;color:#334155}' +
    '@media(max-width:420px){.v289-stage{min-height:6.7rem;padding:.85rem .45rem}.v289-line{font-size:1.35rem}.v289-translate-button{padding:.47rem .55rem;font-size:.72rem}.v289-translate-icon{transform:scale(.92)}}';
  document.head.appendChild(style);

  const text = value => value == null ? '' : String(value).trim();
  const chars = value => Array.from(String(value == null ? '' : value));
  const buttonHtml = label => '<span class="v289-translate-icon" aria-hidden="true"><b>文</b><i>A</i></span><span>' + label + '</span><span aria-hidden="true">▾</span>';
  const formatTime = seconds => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0') : m + ':' + String(sec).padStart(2,'0');
  };

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
      sourceIndex, segmentId:text(segment.id), from:item.from, to:item.to, text:item.text,
      start:start + (end - start) * item.from / total,
      end:Math.max(start + .05, start + (end - start) * item.to / total)
    }));
  }

  function rebuildUnits() {
    state.units = state.sourceSegments.flatMap((segment, index) => splitSegment(segment, index));
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

  async function getTracks() {
    if (state.tracks) return state.tracks;
    try {
      const res = await fetch('/api/tracks', { credentials:'same-origin', cache:'no-store' });
      const raw = await res.json();
      state.tracks = Array.isArray(raw) ? raw : (raw.tracks || raw.data || []);
    } catch { state.tracks = []; }
    return state.tracks;
  }

  async function currentTrack() {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline) return null;
    const root = timeline.closest('.max-w-2xl') || timeline.parentElement || document.body;
    const h1 = root.querySelector('h1');
    const title = text(h1 && h1.textContent);
    if (!title) return null;
    const speakerLine = text(h1 && h1.nextElementSibling && h1.nextElementSibling.textContent);
    const list = await getTracks();
    const same = list.filter(item => text(item && item.title) === title);
    return same.length === 1 ? same[0] : same.find(item => speakerLine.includes(text(item && item.speaker))) || same[0] || null;
  }

  function ensureStage() {
    const panel = document.getElementById('v283-transcript-panel');
    const body = panel && panel.querySelector('[data-v283-body]');
    if (!panel || !body) return null;
    let stage = body.querySelector('.v289-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'v289-stage';
      stage.innerHTML = '<button type="button" class="v289-line" data-v289-current></button>';
      const anchor = body.querySelector('.v288-transcript-stage') || body.querySelector('.v283-karaoke-stage');
      if (anchor) anchor.insertAdjacentElement('afterend', stage); else body.prepend(stage);
      const meta = document.createElement('div');
      meta.className = 'v289-meta';
      meta.innerHTML = '<span class="v289-time" data-v289-time>0:00</span>';
      stage.insertAdjacentElement('afterend', meta);
      stage.querySelector('[data-v289-current]').addEventListener('click', () => openEditor(state.activeIndex));
    }
    return stage;
  }

  function ensureOverlayStage() {
    const overlay = document.getElementById('v284-transcript-overlay');
    if (!overlay) return null;
    let stage = overlay.querySelector('.v289-overlay-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'v289-overlay-stage';
      stage.innerHTML = '<div class="v289-overlay-line" data-v289-overlay-current></div>';
      overlay.appendChild(stage);
    }
    return stage;
  }

  function paint(force = false) {
    if (!state.units.length) return;
    const stage = ensureStage();
    if (!stage) return;
    const index = activeUnitIndex(playbackTime());
    if (index < 0) return;
    const unit = state.units[index];
    if (force || state.activeIndex !== index) {
      state.activeIndex = index;
      const line = stage.querySelector('[data-v289-current]');
      line.textContent = unit.text;
      const canCorrect = state.language === 'zh-Hant' && Boolean(state.data && state.data.canCorrect);
      line.disabled = !canCorrect;
      line.title = canCorrect ? '點這一句修正錯字' : '';
      const time = stage.parentElement && stage.parentElement.querySelector('[data-v289-time]');
      if (time) time.textContent = formatTime(unit.start);
    }
    const overlay = ensureOverlayStage();
    const overlayLine = overlay && overlay.querySelector('[data-v289-overlay-current]');
    if (overlayLine && overlayLine.textContent !== unit.text) overlayLine.textContent = unit.text;
  }

  function toast(message) {
    const panel = document.getElementById('v283-transcript-panel');
    if (!panel) return;
    let el = panel.querySelector('[data-v289-toast]');
    if (!el) {
      el = document.createElement('div');
      el.dataset.v289Toast = '1';
      el.className = 'v283-transcript-toast';
      panel.querySelector('.v283-transcript-head')?.insertAdjacentElement('afterend', el);
    }
    el.textContent = message;
    setTimeout(() => el && el.isConnected && el.remove(), 4500);
  }

  function openEditor(index) {
    const unit = state.units[index];
    const segment = unit && state.sourceSegments[unit.sourceIndex];
    if (!unit || !segment || state.language !== 'zh-Hant' || !(state.data && state.data.canCorrect) || !state.trackId) return;
    const panel = document.getElementById('v283-transcript-panel');
    const host = panel && panel.querySelector('[data-v283-editor-host]');
    if (!host) return;
    host.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'v289-editor';
    box.innerHTML = '<div class="v289-editor-label">修正這一句</div><textarea maxlength="1000"></textarea><div class="v289-editor-actions"><button type="button" class="v289-cancel">取消</button><button type="button" class="v289-save">儲存修正</button></div>';
    const area = box.querySelector('textarea');
    area.value = unit.text;
    box.querySelector('.v289-cancel').onclick = () => { host.innerHTML = ''; };
    box.querySelector('.v289-save').onclick = async () => {
      const sentence = area.value.trim();
      if (!sentence || sentence === unit.text) { host.innerHTML = ''; return; }
      const oldFull = text(segment.text);
      const sourceChars = chars(oldFull);
      const nextFull = sourceChars.slice(0, unit.from).join('') + sentence + sourceChars.slice(unit.to).join('');
      const save = box.querySelector('.v289-save');
      save.disabled = true; save.textContent = '儲存中…';
      try {
        const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/segments/' + encodeURIComponent(unit.segmentId), {
          method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ expectedText:oldFull, newText:nextFull })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || '修正失敗');
        segment.text = text(result.text || nextFull);
        host.innerHTML = ''; rebuildUnits(); paint(true);
        toast(result.rewardGranted ? '修正已儲存，獎勵 +' + result.reward + ' 顆電池 🎉' : '修正已儲存。');
        window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
      } catch (error) {
        save.disabled = false; save.textContent = '儲存修正';
        toast(error && error.message || '修正失敗');
      }
    };
    host.appendChild(box); area.focus();
  }

  function toolsHost() {
    const panel = document.getElementById('v283-transcript-panel');
    const head = panel && panel.querySelector('.v283-transcript-head');
    if (!head) return null;
    let host = head.querySelector('.v285-transcript-tools');
    if (!host) { host = document.createElement('div'); host.className = 'v285-transcript-tools'; head.appendChild(host); }
    return host;
  }

  function ensureTranslateTools() {
    const host = toolsHost();
    if (!host) return null;
    let wrap = host.querySelector('.v289-translate-wrap');
    if (!wrap) {
      wrap = document.createElement('div'); wrap.className = 'v289-translate-wrap';
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'v289-translate-button'; button.dataset.v289Translate = '1';
      button.innerHTML = buttonHtml('Translate'); button.setAttribute('aria-label','Translate transcript');
      const menu = document.createElement('div'); menu.className = 'v289-language-menu'; menu.hidden = true;
      LANGUAGES.forEach(([code,label]) => {
        const option = document.createElement('button');
        option.type = 'button'; option.className = 'v289-language-option' + (code === state.language ? ' is-active' : '');
        option.dataset.language = code; option.textContent = label;
        option.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation(); menu.hidden = true; void loadLanguage(code, button, menu);
        });
        menu.appendChild(option);
      });
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); menu.hidden = !menu.hidden; });
      wrap.append(button, menu);
      const expand = host.querySelector('[data-v284-expand-transcript]');
      if (expand) host.insertBefore(wrap, expand); else host.prepend(wrap);
    }
    return wrap;
  }

  async function loadLanguage(code = 'zh-Hant', suppliedButton = null, suppliedMenu = null) {
    const track = await currentTrack();
    if (!track || !track.id) return;
    const requestId = ++state.requestId;
    const wrap = ensureTranslateTools();
    const button = suppliedButton || (wrap && wrap.querySelector('[data-v289-translate]'));
    const menu = suppliedMenu || (wrap && wrap.querySelector('.v289-language-menu'));
    if (button) { button.disabled = true; button.innerHTML = buttonHtml(code === 'zh-Hant' ? 'Loading…' : 'Translating…'); }
    try {
      const url = '/api/v281/transcripts/' + encodeURIComponent(track.id) + (code === 'zh-Hant' ? '' : '?translate=' + encodeURIComponent(code));
      const res = await fetch(url, code === 'zh-Hant'
        ? { credentials:'same-origin', cache:'no-store' }
        : { method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:'{}' });
      const data = await res.json().catch(() => ({}));
      if (requestId !== state.requestId) return;
      if (!res.ok) throw new Error(data.error || (code === 'zh-Hant' ? '逐字稿讀取失敗' : '翻譯失敗'));
      if (!Array.isArray(data.segments) || data.status !== 'ready' || data.locked) throw new Error(data.error || '逐字稿尚未可用');
      state.trackId = track.id; state.language = code; state.data = data;
      state.sourceSegments = data.segments.map(seg => ({ id:text(seg.id), start:Number(seg.start || 0), end:Number(seg.end || 0), text:text(seg.text) }));
      rebuildUnits();
      if (menu) menu.querySelectorAll('.v289-language-option').forEach(el => el.classList.toggle('is-active', el.dataset.language === code));
      paint(true);
    } catch (error) {
      if (requestId === state.requestId) toast(error && error.message || '翻譯失敗，請稍後再試');
    } finally {
      if (requestId === state.requestId && button) { button.disabled = false; button.innerHTML = buttonHtml('Translate'); }
    }
  }

  async function refresh() {
    ensureTranslateTools(); ensureStage();
    const track = await currentTrack();
    if (!track || !track.id) return;
    if (track.id !== state.trackId || !state.units.length) await loadLanguage('zh-Hant');
    paint(false);
  }

  const schedule = () => {
    clearTimeout(state.observerTimer);
    state.observerTimer = setTimeout(() => { void refresh(); }, 90);
  };

  document.addEventListener('click', event => {
    if (!event.target.closest('.v289-translate-wrap')) document.querySelectorAll('.v289-language-menu').forEach(menu => { menu.hidden = true; });
  });
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('popstate', () => {
    state.trackId = ''; state.language = 'zh-Hant'; state.data = null; state.sourceSegments = []; state.units = []; state.activeIndex = -1; state.requestId++; schedule();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  state.timer = window.setInterval(() => { paint(false); }, 160);
  schedule();
})();