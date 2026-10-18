(() => {
  if (window.__starryTranscriptUserNoticesV281) return;
  window.__starryTranscriptUserNoticesV281 = true;

  const state = { loadedAt: 0, loading: false, notices: [], root: null };
  const style = document.createElement('style');
  style.textContent = `
    .v281-user-transcript-notices{display:flex;flex-direction:column;gap:8px}
    .v281-user-notice{padding:11px 12px;border:1px solid #dbeafe;border-radius:16px;background:#eff6ff;color:#1e3a8a}
    .dark .v281-user-notice{background:#172554;border-color:#1e3a8a;color:#dbeafe}
    .v281-user-notice.is-unread{border-color:#60a5fa;box-shadow:0 0 0 1px rgba(59,130,246,.12)}
    .v281-user-notice-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .v281-user-notice-title{font-size:12px;font-weight:900}.v281-user-notice-time{font-size:10px;opacity:.65;white-space:nowrap}
    .v281-user-notice-body{font-size:11px;line-height:1.55;margin-top:5px}.v281-user-notice-label{font-size:9px;font-weight:900;padding:2px 6px;border-radius:999px;background:#dbeafe;color:#1d4ed8;margin-right:5px}.dark .v281-user-notice-label{background:#1e3a8a;color:#bfdbfe}
  `;
  document.head.appendChild(style);

  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const date = value => {
    const d = new Date(Number(value) || value || 0);
    return Number.isNaN(d.getTime()) ? '近期' : d.toLocaleString('zh-TW', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' });
  };

  function findRoot() {
    const heading = Array.from(document.querySelectorAll('h2')).find(el => (el.textContent || '').includes('繁星動態通知與獎銜審核'));
    if (!heading) return null;
    let node = heading.parentElement;
    while (node && node !== document.body) {
      if (node.classList.contains('space-y-3') && node.classList.contains('max-w-2xl')) return node;
      node = node.parentElement;
    }
    return null;
  }

  async function markRead(id) {
    try {
      await fetch('/api/v281/transcript-user-notifications/read', {
        method:'POST', credentials:'same-origin', cache:'no-store', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ id })
      });
    } catch (_) {}
  }

  function render(root) {
    let box = root.querySelector('[data-v281-user-transcript-notices]');
    if (!state.notices.length) { if (box) box.remove(); return; }
    if (!box) {
      box = document.createElement('div');
      box.dataset.v281UserTranscriptNotices = '1';
      box.className = 'v281-user-transcript-notices';
      const header = root.firstElementChild;
      if (header && header.nextSibling) root.insertBefore(box, header.nextSibling); else root.appendChild(box);
    }
    box.innerHTML = state.notices.map(item => `<article class="v281-user-notice ${item.isRead?'':'is-unread'}" data-notice-id="${esc(item.id)}">
      <div class="v281-user-notice-head"><div class="v281-user-notice-title"><span class="v281-user-notice-label">逐字稿</span>${esc(item.title)}</div><span class="v281-user-notice-time">${date(item.createdAt)}</span></div>
      <div class="v281-user-notice-body">${esc(item.body)}</div>
    </article>`).join('');
    box.querySelectorAll('[data-notice-id]').forEach(card => card.addEventListener('click', () => {
      const id = card.getAttribute('data-notice-id'); if (!id) return;
      card.classList.remove('is-unread'); void markRead(id);
    }, { once:true }));
  }

  async function refresh(root) {
    const now = Date.now();
    if (state.loading || now - state.loadedAt < 30000) { render(root); return; }
    state.loading = true;
    try {
      const res = await fetch('/api/v281/transcript-user-notifications', { credentials:'same-origin', cache:'no-store' });
      if (res.status === 401 || res.status === 403) { state.notices = []; render(root); return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      state.notices = Array.isArray(data.notifications) ? data.notifications : [];
      state.loadedAt = now;
      render(root);
    } catch (_) {
      // 通知讀取失敗不影響原本通知頁。
    } finally { state.loading = false; }
  }

  function scan() {
    // React explicitly announces when the notifications page is mounted.
    // Never observe the whole document: render() changes innerHTML, which used
    // to retrigger MutationObserver -> scan -> render without end on populated inboxes.
    if (document.body.dataset.mainTab !== 'notifications') return;
    const root = findRoot();
    if (!root) return;
    // The same instance must not start another request or redraw on unrelated UI changes.
    if (state.root === root && root.isConnected) return;
    state.root = root;
    void refresh(root);
  }

  window.addEventListener('echostars:notifications-mounted', scan);
  scan();
})();