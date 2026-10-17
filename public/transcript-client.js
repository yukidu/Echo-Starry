(() => {
  if (window.__starryTranscriptV283) return;
  window.__starryTranscriptV283 = true;

  const MAX_LYRIC_CHARS = 15;
  const FONT_KEY = 'echostars_transcript_font_scale_v1';
  const state = {
    tracks: null,
    trackId: '',
    panel: null,
    timer: 0,
    observerTimer: 0,
    data: null,
    units: [],
    activeIndex: -1,
    fontScale: 1
  };

  try {
    const saved = Number(localStorage.getItem(FONT_KEY));
    if (Number.isFinite(saved)) state.fontScale = Math.min(2.2, Math.max(0.9, saved));
  } catch (_) {}

  const style = document.createElement('style');
  style.textContent =
    '.v283-transcript{margin-top:.65rem;border:1px solid rgba(244,63,94,.18);border-radius:1.5rem;background:rgba(255,255,255,.94);padding:.85rem;box-shadow:0 6px 22px rgba(15,23,42,.06);--v283-current-size:1.45rem;--v283-next-size:1.05rem}'+
    '.dark .v283-transcript{background:rgba(15,23,42,.94);border-color:rgba(148,163,184,.18)}'+
    '.v283-transcript-head{display:flex;align-items:flex-start;justify-content:space-between;gap:.65rem;margin-bottom:.65rem}.v283-transcript-title{font-weight:900;font-size:.92rem;color:#0f172a}.dark .v283-transcript-title{color:#f8fafc}'+
    '.v283-transcript-note{font-size:.68rem;color:#64748b;line-height:1.45;margin-top:.15rem}.dark .v283-transcript-note{color:#94a3b8}'+
    '.v283-font-tools{display:flex;align-items:center;gap:.25rem;flex:0 0 auto}.v283-font-tools button{width:2.25rem;height:2.25rem;border:1px solid rgba(148,163,184,.28);border-radius:.75rem;background:rgba(255,255,255,.86);color:#334155;font-weight:900;font-size:.9rem;cursor:pointer}.dark .v283-font-tools button{background:rgba(30,41,59,.9);color:#f8fafc}.v283-font-percent{min-width:2.7rem;text-align:center;font-size:.68rem;font-weight:800;color:#64748b}.dark .v283-font-percent{color:#94a3b8}'+
    '.v283-transcript-status{padding:.7rem;border-radius:1rem;background:#fff7ed;color:#9a3412;font-size:.8rem;line-height:1.5}.dark .v283-transcript-status{background:rgba(124,45,18,.22);color:#fdba74}'+
    '.v283-transcript-unlock{width:100%;margin-top:.6rem;border:0;border-radius:1rem;padding:.72rem .85rem;background:var(--color-primary,#c06c84);color:white;font-weight:900;cursor:pointer}.v283-transcript-unlock:disabled{opacity:.55;cursor:not-allowed}'+
    '.v283-karaoke-stage{min-height:9.6rem;border-radius:1.25rem;padding:1rem .8rem .8rem;background:linear-gradient(180deg,rgba(255,241,242,.92),rgba(255,255,255,.72));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.8rem;overflow:hidden}.dark .v283-karaoke-stage{background:linear-gradient(180deg,rgba(136,19,55,.22),rgba(15,23,42,.5))}'+
    '.v283-lyric-line{width:100%;border:0;background:transparent;padding:.15rem .25rem;text-align:center;font-family:inherit;cursor:pointer;word-break:keep-all;overflow-wrap:anywhere;transition:transform .16s ease,opacity .16s ease}.v283-lyric-line:disabled{cursor:default}'+
    '.v283-lyric-current{font-size:var(--v283-current-size);font-weight:950;line-height:1.45;letter-spacing:.02em;transform:scale(1.015)}'+
    '.v283-lyric-current .v283-lyric-text{display:inline;background:linear-gradient(90deg,var(--color-primary,#c06c84) 0,var(--color-primary,#c06c84) var(--karaoke-progress,0%),#475569 var(--karaoke-progress,0%),#475569 100%);-webkit-background-clip:text;background-clip:text;color:transparent}.dark .v283-lyric-current .v283-lyric-text{background:linear-gradient(90deg,#f472b6 0,#f472b6 var(--karaoke-progress,0%),#cbd5e1 var(--karaoke-progress,0%),#cbd5e1 100%);-webkit-background-clip:text;background-clip:text;color:transparent}'+
    '.v283-lyric-next{font-size:var(--v283-next-size);font-weight:800;line-height:1.45;color:#94a3b8;opacity:.72}.dark .v283-lyric-next{color:#94a3b8}.v283-lyric-next.is-empty{visibility:hidden}'+
    '.v283-karaoke-meta{display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.5rem .2rem 0;color:#94a3b8;font-size:.68rem;line-height:1.35}.v283-karaoke-time{font:800 .68rem/1.35 ui-monospace,SFMono-Regular,Menlo,monospace;white-space:nowrap}.v283-karaoke-help{text-align:right}'+
    '.v283-editor-host:empty{display:none}.v283-editor-host{margin-top:.55rem}.v283-transcript-editor{border:1px solid #fda4af;border-radius:1rem;padding:.6rem;background:#fff}.dark .v283-transcript-editor{background:#0f172a;border-color:#9f1239}'+
    '.v283-editor-label{font-size:.72rem;font-weight:900;color:#881337;margin-bottom:.35rem}.dark .v283-editor-label{color:#fecdd3}.v283-transcript-editor textarea{width:100%;min-height:4.5rem;resize:vertical;border:1px solid #cbd5e1;border-radius:.7rem;padding:.55rem;background:transparent;color:inherit;font-size:1rem;line-height:1.55}.v283-transcript-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.45rem}.v283-transcript-actions button{border:0;border-radius:.7rem;padding:.42rem .72rem;font-weight:800;cursor:pointer}.v283-transcript-save{background:var(--color-primary,#c06c84);color:#fff}.v283-transcript-cancel{background:#e2e8f0;color:#334155}'+
    '.v283-transcript-toast{margin:.45rem 0;padding:.45rem .6rem;border-radius:.75rem;background:#ecfdf5;color:#047857;font-size:.75rem;font-weight:700}.dark .v283-transcript-toast{background:rgba(6,78,59,.3);color:#6ee7b7}'+
    '@media (max-width:420px){.v283-transcript{padding:.72rem}.v283-karaoke-stage{min-height:9rem;padding:.85rem .45rem}.v283-font-percent{display:none}}';
  document.head.appendChild(style);

  const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0') : m + ':' + String(sec).padStart(2,'0');
  };
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const codepoints = (value) => Array.from(String(value == null ? '' : value));
  const isBreakChar = (ch) => '。！？；，、：.!?;,:\n'.includes(ch);

  function splitSegmentIntoLyrics(seg) {
    const chars = codepoints(seg && seg.text || '');
    if (!chars.length) return [];
    const ranges = [];
    let from = 0;
    while (from < chars.length) {
      let to = Math.min(chars.length, from + MAX_LYRIC_CHARS);
      if (to < chars.length) {
        let preferred = -1;
        for (let i = to - 1; i >= from + 5; i--) {
          if (isBreakChar(chars[i])) { preferred = i + 1; break; }
        }
        if (preferred < 0) {
          for (let i = to - 1; i >= from + 7; i--) {
            if (/\s/.test(chars[i])) { preferred = i + 1; break; }
          }
        }
        if (preferred > from) to = preferred;
      }
      let text = chars.slice(from, to).join('').trim();
      if (!text) { from = to; continue; }
      ranges.push({ from, to, text });
      from = to;
    }

    const start = Number(seg.start || 0);
    const rawEnd = Number(seg.end || start);
    const end = rawEnd > start ? rawEnd : start + Math.max(2, ranges.length * 2);
    const totalWeight = ranges.reduce((sum, item) => sum + Math.max(1, item.to - item.from), 0) || 1;
    let usedWeight = 0;
    return ranges.map((item, index) => {
      const weight = Math.max(1, item.to - item.from);
      const unitStart = start + (end - start) * (usedWeight / totalWeight);
      usedWeight += weight;
      const unitEnd = index === ranges.length - 1 ? end : start + (end - start) * (usedWeight / totalWeight);
      return {
        id: String(seg.id) + ':' + index,
        segmentId: String(seg.id),
        parent: seg,
        from: item.from,
        to: item.to,
        text: item.text,
        start: unitStart,
        end: Math.max(unitStart + 0.05, unitEnd)
      };
    });
  }

  function buildLyricUnits(segments) {
    return (Array.isArray(segments) ? segments : []).flatMap(splitSegmentIntoLyrics);
  }

  function applyFontScale() {
    if (!state.panel) return;
    const scale = Math.min(2.2, Math.max(0.9, Number(state.fontScale) || 1));
    state.fontScale = scale;
    state.panel.style.setProperty('--v283-current-size', (1.45 * scale).toFixed(2) + 'rem');
    state.panel.style.setProperty('--v283-next-size', (1.05 * scale).toFixed(2) + 'rem');
    const label = state.panel.querySelector('[data-v283-font-label]');
    if (label) label.textContent = Math.round(scale * 100) + '%';
    try { localStorage.setItem(FONT_KEY, String(scale)); } catch (_) {}
  }

  function changeFont(delta) {
    state.fontScale = Math.round(Math.min(2.2, Math.max(0.9, state.fontScale + delta)) * 100) / 100;
    applyFontScale();
  }

  async function getTracks() {
    if (state.tracks) return state.tracks;
    try {
      const res = await fetch('/api/tracks', { credentials: 'same-origin', cache: 'no-store' });
      const raw = await res.json();
      state.tracks = Array.isArray(raw) ? raw : (Array.isArray(raw && raw.tracks) ? raw.tracks : (Array.isArray(raw && raw.data) ? raw.data : []));
    } catch { state.tracks = []; }
    return state.tracks;
  }

  async function currentTrack() {
    const timeline = document.getElementById('audio-timeline');
    if (!timeline) return null;
    const root = timeline.closest('.max-w-2xl') || (timeline.parentElement && timeline.parentElement.parentElement) || document.body;
    const h1 = root.querySelector('h1');
    const title = (h1 && h1.textContent || '').trim();
    if (!title) return null;
    const speakerLine = (h1 && h1.nextElementSibling && h1.nextElementSibling.textContent || '').trim();
    const list = await getTracks();
    const exact = list.filter(t => String(t && t.title || '').trim() === title);
    if (exact.length === 1) return exact[0];
    return exact.find(t => speakerLine.includes(String(t && t.speaker || '').trim())) || exact[0] || null;
  }

  function makePanel(timeline) {
    let panel = document.getElementById('v283-transcript-panel');
    if (panel) return panel;
    const oldPanel = document.getElementById('v281-transcript-panel');
    if (oldPanel) oldPanel.remove();
    panel = document.createElement('section');
    panel.id = 'v283-transcript-panel';
    panel.className = 'v283-transcript';
    panel.innerHTML = '<div class="v283-transcript-head"><div><div class="v283-transcript-title">🎤 同步逐字稿</div><div class="v283-transcript-note">KTV 歌詞模式｜一次顯示目前句＋下一句；解鎖會員可點句子修正錯字</div></div><div class="v283-font-tools" aria-label="逐字稿字體大小"><button type="button" data-v283-font-down aria-label="縮小逐字稿">A−</button><span class="v283-font-percent" data-v283-font-label>100%</span><button type="button" data-v283-font-up aria-label="放大逐字稿">A＋</button></div></div><div data-v283-body class="v283-transcript-status">正在確認逐字稿…</div>';
    timeline.insertAdjacentElement('afterend', panel);
    panel.querySelector('[data-v283-font-down]').addEventListener('click', () => changeFont(-0.15));
    panel.querySelector('[data-v283-font-up]').addEventListener('click', () => changeFont(0.15));
    applyFontScale();
    return panel;
  }

  function showMessage(text, buttonText) {
    if (!state.panel) return;
    const body = state.panel.querySelector('[data-v283-body]');
    body.className = 'v283-transcript-status';
    body.innerHTML = '<div>' + escapeHtml(text) + '</div>' + (buttonText ? '<button class="v283-transcript-unlock" data-v283-unlock>' + escapeHtml(buttonText) + '</button>' : '');
  }

  function toast(text) {
    if (!state.panel) return;
    let el = state.panel.querySelector('[data-v283-toast]');
    if (!el) {
      el = document.createElement('div'); el.dataset.v283Toast = '1'; el.className = 'v283-transcript-toast';
      const head = state.panel.querySelector('.v283-transcript-head'); if (head) head.insertAdjacentElement('afterend', el);
    }
    el.textContent = text;
    setTimeout(() => { if (el && el.isConnected) el.remove(); }, 4500);
  }

  function currentPlaybackTime() {
    const slider = document.querySelector('#audio-timeline input[type="range"]');
    return Number(slider && slider.value || 0);
  }

  function findUnitIndex(t) {
    if (!state.units.length) return -1;
    const exact = state.units.findIndex(unit => t >= unit.start && t < unit.end);
    if (exact >= 0) return exact;
    let prior = -1;
    for (let i = 0; i < state.units.length; i++) {
      if (state.units[i].start <= t) prior = i;
      else break;
    }
    return prior >= 0 ? prior : 0;
  }

  function paintLyrics(force = false) {
    if (!state.panel || !state.units.length) return;
    const t = currentPlaybackTime();
    const index = findUnitIndex(t);
    if (index < 0) return;
    const unit = state.units[index];
    const next = state.units[index + 1] || null;
    const currentButton = state.panel.querySelector('[data-v283-current]');
    const nextButton = state.panel.querySelector('[data-v283-next]');
    const time = state.panel.querySelector('[data-v283-time]');
    if (!currentButton || !nextButton) return;

    if (force || state.activeIndex !== index) {
      state.activeIndex = index;
      currentButton.dataset.unitId = unit.id;
      currentButton.querySelector('.v283-lyric-text').textContent = unit.text;
      currentButton.disabled = !(state.data && state.data.canCorrect);
      currentButton.title = state.data && state.data.canCorrect ? '點這一句修正錯字' : '';
      if (next) {
        nextButton.dataset.unitId = next.id;
        nextButton.querySelector('.v283-lyric-text').textContent = next.text;
        nextButton.classList.remove('is-empty');
        nextButton.disabled = !(state.data && state.data.canCorrect);
        nextButton.title = state.data && state.data.canCorrect ? '點下一句也可以修正錯字' : '';
      } else {
        nextButton.dataset.unitId = '';
        nextButton.querySelector('.v283-lyric-text').textContent = ' '; 
        nextButton.classList.add('is-empty');
        nextButton.disabled = true;
      }
      if (time) time.textContent = formatTime(unit.start);
    }

    const span = Math.max(0.05, unit.end - unit.start);
    const progress = Math.max(0, Math.min(1, (t - unit.start) / span));
    currentButton.style.setProperty('--karaoke-progress', (progress * 100).toFixed(1) + '%');
  }

  function openEditorForUnit(unit) {
    if (!state.data || !state.data.canCorrect || !unit || !state.panel) return;
    const host = state.panel.querySelector('[data-v283-editor-host]');
    if (!host) return;
    host.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'v283-transcript-editor';
    box.innerHTML = '<div class="v283-editor-label">修正這一句</div><textarea maxlength="120"></textarea><div class="v283-transcript-actions"><button class="v283-transcript-cancel" type="button">取消</button><button class="v283-transcript-save" type="button">儲存修正</button></div>';
    const textarea = box.querySelector('textarea');
    textarea.value = unit.text || '';
    box.querySelector('.v283-transcript-cancel').onclick = () => { host.innerHTML = ''; };
    box.querySelector('.v283-transcript-save').onclick = async () => {
      const save = box.querySelector('.v283-transcript-save');
      const newPhrase = textarea.value.trim();
      if (!newPhrase || newPhrase === unit.text) { host.innerHTML = ''; return; }
      const parent = unit.parent;
      const parentChars = codepoints(parent.text || '');
      const newText = parentChars.slice(0, unit.from).join('') + newPhrase + parentChars.slice(unit.to).join('');
      save.disabled = true; save.textContent = '儲存中…';
      try {
        const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/segments/' + encodeURIComponent(unit.segmentId), {
          method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ expectedText: parent.text, newText })
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(result.error || '修正失敗');
        parent.text = result.text;
        state.units = buildLyricUnits(state.data.segments);
        state.activeIndex = -1;
        host.innerHTML = '';
        paintLyrics(true);
        toast(result.rewardGranted ? '修正已儲存，獎勵 +' + result.reward + ' 顆電池 🎉' : '修正已儲存。這一句先前已發過修正獎勵，因此不重複發放。');
        window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
      } catch (err) {
        save.disabled = false; save.textContent = '儲存修正';
        toast(err && err.message || '修正失敗');
      }
    };
    host.appendChild(box);
    textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function renderUnlocked(data) {
    const body = state.panel.querySelector('[data-v283-body]');
    state.units = buildLyricUnits(data.segments);
    state.activeIndex = -1;
    if (!state.units.length) { showMessage('逐字稿已完成，但目前沒有可顯示的句子。'); return; }
    body.className = '';
    body.innerHTML = '<div class="v283-karaoke-stage"><button type="button" class="v283-lyric-line v283-lyric-current" data-v283-current><span class="v283-lyric-text"></span></button><button type="button" class="v283-lyric-line v283-lyric-next" data-v283-next><span class="v283-lyric-text"></span></button></div><div class="v283-karaoke-meta"><span class="v283-karaoke-time" data-v283-time>0:00</span><span class="v283-karaoke-help">每句約 15 字｜點句子可修正錯字</span></div><div class="v283-editor-host" data-v283-editor-host></div>';
    const currentButton = body.querySelector('[data-v283-current]');
    const nextButton = body.querySelector('[data-v283-next]');
    currentButton.addEventListener('click', () => {
      const unit = state.units.find(item => item.id === currentButton.dataset.unitId);
      if (unit) openEditorForUnit(unit);
    });
    nextButton.addEventListener('click', () => {
      const unit = state.units.find(item => item.id === nextButton.dataset.unitId);
      if (unit) openEditorForUnit(unit);
    });
    applyFontScale();
    paintLyrics(true);
    startSync();
  }

  function render(data) {
    state.data = data;
    state.units = [];
    state.activeIndex = -1;
    if (!state.panel) return;
    if (!data || data.status === 'missing') { showMessage('這份錄音尚未建立逐字稿。'); return; }
    if (['pending','queued','processing'].includes(data.status)) { showMessage('AI 正在製作逐字稿，完成後會自動出現在這裡。'); return; }
    if (data.status === 'failed') { showMessage('這份逐字稿會自動重新處理，請稍後再試。'); return; }
    if (data.accessDenied) { showMessage(data.error || '目前沒有這份錄音的播放權限，因此不能開啟逐字稿。'); return; }
    if (data.loginRequired) { showMessage('登入會員後，可使用 ' + (data.unlockCost == null ? 1 : data.unlockCost) + ' 顆電池解鎖逐字稿。'); return; }
    if (data.locked) {
      const cost = data.unlockCost == null ? 1 : data.unlockCost;
      showMessage('逐字稿已完成。使用 ' + cost + ' 顆電池即可永久解鎖這份逐字稿。', '🔋 使用 ' + cost + ' 顆電池解鎖');
      const unlockButton = state.panel.querySelector('[data-v283-unlock]');
      if (unlockButton) unlockButton.addEventListener('click', unlock);
      return;
    }
    renderUnlocked(data);
  }

  async function load() {
    const track = await currentTrack();
    const timeline = document.getElementById('audio-timeline');
    if (!track || !timeline) return;
    if (state.trackId === track.id && state.panel && state.panel.isConnected) return;
    state.trackId = track.id;
    state.panel = makePanel(timeline);
    state.data = null;
    showMessage('正在讀取逐字稿…');
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(track.id), { credentials:'same-origin', cache:'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 401 && res.status !== 403) throw new Error(data.error || '讀取失敗');
      render(data);
    } catch (err) {
      showMessage(err && err.message || '逐字稿暫時無法讀取，請稍後再試。');
    }
  }

  async function unlock(event) {
    const btn = event.currentTarget;
    btn.disabled = true; btn.textContent = '解鎖中…';
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/unlock', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '解鎖失敗');
      const previousPanel = state.panel;
      state.trackId = '';
      if (previousPanel) previousPanel.remove();
      state.panel = null;
      await load();
      if (data.charged > 0) toast('已解鎖逐字稿，扣除 ' + data.charged + ' 顆電池');
      window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
    } catch (err) {
      btn.disabled = false; btn.textContent = '重新解鎖';
      toast(err && err.message || '解鎖失敗');
    }
  }

  function startSync() {
    clearInterval(state.timer);
    state.timer = window.setInterval(() => {
      if (!state.panel || !state.panel.isConnected || !state.units.length) return;
      paintLyrics(false);
    }, 160);
  }

  const schedule = () => {
    clearTimeout(state.observerTimer);
    state.observerTimer = window.setTimeout(async () => {
      const timeline = document.getElementById('audio-timeline');
      if (!timeline) {
        state.trackId = '';
        state.units = [];
        state.activeIndex = -1;
        clearInterval(state.timer);
        if (state.panel) state.panel.remove();
        state.panel = null;
        return;
      }
      const track = await currentTrack();
      if (track && track.id !== state.trackId) {
        if (state.panel) state.panel.remove();
        state.panel = null;
        state.trackId = '';
      }
      load();
    }, 250);
  };

  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('popstate', schedule);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();
})();
