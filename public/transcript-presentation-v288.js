(() => {
  if (window.__starryTranscriptPresentationV288) return;
  window.__starryTranscriptPresentationV288 = true;

  const state = {
    trackId: '',
    language: 'zh-Hant',
    data: null,
    segments: [],
    activeIndex: -1,
    timer: 0,
    observerTimer: 0,
    loading: false,
    tracks: null
  };

  const style = document.createElement('style');
  style.textContent =
    '#v283-transcript-panel{order:-1000!important}' +
    '#audio-timeline{order:-999!important}' +
    '.v283-karaoke-stage,.v285-translation-stage{display:none!important}' +
    '.v288-transcript-stage{min-height:9rem;border-radius:1.25rem;padding:1rem .8rem .8rem;background:linear-gradient(180deg,rgba(255,241,242,.92),rgba(255,255,255,.72));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;overflow:hidden}' +
    '.dark .v288-transcript-stage{background:linear-gradient(180deg,rgba(136,19,55,.22),rgba(15,23,42,.5))}' +
    '.v288-transcript-line{width:100%;border:0;background:transparent;padding:.15rem .25rem;text-align:center;font-family:inherit;cursor:pointer;overflow-wrap:anywhere;word-break:break-word}' +
    '.v288-transcript-current{font-size:1.5rem;font-weight:950;line-height:1.45;color:var(--color-primary,#c06c84)}' +
    '.dark .v288-transcript-current{color:#f8fafc}' +
    '.v288-transcript-next{font-size:1.06rem;font-weight:800;line-height:1.45;color:#94a3b8;opacity:.72}' +
    '.v288-transcript-next.is-empty{visibility:hidden}' +
    '.v288-transcript-meta{display:flex;align-items:center;justify-content:flex-start;padding:.5rem .2rem 0;color:#94a3b8;font-size:.68rem;line-height:1.35}' +
    '.v288-transcript-time{font:800 .68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}' +
    '#v284-transcript-overlay>[data-v284-overlay-current],#v284-transcript-overlay>[data-v284-overlay-next],#v284-transcript-overlay>.v285-overlay-translation{display:none!important}' +
    '.v288-overlay-stage{display:flex;flex-direction:column;justify-content:center;gap:.6rem;width:100%}' +
    '.v288-overlay-line{display:block;width:100%;margin:0;text-align:center;color:#fff!important;font-weight:950;line-height:1.18;overflow-wrap:anywhere;word-break:break-word}' +
    '.v288-overlay-current{font-size:clamp(2rem,8vw,5.5rem)}.v288-overlay-next{font-size:clamp(1.4rem,5vw,3.5rem);opacity:.76}' +
    '.v288-editor{border:1px solid #fda4af;border-radius:1rem;padding:.6rem;background:#fff;margin-top:.55rem}.dark .v288-editor{background:#0f172a;border-color:#9f1239}' +
    '.v288-editor-label{font-size:.72rem;font-weight:900;color:#881337;margin-bottom:.35rem}.dark .v288-editor-label{color:#fecdd3}' +
    '.v288-editor textarea{width:100%;min-height:6rem;resize:vertical;border:1px solid #cbd5e1;border-radius:.7rem;padding:.55rem;background:transparent;color:inherit;font-size:1rem;line-height:1.55;box-sizing:border-box}' +
    '.v288-editor-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.45rem}.v288-editor-actions button{border:0;border-radius:.7rem;padding:.42rem .72rem;font-weight:800;cursor:pointer}.v288-save{background:var(--color-primary,#c06c84);color:#fff}.v288-cancel{background:#e2e8f0;color:#334155}' +
    '@media(max-width:420px){.v288-transcript-stage{min-height:8.5rem;padding:.85rem .45rem}.v288-transcript-current{font-size:1.35rem}.v288-transcript-next{font-size:1rem}}';
  document.head.appendChild(style);

  const text = value => value == null ? '' : String(value).trim();
  const formatTime = seconds => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0') : m + ':' + String(sec).padStart(2,'0');
  };

  function playbackTime() {
    const slider = document.querySelector('#audio-timeline input[type="range"]');
    return Number(slider && slider.value || 0);
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

  function arrangeLayout() {
    const timeline = document.getElementById('audio-timeline');
    const panel = document.getElementById('v283-transcript-panel');
    const root = timeline && (timeline.closest('.max-w-2xl') || timeline.parentElement);
    if (!timeline || !panel || !root) return;
    root.classList.add('v284-detail-layout');
    panel.style.setProperty('order', '-1000', 'important');
    timeline.style.setProperty('order', '-999', 'important');
    const keyword = Array.from(root.children).find(child => child !== panel && child !== timeline && text(child.textContent).includes('網友關鍵字'));
    if (keyword) keyword.style.setProperty('order', '-998', 'important');
  }

  function findSegmentIndex(t) {
    if (!state.segments.length) return -1;
    const exact = state.segments.findIndex(seg => t >= Number(seg.start || 0) && t < Number(seg.end || 0));
    if (exact >= 0) return exact;
    let prior = -1;
    for (let i = 0; i < state.segments.length; i++) {
      if (Number(state.segments[i].start || 0) <= t) prior = i; else break;
    }
    return prior >= 0 ? prior : 0;
  }

  function ensureStage() {
    const panel = document.getElementById('v283-transcript-panel');
    const body = panel && panel.querySelector('[data-v283-body]');
    const baseStage = body && body.querySelector('.v283-karaoke-stage');
    if (!panel || !body || !baseStage) return null;
    let stage = body.querySelector('.v288-transcript-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'v288-transcript-stage';
      stage.innerHTML = '<button type="button" class="v288-transcript-line v288-transcript-current" data-v288-current></button><button type="button" class="v288-transcript-line v288-transcript-next" data-v288-next></button>';
      baseStage.insertAdjacentElement('afterend', stage);
      const meta = document.createElement('div');
      meta.className = 'v288-transcript-meta';
      meta.innerHTML = '<span class="v288-transcript-time" data-v288-time>0:00</span>';
      stage.insertAdjacentElement('afterend', meta);
      const oldMeta = body.querySelector('.v283-karaoke-meta');
      if (oldMeta) oldMeta.style.display = 'none';
      stage.querySelector('[data-v288-current]').addEventListener('click', () => openEditor(state.activeIndex));
      stage.querySelector('[data-v288-next]').addEventListener('click', () => openEditor(state.activeIndex + 1));
    }
    return stage;
  }

  function ensureOverlayStage() {
    const overlay = document.getElementById('v284-transcript-overlay');
    if (!overlay) return null;
    let stage = overlay.querySelector('.v288-overlay-stage');
    if (!stage) {
      stage = document.createElement('div');
      stage.className = 'v288-overlay-stage';
      stage.innerHTML = '<div class="v288-overlay-line v288-overlay-current" data-v288-overlay-current></div><div class="v288-overlay-line v288-overlay-next" data-v288-overlay-next></div>';
      overlay.appendChild(stage);
    }
    return stage;
  }

  function paint(force = false) {
    if (!state.segments.length) return;
    const stage = ensureStage();
    if (!stage) return;
    const index = findSegmentIndex(playbackTime());
    if (index < 0) return;
    const current = state.segments[index];
    const next = state.segments[index + 1] || null;
    if (force || state.activeIndex !== index) {
      state.activeIndex = index;
      const c = stage.querySelector('[data-v288-current]');
      const n = stage.querySelector('[data-v288-next]');
      c.textContent = text(current.text);
      c.disabled = !(state.data && state.data.canCorrect);
      c.title = state.data && state.data.canCorrect ? '點這一句修正錯字' : '';
      if (next) {
        n.textContent = text(next.text);
        n.disabled = !(state.data && state.data.canCorrect);
        n.classList.remove('is-empty');
        n.title = state.data && state.data.canCorrect ? '點下一句修正錯字' : '';
      } else {
        n.textContent = ' ';
        n.disabled = true;
        n.classList.add('is-empty');
      }
      const time = stage.parentElement && stage.parentElement.querySelector('[data-v288-time]');
      if (time) time.textContent = formatTime(current.start);
    }

    const overlayStage = ensureOverlayStage();
    if (overlayStage) {
      const oc = overlayStage.querySelector('[data-v288-overlay-current]');
      const on = overlayStage.querySelector('[data-v288-overlay-next]');
      if (oc && oc.textContent !== text(current.text)) oc.textContent = text(current.text);
      if (on && on.textContent !== text(next && next.text)) on.textContent = text(next && next.text);
    }
  }

  function toast(message) {
    const panel = document.getElementById('v283-transcript-panel');
    if (!panel) return;
    let el = panel.querySelector('[data-v288-toast]');
    if (!el) {
      el = document.createElement('div');
      el.dataset.v288Toast = '1';
      el.className = 'v283-transcript-toast';
      panel.querySelector('.v283-transcript-head')?.insertAdjacentElement('afterend', el);
    }
    el.textContent = message;
    setTimeout(() => el && el.isConnected && el.remove(), 4500);
  }

  function openEditor(index) {
    const segment = state.segments[index];
    if (!segment || !(state.data && state.data.canCorrect) || !state.trackId) return;
    const panel = document.getElementById('v283-transcript-panel');
    const host = panel && panel.querySelector('[data-v283-editor-host]');
    if (!host) return;
    host.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'v288-editor';
    box.innerHTML = '<div class="v288-editor-label">修正這一句</div><textarea maxlength="1000"></textarea><div class="v288-editor-actions"><button type="button" class="v288-cancel">取消</button><button type="button" class="v288-save">儲存修正</button></div>';
    const area = box.querySelector('textarea');
    area.value = text(segment.text);
    box.querySelector('.v288-cancel').onclick = () => { host.innerHTML = ''; };
    box.querySelector('.v288-save').onclick = async () => {
      const nextText = area.value.trim();
      if (!nextText || nextText === text(segment.text)) { host.innerHTML = ''; return; }
      const save = box.querySelector('.v288-save');
      save.disabled = true;
      save.textContent = '儲存中…';
      try {
        const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/segments/' + encodeURIComponent(segment.id), {
          method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ expectedText:text(segment.text), newText:nextText })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || '修正失敗');
        segment.text = result.text || nextText;
        host.innerHTML = '';
        paint(true);
        toast(result.rewardGranted ? '修正已儲存，獎勵 +' + result.reward + ' 顆電池 🎉' : '修正已儲存。');
        window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
      } catch (error) {
        save.disabled = false;
        save.textContent = '儲存修正';
        toast(error && error.message || '修正失敗');
      }
    };
    host.appendChild(box);
    area.focus();
  }

  async function loadLanguage(code = 'zh-Hant') {
    if (state.loading) return;
    const track = await currentTrack();
    if (!track || !track.id) return;
    state.loading = true;
    try {
      const url = '/api/v281/transcripts/' + encodeURIComponent(track.id) + (code === 'zh-Hant' ? '' : '?translate=' + encodeURIComponent(code));
      const res = await fetch(url, code === 'zh-Hant'
        ? { credentials:'same-origin', cache:'no-store' }
        : { method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:'{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '逐字稿讀取失敗');
      if (!Array.isArray(data.segments) || data.status !== 'ready' || data.locked) return;
      state.trackId = track.id;
      state.language = code;
      state.data = data;
      state.segments = data.segments.map(seg => ({ id:text(seg.id), start:Number(seg.start || 0), end:Number(seg.end || 0), text:text(seg.text) }));
      state.activeIndex = -1;
      paint(true);
    } catch (error) {
      console.warn('v288 transcript display failed', error);
    } finally {
      state.loading = false;
    }
  }

  function interceptLanguageMenu() {
    document.addEventListener('click', event => {
      const option = event.target && event.target.closest && event.target.closest('.v285-language-option');
      if (!option) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const code = option.dataset.language || 'zh-Hant';
      const menu = option.closest('.v285-language-menu');
      if (menu) menu.hidden = true;
      menu?.querySelectorAll('.v285-language-option').forEach(el => el.classList.toggle('is-active', el === option));
      const button = document.querySelector('[data-v285-translate]');
      if (button) button.textContent = code === 'zh-Hant' ? '翻譯 ▾' : option.textContent + ' ▾';
      void loadLanguage(code);
    }, true);
  }

  async function refresh() {
    arrangeLayout();
    const panel = document.getElementById('v283-transcript-panel');
    const stage = panel && panel.querySelector('.v283-karaoke-stage');
    if (!stage) return;
    const track = await currentTrack();
    if (!track || !track.id) return;
    if (track.id !== state.trackId || !state.segments.length) await loadLanguage('zh-Hant');
    ensureStage();
    paint(false);
  }

  const schedule = () => {
    clearTimeout(state.observerTimer);
    state.observerTimer = setTimeout(() => { void refresh(); }, 80);
  };

  interceptLanguageMenu();
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('popstate', () => {
    state.trackId = '';
    state.segments = [];
    state.activeIndex = -1;
    schedule();
  });
  window.addEventListener('resize', arrangeLayout);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  state.timer = window.setInterval(() => { arrangeLayout(); paint(false); }, 160);
  schedule();
})();