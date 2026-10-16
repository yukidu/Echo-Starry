(() => {
  if (window.__starryTranscriptV281) return;
  window.__starryTranscriptV281 = true;
  const state = { tracks: null, trackId: '', panel: null, timer: 0, observerTimer: 0, data: null };
  const style = document.createElement('style');
  style.textContent = '.v281-transcript{margin-top:.65rem;border:1px solid rgba(244,63,94,.18);border-radius:1.5rem;background:rgba(255,255,255,.92);padding:.8rem;box-shadow:0 6px 22px rgba(15,23,42,.06)}'+
    '.dark .v281-transcript{background:rgba(15,23,42,.92);border-color:rgba(148,163,184,.18)}'+
    '.v281-transcript-head{display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-bottom:.55rem}.v281-transcript-title{font-weight:900;font-size:.9rem;color:#0f172a}.dark .v281-transcript-title{color:#f8fafc}'+
    '.v281-transcript-note{font-size:.68rem;color:#64748b}.dark .v281-transcript-note{color:#94a3b8}.v281-transcript-status{padding:.65rem;border-radius:1rem;background:#fff7ed;color:#9a3412;font-size:.78rem;line-height:1.45}.dark .v281-transcript-status{background:rgba(124,45,18,.22);color:#fdba74}'+
    '.v281-transcript-unlock{width:100%;margin-top:.55rem;border:0;border-radius:1rem;padding:.7rem .8rem;background:var(--color-primary,#c06c84);color:white;font-weight:900;cursor:pointer}.v281-transcript-unlock:disabled{opacity:.55;cursor:not-allowed}'+
    '.v281-transcript-list{max-height:48vh;overflow:auto;display:flex;flex-direction:column;gap:.3rem;scroll-behavior:smooth;padding-right:.1rem}.v281-transcript-seg{width:100%;display:grid;grid-template-columns:3.6rem 1fr;gap:.45rem;text-align:left;border:1px solid transparent;border-radius:.9rem;padding:.48rem .55rem;background:transparent;color:#334155;cursor:pointer}.dark .v281-transcript-seg{color:#cbd5e1}'+
    '.v281-transcript-seg:hover{background:#fff1f2}.dark .v281-transcript-seg:hover{background:rgba(136,19,55,.2)}.v281-transcript-seg.is-current{background:#fff1f2;border-color:#fda4af;color:#881337}.dark .v281-transcript-seg.is-current{background:rgba(136,19,55,.28);border-color:#9f1239;color:#fecdd3}'+
    '.v281-transcript-time{font:700 .67rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#94a3b8;white-space:nowrap}.v281-transcript-text{font-size:.82rem;line-height:1.55;white-space:pre-wrap;word-break:break-word}.v281-transcript-editor{border:1px solid #fda4af;border-radius:1rem;padding:.55rem;background:#fff}.dark .v281-transcript-editor{background:#0f172a;border-color:#9f1239}'+
    '.v281-transcript-editor textarea{width:100%;min-height:5rem;resize:vertical;border:1px solid #cbd5e1;border-radius:.7rem;padding:.5rem;background:transparent;color:inherit;font-size:.85rem;line-height:1.5}.v281-transcript-actions{display:flex;gap:.4rem;justify-content:flex-end;margin-top:.4rem}.v281-transcript-actions button{border:0;border-radius:.7rem;padding:.4rem .7rem;font-weight:800;cursor:pointer}.v281-transcript-save{background:var(--color-primary,#c06c84);color:#fff}.v281-transcript-cancel{background:#e2e8f0;color:#334155}'+
    '.v281-transcript-toast{margin:.45rem 0;padding:.45rem .6rem;border-radius:.75rem;background:#ecfdf5;color:#047857;font-size:.75rem;font-weight:700}.dark .v281-transcript-toast{background:rgba(6,78,59,.3);color:#6ee7b7}';
  document.head.appendChild(style);

  const formatTime = (seconds) => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? h + ':' + String(m).padStart(2,'0') + ':' + String(sec).padStart(2,'0') : m + ':' + String(sec).padStart(2,'0');
  };
  const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));

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
    let panel = document.getElementById('v281-transcript-panel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'v281-transcript-panel';
    panel.className = 'v281-transcript';
    panel.innerHTML = '<div class="v281-transcript-head"><div><div class="v281-transcript-title">📝 同步逐字稿</div><div class="v281-transcript-note">播放時會自動標示目前這一句；解鎖會員可點句子修正錯字</div></div></div><div data-v281-body class="v281-transcript-status">正在確認逐字稿…</div>';
    timeline.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function showMessage(text, buttonText) {
    if (!state.panel) return;
    const body = state.panel.querySelector('[data-v281-body]');
    body.className = 'v281-transcript-status';
    body.innerHTML = '<div>' + escapeHtml(text) + '</div>' + (buttonText ? '<button class="v281-transcript-unlock" data-v281-unlock>' + escapeHtml(buttonText) + '</button>' : '');
  }

  function toast(text) {
    if (!state.panel) return;
    let el = state.panel.querySelector('[data-v281-toast]');
    if (!el) {
      el = document.createElement('div'); el.dataset.v281Toast = '1'; el.className = 'v281-transcript-toast';
      const head = state.panel.querySelector('.v281-transcript-head'); if (head) head.insertAdjacentElement('afterend', el);
    }
    el.textContent = text;
    setTimeout(() => { if (el && el.isConnected) el.remove(); }, 4500);
  }

  function render(data) {
    state.data = data;
    if (!state.panel) return;
    const body = state.panel.querySelector('[data-v281-body]');
    if (!data || data.status === 'missing') { showMessage('這份錄音尚未建立逐字稿。'); return; }
    if (['pending','queued','processing'].includes(data.status)) { showMessage('AI 正在製作逐字稿，完成後會自動出現在這裡。'); return; }
    if (data.status === 'failed') { showMessage('這份逐字稿會自動重新處理，請稍後再試。'); return; }
    if (data.accessDenied) { showMessage(data.error || '目前沒有這份錄音的播放權限，因此不能開啟逐字稿。'); return; }
    if (data.loginRequired) { showMessage('登入會員後，可使用 ' + (data.unlockCost == null ? 1 : data.unlockCost) + ' 顆電池解鎖逐字稿。'); return; }
    if (data.locked) {
      const cost = data.unlockCost == null ? 1 : data.unlockCost;
      showMessage('逐字稿已完成。使用 ' + cost + ' 顆電池即可永久解鎖這份逐字稿。', '🔋 使用 ' + cost + ' 顆電池解鎖');
      const unlockButton = state.panel.querySelector('[data-v281-unlock]'); if (unlockButton) unlockButton.addEventListener('click', unlock);
      return;
    }
    const segments = Array.isArray(data.segments) ? data.segments : [];
    body.className = 'v281-transcript-list'; body.innerHTML = '';
    for (const seg of segments) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'v281-transcript-seg'; btn.dataset.segmentId = seg.id; btn.dataset.start = String(seg.start || 0); btn.dataset.end = String(seg.end || 0);
      btn.innerHTML = '<span class="v281-transcript-time">' + formatTime(seg.start) + '</span><span class="v281-transcript-text"></span>';
      btn.querySelector('.v281-transcript-text').textContent = seg.text || '';
      if (data.canCorrect) btn.title = '發現錯字？點這一句可立即修正；首次有效修正可獲得 ' + (data.correctionReward == null ? 0.1 : data.correctionReward) + ' 顆電池';
      btn.addEventListener('click', () => { if (data.canCorrect) editSegment(btn, seg); });
      body.appendChild(btn);
    }
    if (!segments.length) showMessage('逐字稿已完成，但目前沒有可顯示的句子。');
    startSync();
  }

  async function load() {
    const track = await currentTrack(); const timeline = document.getElementById('audio-timeline');
    if (!track || !timeline) return;
    if (state.trackId === track.id && state.panel && state.panel.isConnected) return;
    state.trackId = track.id; state.panel = makePanel(timeline); state.data = null; showMessage('正在讀取逐字稿…');
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(track.id), { credentials:'same-origin', cache:'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok && res.status !== 401 && res.status !== 403) throw new Error(data.error || '讀取失敗');
      render(data);
    } catch (err) { showMessage(err && err.message || '逐字稿暫時無法讀取，請稍後再試。'); }
  }

  async function unlock(event) {
    const btn = event.currentTarget; btn.disabled = true; btn.textContent = '解鎖中…';
    try {
      const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/unlock', { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:'{}' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '解鎖失敗');
      const previousPanel = state.panel; state.trackId = ''; if (previousPanel) previousPanel.remove(); state.panel = null; await load();
      if (data.charged > 0) toast('已解鎖逐字稿，扣除 ' + data.charged + ' 顆電池');
      window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
    } catch (err) { btn.disabled = false; btn.textContent = '重新解鎖'; toast(err && err.message || '解鎖失敗'); }
  }

  function editSegment(button, seg) {
    if (button.nextElementSibling && button.nextElementSibling.classList.contains('v281-transcript-editor')) return;
    const box = document.createElement('div'); box.className = 'v281-transcript-editor';
    box.innerHTML = '<textarea></textarea><div class="v281-transcript-actions"><button class="v281-transcript-cancel" type="button">取消</button><button class="v281-transcript-save" type="button">儲存修正</button></div>';
    const textarea = box.querySelector('textarea'); textarea.value = seg.text || '';
    box.querySelector('.v281-transcript-cancel').onclick = () => box.remove();
    box.querySelector('.v281-transcript-save').onclick = async () => {
      const save = box.querySelector('.v281-transcript-save'); const newText = textarea.value.trim();
      if (!newText || newText === seg.text) { box.remove(); return; }
      save.disabled = true; save.textContent = '儲存中…';
      try {
        const res = await fetch('/api/v281/transcripts/' + encodeURIComponent(state.trackId) + '/segments/' + encodeURIComponent(seg.id), {
          method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ expectedText: seg.text, newText })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '修正失敗');
        seg.text = data.text; button.querySelector('.v281-transcript-text').textContent = data.text; box.remove();
        toast(data.rewardGranted ? '修正已儲存，獎勵 +' + data.reward + ' 顆電池 🎉' : '修正已儲存。這一句先前已發過修正獎勵，因此不重複發放。');
        window.dispatchEvent(new CustomEvent('echostars:battery-changed'));
      } catch (err) { save.disabled = false; save.textContent = '儲存修正'; toast(err && err.message || '修正失敗'); }
    };
    button.insertAdjacentElement('afterend', box); textarea.focus(); textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  function startSync() {
    clearInterval(state.timer); let last = '';
    state.timer = window.setInterval(() => {
      if (!state.panel || !state.panel.isConnected) return;
      const slider = document.querySelector('#audio-timeline input[type="range"]'); const t = Number(slider && slider.value || 0);
      const nodes = Array.from(state.panel.querySelectorAll('.v281-transcript-seg'));
      const current = nodes.find(n => t >= Number(n.dataset.start || 0) && t < Number(n.dataset.end || 0));
      if (!current || current.dataset.segmentId === last) return;
      nodes.forEach(n => n.classList.toggle('is-current', n === current)); last = current.dataset.segmentId || '';
      current.scrollIntoView({block:'nearest',behavior:'smooth'});
    }, 350);
  }

  const schedule = () => {
    clearTimeout(state.observerTimer);
    state.observerTimer = window.setTimeout(async () => {
      const timeline = document.getElementById('audio-timeline');
      if (!timeline) { state.trackId = ''; if (state.panel) state.panel.remove(); state.panel = null; return; }
      const track = await currentTrack();
      if (track && track.id !== state.trackId) { if (state.panel) state.panel.remove(); state.panel = null; state.trackId = ''; }
      load();
    }, 250);
  };
  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true, characterData:true });
  window.addEventListener('popstate', schedule); document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  schedule();
})();
