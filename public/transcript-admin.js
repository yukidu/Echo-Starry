(() => {
  if (window.__starryTranscriptAdminV281) return;
  window.__starryTranscriptAdminV281 = true;

  const state = { authorized: null, loading: false, active: false, view: 'pending', data: [], pendingCount: 0, root: null, panel: null, timer: 0 };
  const style = document.createElement('style');
  style.textContent = `
    .v281-transcript-admin-tab{position:relative;border:0;border-bottom:2px solid transparent;background:transparent;padding:0 8px 8px;font-size:12px;font-weight:800;color:#64748b;white-space:nowrap;cursor:pointer}
    .v281-transcript-admin-tab.is-active{border-bottom-color:#f43f5e;color:#e11d48}.dark .v281-transcript-admin-tab{color:#94a3b8}.dark .v281-transcript-admin-tab.is-active{color:#fb7185}
    .v281-transcript-badge{display:inline-flex;min-width:18px;height:18px;margin-left:4px;padding:0 5px;align-items:center;justify-content:center;border-radius:999px;background:#ef4444;color:#fff;font-size:10px;line-height:1;font-weight:900}
    .v281-admin-panel{display:flex;flex-direction:column;gap:10px}.v281-admin-toolbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;border:1px solid #fecdd3;border-radius:18px;background:#fff7ed}.dark .v281-admin-toolbar{background:#111827;border-color:#4c0519}
    .v281-admin-filter{display:flex;gap:6px}.v281-admin-filter button{border:1px solid #e2e8f0;border-radius:999px;background:#fff;padding:6px 10px;font-size:11px;font-weight:800;color:#475569;cursor:pointer}.dark .v281-admin-filter button{background:#0f172a;border-color:#334155;color:#cbd5e1}.v281-admin-filter button.is-active{background:#e11d48;border-color:#e11d48;color:#fff}
    .v281-admin-card{padding:12px;border:1px solid #e2e8f0;border-radius:18px;background:#fff;box-shadow:0 2px 10px rgba(15,23,42,.04)}.dark .v281-admin-card{background:#0f172a;border-color:#334155;color:#e2e8f0}
    .v281-admin-card.is-pending{border-color:#fda4af;background:#fff8f8}.dark .v281-admin-card.is-pending{background:#1f1116;border-color:#881337}
    .v281-admin-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.v281-admin-name{font-size:13px;font-weight:900;color:#0f172a}.dark .v281-admin-name{color:#f8fafc}.v281-admin-meta{font-size:10px;color:#94a3b8;margin-top:2px;line-height:1.45}.v281-admin-status{font-size:10px;font-weight:900;padding:4px 7px;border-radius:999px;background:#f1f5f9;color:#475569;white-space:nowrap}.dark .v281-admin-status{background:#1e293b;color:#cbd5e1}.v281-admin-status.pending{background:#ffe4e6;color:#be123c}.dark .v281-admin-status.pending{background:#4c0519;color:#fda4af}
    .v281-admin-track{margin-top:8px;padding:8px 9px;border-radius:12px;background:#f8fafc;font-size:11px;color:#475569}.dark .v281-admin-track{background:#111827;color:#cbd5e1}.v281-admin-time{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:900;color:#e11d48}
    .v281-admin-diff{display:grid;grid-template-columns:1fr;gap:6px;margin-top:8px}.v281-admin-text{border-radius:12px;padding:8px 9px;font-size:12px;line-height:1.55;word-break:break-word}.v281-admin-before{background:#f8fafc;color:#64748b}.dark .v281-admin-before{background:#111827;color:#94a3b8}.v281-admin-after{background:#ecfdf5;color:#065f46}.dark .v281-admin-after{background:#052e2b;color:#a7f3d0}.v281-admin-final{background:#eff6ff;color:#1e3a8a}.dark .v281-admin-final{background:#172554;color:#bfdbfe}.v281-admin-label{display:block;font-size:9px;font-weight:900;letter-spacing:.04em;margin-bottom:3px;opacity:.8}
    .v281-admin-reward{margin-top:7px;font-size:10px;font-weight:800;color:#b45309}.dark .v281-admin-reward{color:#fbbf24}.v281-admin-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.v281-admin-actions button{border:0;border-radius:10px;padding:7px 9px;font-size:11px;font-weight:900;cursor:pointer}.v281-play{background:#e0f2fe;color:#0369a1}.v281-accept{background:#dcfce7;color:#166534}.v281-supplement{background:#fef3c7;color:#92400e}.v281-revoke{background:#fee2e2;color:#b91c1c}.v281-admin-actions button:disabled{opacity:.5;cursor:not-allowed}
    .v281-supplement-box{margin-top:8px;padding:9px;border:1px solid #fde68a;border-radius:12px;background:#fffbeb}.dark .v281-supplement-box{background:#2b2110;border-color:#854d0e}.v281-supplement-box textarea{width:100%;box-sizing:border-box;min-height:74px;border:1px solid #fbbf24;border-radius:10px;padding:8px;background:#fff;color:#0f172a;font-size:12px;line-height:1.5;resize:vertical}.dark .v281-supplement-box textarea{background:#0f172a;color:#f8fafc;border-color:#a16207}
    .v281-admin-empty{padding:34px 16px;text-align:center;border:1px dashed #cbd5e1;border-radius:18px;color:#94a3b8;font-size:12px}.v281-admin-toast{position:fixed;left:50%;bottom:92px;transform:translateX(-50%);z-index:9999;max-width:min(90vw,420px);padding:10px 14px;border-radius:999px;background:#0f172a;color:#fff;font-size:12px;font-weight:800;box-shadow:0 10px 30px rgba(15,23,42,.25)}
  `;
  document.head.appendChild(style);

  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const formatTime = seconds => {
    const s = Math.max(0, Math.floor(Number(seconds) || 0)), h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}` : `${m}:${String(sec).padStart(2,'0')}`;
  };
  const formatDate = value => {
    const d = new Date(Number(value) || value || 0); if (Number.isNaN(d.getTime())) return '近期';
    return d.toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  };
  const toast = message => {
    const el = document.createElement('div'); el.className = 'v281-admin-toast'; el.textContent = message; document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };
  const statusLabel = item => {
    if (item.status === 'pending_review') return ['已立即生效・待管理員檢視','pending'];
    if (item.status === 'accepted') return ['已接受',''];
    if (item.status === 'supplemented') return ['管理員已補充修正',''];
    if (item.status === 'revoked') return ['已撤銷',''];
    return [item.status || '已處理',''];
  };

  function findNotificationsRoot() {
    const heading = Array.from(document.querySelectorAll('h2')).find(el => (el.textContent || '').includes('繁星動態通知與獎銜審核'));
    if (!heading) return null;
    let node = heading.parentElement;
    while (node && node !== document.body) {
      if (node.classList.contains('space-y-3') && node.classList.contains('max-w-2xl')) return node;
      node = node.parentElement;
    }
    return null;
  }

  function nativeTabScroller(root) {
    const first = root.firstElementChild;
    if (!first) return null;
    return first.querySelector('.overflow-x-auto') || Array.from(first.querySelectorAll('div')).find(el => Array.from(el.children).some(child => child.tagName === 'BUTTON')) || null;
  }

  async function loadData(force = false) {
    if (state.loading) return;
    if (state.authorized === false && !force) return;
    state.loading = true;
    try {
      const res = await fetch('/api/v281/transcript-corrections?view=' + (state.view === 'pending' ? 'pending' : 'all'), { credentials:'same-origin', cache:'no-store' });
      if (res.status === 401 || res.status === 403) { state.authorized = false; state.active = false; return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '讀取逐字稿修正通知失敗');
      state.authorized = true; state.data = Array.isArray(data.corrections) ? data.corrections : []; state.pendingCount = Number(data.pendingCount || 0);
      render();
    } catch (error) {
      if (state.panel) state.panel.innerHTML = `<div class="v281-admin-empty">${escapeHtml(error && error.message || '讀取失敗')}</div>`;
    } finally { state.loading = false; }
  }

  function installTab(root) {
    if (state.authorized !== true) return;
    const scroller = nativeTabScroller(root); if (!scroller) return;
    let button = scroller.querySelector('[data-v281-transcript-admin-tab]');
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.className = 'v281-transcript-admin-tab'; button.dataset.v281TranscriptAdminTab = '1';
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); state.active = true; applyView(root); void loadData(true); });
      scroller.appendChild(button);
    }
    button.classList.toggle('is-active', state.active);
    button.innerHTML = `逐字稿${state.pendingCount > 0 ? `<span class="v281-transcript-badge">${Math.min(99,state.pendingCount)}${state.pendingCount>99?'+':''}</span>` : ''}`;
    Array.from(scroller.querySelectorAll('button')).forEach(native => {
      if (native === button || native.dataset.v281NativeTranscriptHook === '1') return;
      native.dataset.v281NativeTranscriptHook = '1';
      native.addEventListener('click', () => { if (state.active) { state.active = false; applyView(root); } }, true);
    });
  }

  function applyView(root) {
    state.root = root;
    const header = root.firstElementChild;
    Array.from(root.children).forEach(child => {
      if (child === header || child === state.panel) return;
      if (state.active) { child.dataset.v281TranscriptHidden = '1'; child.style.display = 'none'; }
      else if (child.dataset.v281TranscriptHidden === '1') { delete child.dataset.v281TranscriptHidden; child.style.removeProperty('display'); }
    });
    if (state.panel) state.panel.style.display = state.active ? '' : 'none';
    installTab(root);
  }

  function render() {
    const root = findNotificationsRoot();
    if (!root || state.authorized !== true) return;
    state.root = root;
    let panel = root.querySelector('[data-v281-transcript-admin-panel]');
    if (!panel) {
      panel = document.createElement('div'); panel.dataset.v281TranscriptAdminPanel = '1'; panel.className = 'v281-admin-panel'; root.appendChild(panel);
      panel.addEventListener('click', handlePanelClick);
    }
    state.panel = panel;
    const cards = state.data.map(item => {
      const [label, statusClass] = statusLabel(item);
      const finalDiff = item.status === 'supplemented' && item.finalText && item.finalText !== item.after
        ? `<div class="v281-admin-text v281-admin-final"><span class="v281-admin-label">超級管理員補充後</span>${escapeHtml(item.finalText)}</div>` : '';
      const rewardText = item.rewardGranted
        ? (item.rewardRevoked ? `原獎勵 ${item.reward} 顆電池已扣回` : `已立即獎勵 +${item.reward} 顆電池`)
        : '這位會員在同一句已領過修正獎勵，本次不重複發放';
      return `<article class="v281-admin-card ${item.status === 'pending_review' ? 'is-pending' : ''}" data-correction-id="${escapeHtml(item.id)}">
        <div class="v281-admin-head"><div><div class="v281-admin-name">${escapeHtml(item.userName || item.userId)}</div><div class="v281-admin-meta">${formatDate(item.createdAt)}${item.isCurrentVersion ? '・目前有效版本' : '・後面已有更新版本'}</div></div><span class="v281-admin-status ${statusClass}">${escapeHtml(label)}</span></div>
        <div class="v281-admin-track">🎧 ${escapeHtml(item.trackSpeaker || '')}${escapeHtml(item.trackSpeakerRank || '')}・${escapeHtml(item.trackTitle || item.trackId)}<br><span class="v281-admin-time">${formatTime(item.start)} → ${formatTime(item.end)}</span></div>
        <div class="v281-admin-diff"><div class="v281-admin-text v281-admin-before"><span class="v281-admin-label">修正前</span>${escapeHtml(item.before)}</div><div class="v281-admin-text v281-admin-after"><span class="v281-admin-label">會員修正後</span>${escapeHtml(item.after)}</div>${finalDiff}</div>
        <div class="v281-admin-reward">🔋 ${escapeHtml(rewardText)}</div>
        <div class="v281-admin-actions">
          <button class="v281-play" data-action="play" data-track="${escapeHtml(item.trackId)}" data-start="${Number(item.start)||0}" data-end="${Number(item.end)||0}">▶ 播放此段</button>
          ${item.status === 'pending_review' ? `<button class="v281-accept" data-action="accept">✓ 接受修正</button><button class="v281-supplement" data-action="supplement-open">✎ 補充修正</button><button class="v281-revoke" data-action="revoke">↶ 撤銷修正</button>` : ''}
        </div>
        <div class="v281-supplement-box" data-supplement-box hidden><textarea>${escapeHtml(item.finalText || item.after)}</textarea><div class="v281-admin-actions"><button class="v281-accept" data-action="supplement-save">儲存補充修正</button><button data-action="supplement-cancel">取消</button></div></div>
      </article>`;
    }).join('');
    panel.innerHTML = `<div class="v281-admin-toolbar"><div><strong style="font-size:13px">📝 逐字稿修正通知</strong><div style="font-size:10px;color:#94a3b8;margin-top:2px">會員修正已立即生效；你可在這裡接受、補充或撤銷。</div></div><div class="v281-admin-filter"><button data-filter="pending" class="${state.view==='pending'?'is-active':''}">待檢視 ${state.pendingCount}</button><button data-filter="all" class="${state.view==='all'?'is-active':''}">全部</button></div></div>${cards || '<div class="v281-admin-empty">目前沒有逐字稿修正通知。</div>'}`;
    applyView(root);
  }

  async function requestAction(id, action, body) {
    const method = action === 'supplement' ? 'PUT' : 'POST';
    const res = await fetch(`/api/v281/transcript-corrections/${encodeURIComponent(id)}/${action}`, { method, credentials:'same-origin', headers:{'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : '{}' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '操作失敗');
    return data;
  }

  async function handlePanelClick(event) {
    const button = event.target.closest('button'); if (!button) return;
    const filter = button.dataset.filter;
    if (filter) { state.view = filter; await loadData(true); return; }
    const card = button.closest('[data-correction-id]'); if (!card) return;
    const id = card.dataset.correctionId, action = button.dataset.action;
    if (action === 'play') {
      const params = new URLSearchParams(); params.set('track', button.dataset.track || ''); params.set('transcriptStart', button.dataset.start || '0'); params.set('transcriptEnd', button.dataset.end || '0'); params.set('transcriptSegmentPlay', '1');
      sessionStorage.setItem('v281_transcript_return_notifications', '1');
      window.location.assign('/?' + params.toString()); return;
    }
    if (action === 'supplement-open') { card.querySelector('[data-supplement-box]').hidden = false; card.querySelector('textarea')?.focus(); return; }
    if (action === 'supplement-cancel') { card.querySelector('[data-supplement-box]').hidden = true; return; }
    if (action === 'revoke' && !window.confirm('確定撤銷這次修正嗎？\n\n逐字稿會恢復到這次修正前的有效版本；若這次曾發放電池，也會一併扣回。')) return;
    try {
      button.disabled = true;
      if (action === 'accept') { await requestAction(id, 'accept'); toast('已接受這次逐字稿修正'); }
      if (action === 'revoke') { const data = await requestAction(id, 'revoke'); toast(data.rewardRevoked > 0 ? `已撤銷修正並扣回 ${data.rewardRevoked} 顆電池` : '已撤銷修正'); }
      if (action === 'supplement-save') {
        const value = (card.querySelector('textarea')?.value || '').trim(); if (!value) throw new Error('補充修正不能空白');
        await requestAction(id, 'supplement', { text:value }); toast('已儲存超級管理員補充修正');
      }
      await loadData(true);
    } catch (error) { toast(error && error.message || '操作失敗'); button.disabled = false; }
  }

  function setupSegmentPlayback() {
    const params = new URLSearchParams(location.search);
    if (params.get('transcriptSegmentPlay') !== '1') return;
    const trackId = params.get('track') || '', start = Math.max(0, Number(params.get('transcriptStart') || 0)), end = Math.max(start + .2, Number(params.get('transcriptEnd') || start + 5));
    let attempts = 0, armed = false;
    const poll = setInterval(() => {
      attempts++;
      const audio = document.querySelector('audio');
      const player = Array.from(document.querySelectorAll('[data-echostars-media-session="1"]')).find(el => el.dataset.mediaTrackId === trackId);
      if (!audio || !player || audio.readyState < 1) { if (attempts > 150) clearInterval(poll); return; }
      clearInterval(poll); if (armed) return; armed = true;
      try { audio.currentTime = Math.min(start, Math.max(0, (audio.duration || end) - .05)); } catch {}
      const toggle = player.querySelector('[data-echostars-media-toggle="1"]');
      if (audio.paused) { if (toggle) toggle.click(); else audio.play().catch(() => {}); }
      const stop = () => {
        if (audio.currentTime + .04 < end) return;
        audio.removeEventListener('timeupdate', stop);
        if (!audio.paused && toggle) toggle.click(); else if (!audio.paused) audio.pause();
      };
      audio.addEventListener('timeupdate', stop);
    }, 200);
  }

  function schedule() {
    clearTimeout(state.timer);
    state.timer = setTimeout(async () => {
      const root = findNotificationsRoot();
      if (!root) return;
      state.root = root;
      if (state.authorized === null && !state.loading) await loadData();
      if (state.authorized === true) { installTab(root); if (state.active) { render(); applyView(root); } }
    }, 180);
  }

  new MutationObserver(schedule).observe(document.body, { childList:true, subtree:true });
  setupSegmentPlayback();
  schedule();
})();
