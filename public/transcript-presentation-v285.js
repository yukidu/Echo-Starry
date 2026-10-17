(() => {
  if (window.__starryTranscriptPresentationV285) return;
  window.__starryTranscriptPresentationV285 = true;

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
  const MAX_CHARS = 15;
  const state = {
    tracks: null,
    trackId: '',
    language: 'zh-Hant',
    segments: null,
    units: [],
    translateTimer: 0,
    observerTimer: 0,
    overlayMoved: false,
    drag: null,
    longPressTimer: 0
  };

  const style = document.createElement('style');
  style.textContent =
    '.v284-transcript-overlay{top:auto!important;bottom:var(--v285-overlay-bottom,7rem)!important;background:rgba(0,0,0,.36)!important;backdrop-filter:blur(8px)!important;-webkit-backdrop-filter:blur(8px)!important;touch-action:none;user-select:none;-webkit-user-select:none}' +
    '.v284-transcript-overlay.v285-manual-position{right:auto!important;bottom:auto!important}' +
    '.v285-transcript-tools{margin-left:auto;display:flex;align-items:center;gap:.4rem;flex:0 0 auto;position:relative}' +
    '.v285-translate-button{border:1px solid rgba(148,163,184,.3);border-radius:.85rem;padding:.58rem .75rem;background:rgba(255,255,255,.9);color:#334155;font-size:.78rem;font-weight:900;cursor:pointer;white-space:nowrap}.dark .v285-translate-button{background:rgba(30,41,59,.92);color:#f8fafc}' +
    '.v285-language-menu{position:absolute;right:0;top:calc(100% + .4rem);z-index:2147483645;width:min(15rem,80vw);max-height:19rem;overflow:auto;padding:.35rem;border:1px solid rgba(148,163,184,.3);border-radius:1rem;background:rgba(255,255,255,.98);box-shadow:0 14px 38px rgba(15,23,42,.22)}.dark .v285-language-menu{background:rgba(15,23,42,.98)}' +
    '.v285-language-menu[hidden]{display:none!important}.v285-language-option{display:block;width:100%;border:0;border-radius:.7rem;padding:.62rem .7rem;background:transparent;color:#334155;text-align:left;font:800 .86rem/1.25 system-ui;cursor:pointer}.v285-language-option:hover,.v285-language-option.is-active{background:#f1f5f9}.dark .v285-language-option{color:#f8fafc}.dark .v285-language-option:hover,.dark .v285-language-option.is-active{background:#1e293b}' +
    '.v285-translation-stage{display:none;width:100%;min-height:9rem;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;padding:1rem .5rem;text-align:center}.v285-translation-active .v283-lyric-line{display:none!important}.v285-translation-active .v285-translation-stage{display:flex}' +
    '.v285-translation-current{font-size:1.5rem;font-weight:950;line-height:1.45;color:var(--color-primary,#c06c84)}.dark .v285-translation-current{color:#f8fafc}.v285-translation-next{font-size:1.06rem;font-weight:800;line-height:1.45;color:#94a3b8;opacity:.72}' +
    '.v285-overlay-translation{display:none;flex-direction:column;justify-content:center;gap:.55rem;width:100%}.v285-overlay-translation-active>[data-v284-overlay-current],.v285-overlay-translation-active>[data-v284-overlay-next]{display:none!important}.v285-overlay-translation-active>.v285-overlay-translation{display:flex}' +
    '.v285-overlay-line{display:block;width:100%;margin:0;text-align:center;white-space:nowrap;overflow:hidden;color:#fff!important;font-weight:950;line-height:1.2}.v285-overlay-current{font-size:5rem}.v285-overlay-next{font-size:3.5rem;opacity:.76}' +
    '.v285-dragging{box-shadow:0 18px 70px rgba(0,0,0,.55)!important;outline:2px solid rgba(255,255,255,.45)}' +
    '@media(max-width:420px){.v285-translate-button{padding:.54rem .62rem;font-size:.74rem}.v285-transcript-tools{gap:.3rem}}';
  document.head.appendChild(style);

  const codepoints = value => Array.from(String(value == null ? '' : value));
  const isBreakChar = ch => '。！？；，、：.!?;,、:\n '.includes(ch);

  function splitSegment(seg) {
    const chars = codepoints(seg && seg.text || '');
    if (!chars.length) return [];
    const ranges = [];
    let from = 0;
    while (from < chars.length) {
      let to = Math.min(chars.length, from + MAX_CHARS);
      if (to < chars.length) {
        let preferred = -1;
        for (let i = to - 1; i >= from + 5; i--) {
          if (isBreakChar(chars[i])) { preferred = i + 1; break; }
        }
        if (preferred > from) to = preferred;
      }
      const value = chars.slice(from, to).join('').trim();
      if (value) ranges.push({ from, to, text: value });
      from = to;
    }
    const start = Number(seg.start || 0);
    const end = Math.max(start + .2, Number(seg.end || start + 2));
    const total = ranges.reduce((sum, item) => sum + Math.max(1, item.to - item.from), 0) || 1;
    let used = 0;
    return ranges.map((item, index) => {
      const weight = Math.max(1, item.to - item.from);
      const unitStart = start + (end - start) * used / total;
      used += weight;
      const unitEnd = index === ranges.length - 1 ? end : start + (end - start) * used / total;
      return { text: item.text, start: unitStart, end: Math.max(unitStart + .05, unitEnd) };
    });
  }

  function buildUnits(segments) {
    return (Array.isArray(segments) ? segments : []).flatMap(splitSegment);
  }

  function currentTime() {
    const slider = document.querySelector('#audio-timeline input[type="range"]');
    return Number(slider && slider.value || 0);
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

  function fitLine(el, maxPx, minPx) {
    if (!el || !el.isConnected) return;
    let size = maxPx;
    el.style.fontSize = size + 'px';
    while (size > minPx && el.scrollWidth > el.clientWidth) {
      size -= 2;
      el.style.fontSize = size + 'px';
    }
  }

  function ensureTranslationStage() {
    const stage = document.querySelector('#v283-transcript-panel .v283-karaoke-stage');
    if (!stage) return null;
    let translated = stage.querySelector('.v285-translation-stage');
    if (!translated) {
      translated = document.createElement('div');
      translated.className = 'v285-translation-stage';
      translated.innerHTML = '<div class="v285-translation-current" data-v285-current></div><div class="v285-translation-next" data-v285-next></div>';
      stage.appendChild(translated);
    }
    return stage;
  }

  function ensureOverlayTranslation(overlay) {
    if (!overlay) return null;
    let box = overlay.querySelector('.v285-overlay-translation');
    if (!box) {
      box = document.createElement('div');
      box.className = 'v285-overlay-translation';
      box.innerHTML = '<div class="v285-overlay-line v285-overlay-current" data-v285-overlay-current></div><div class="v285-overlay-line v285-overlay-next" data-v285-overlay-next></div>';
      overlay.appendChild(box);
    }
    return box;
  }

  function paintTranslation() {
    if (state.language === 'zh-Hant' || !state.units.length) return;
    const stage = ensureTranslationStage();
    if (!stage) return;
    stage.classList.add('v285-translation-active');
    const index = activeUnitIndex(currentTime());
    if (index < 0) return;
    const current = state.units[index]?.text || '';
    const next = state.units[index + 1]?.text || '';
    const currentEl = stage.querySelector('[data-v285-current]');
    const nextEl = stage.querySelector('[data-v285-next]');
    if (currentEl && currentEl.textContent !== current) currentEl.textContent = current;
    if (nextEl && nextEl.textContent !== next) nextEl.textContent = next;

    const overlay = document.getElementById('v284-transcript-overlay');
    if (overlay) {
      ensureOverlayTranslation(overlay);
      overlay.classList.add('v285-overlay-translation-active');
      const oc = overlay.querySelector('[data-v285-overlay-current]');
      const on = overlay.querySelector('[data-v285-overlay-next]');
      if (oc && oc.textContent !== current) oc.textContent = current;
      if (on && on.textContent !== next) on.textContent = next;
      requestAnimationFrame(() => {
        fitLine(oc, 96, 24);
        fitLine(on, 72, 20);
      });
    }
  }

  function restoreOriginalDisplay() {
    document.querySelector('#v283-transcript-panel .v283-karaoke-stage')?.classList.remove('v285-translation-active');
    document.getElementById('v284-transcript-overlay')?.classList.remove('v285-overlay-translation-active');
    state.segments = null;
    state.units = [];
    state.language = 'zh-Hant';
  }

  async function tracks() {
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
    const root = timeline && (timeline.closest('.max-w-2xl') || timeline.parentElement);
    const h1 = root && root.querySelector('h1');
    const title = (h1 && h1.textContent || '').trim();
    if (!title) return null;
    const speakerLine = (h1?.nextElementSibling?.textContent || '').trim();
    const list = await tracks();
    const same = list.filter(item => String(item?.title || '').trim() === title);
    return same.length === 1 ? same[0] : same.find(item => speakerLine.includes(String(item?.speaker || '').trim())) || same[0] || null;
  }

  async function selectLanguage(code, button, menu) {
    menu.hidden = true;
    if (code === 'zh-Hant') {
      restoreOriginalDisplay();
      button.textContent = '翻譯 ▾';
      return;
    }
    const track = await currentTrack();
    if (!track?.id) return;
    const label = LANGUAGES.find(item => item[0] === code)?.[1] || code;
    const old = button.textContent;
    button.disabled = true;
    button.textContent = '翻譯中…';
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(track.id) + '?translate=' + encodeURIComponent(code), {
        method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:'{}'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '翻譯失敗');
      state.trackId = track.id;
      state.language = code;
      state.segments = Array.isArray(data.segments) ? data.segments : [];
      state.units = buildUnits(state.segments);
      button.textContent = '翻譯 ▾';
      menu.querySelectorAll('.v285-language-option').forEach(el => el.classList.toggle('is-active', el.dataset.language === code));
      paintTranslation();
    } catch (error) {
      button.textContent = old || '翻譯 ▾';
      alert(error?.message || '翻譯失敗，請稍後再試');
    } finally {
      button.disabled = false;
    }
  }

  function ensureTranslateButton() {
    const panel = document.getElementById('v283-transcript-panel');
    const head = panel?.querySelector('.v283-transcript-head');
    const expand = head?.querySelector('[data-v284-expand-transcript]');
    if (!panel || !head || !expand || head.querySelector('[data-v285-translate]')) return;
    const tools = document.createElement('div');
    tools.className = 'v285-transcript-tools';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v285-translate-button';
    button.dataset.v285Translate = '1';
    button.textContent = '翻譯 ▾';
    const menu = document.createElement('div');
    menu.className = 'v285-language-menu';
    menu.hidden = true;
    LANGUAGES.forEach(([code,label]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.className = 'v285-language-option' + (code === state.language ? ' is-active' : '');
      option.dataset.language = code;
      option.textContent = label;
      option.addEventListener('click', event => { event.stopPropagation(); void selectLanguage(code, button, menu); });
      menu.appendChild(option);
    });
    button.addEventListener('click', event => { event.stopPropagation(); menu.hidden = !menu.hidden; });
    tools.append(button, menu);
    head.insertBefore(tools, expand);
    tools.appendChild(expand);
  }

  function miniPlayer() {
    return document.querySelector('[data-echostars-media-session="1"]');
  }

  function setDefaultOverlayPosition() {
    const overlay = document.getElementById('v284-transcript-overlay');
    if (!overlay || state.overlayMoved) return;
    const mini = miniPlayer();
    const gap = 10;
    const bottom = mini ? Math.max(10, window.innerHeight - mini.getBoundingClientRect().top + gap) : 92;
    overlay.style.setProperty('--v285-overlay-bottom', bottom + 'px');
  }

  function clearLongPress() {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = 0;
  }

  function attachOverlayDrag() {
    const overlay = document.getElementById('v284-transcript-overlay');
    if (!overlay || overlay.dataset.v285DragReady === '1') return;
    overlay.dataset.v285DragReady = '1';
    setDefaultOverlayPosition();
    overlay.addEventListener('pointerdown', event => {
      if (event.target.closest('[data-v284-overlay-close]')) return;
      clearLongPress();
      const rect = overlay.getBoundingClientRect();
      const startX = event.clientX, startY = event.clientY;
      state.drag = { pointerId:event.pointerId, startX, startY, left:rect.left, top:rect.top, active:false };
      state.longPressTimer = window.setTimeout(() => {
        if (!state.drag || state.drag.pointerId !== event.pointerId) return;
        state.drag.active = true;
        state.overlayMoved = true;
        overlay.classList.add('v285-manual-position','v285-dragging');
        overlay.style.left = rect.left + 'px';
        overlay.style.top = rect.top + 'px';
        overlay.style.width = rect.width + 'px';
        overlay.style.right = 'auto';
        overlay.style.bottom = 'auto';
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
      const left = Math.max(6, Math.min(window.innerWidth - rect.width - 6, drag.left + event.clientX - drag.startX));
      const top = Math.max(6, Math.min(window.innerHeight - rect.height - 6, drag.top + event.clientY - drag.startY));
      overlay.style.left = left + 'px';
      overlay.style.top = top + 'px';
    });
    const end = event => {
      clearLongPress();
      if (state.drag?.active) overlay.classList.remove('v285-dragging');
      state.drag = null;
      try { overlay.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    overlay.addEventListener('pointerup', end);
    overlay.addEventListener('pointercancel', end);
  }

  function refresh() {
    ensureTranslateButton();
    attachOverlayDrag();
    setDefaultOverlayPosition();
    if (state.language !== 'zh-Hant') paintTranslation();
  }

  clearInterval(state.translateTimer);
  state.translateTimer = window.setInterval(refresh, 80);
  new MutationObserver(() => {
    clearTimeout(state.observerTimer);
    state.observerTimer = window.setTimeout(refresh, 40);
  }).observe(document.body, { childList:true, subtree:true });
  window.addEventListener('resize', () => { if (!state.overlayMoved) setDefaultOverlayPosition(); });
  window.addEventListener('popstate', () => { restoreOriginalDisplay(); state.trackId=''; state.overlayMoved=false; });
  document.addEventListener('click', event => {
    if (!event.target.closest('.v285-transcript-tools')) document.querySelectorAll('.v285-language-menu').forEach(menu => { menu.hidden = true; });
  });
  refresh();
})();