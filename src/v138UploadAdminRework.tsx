import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { Edit2, Search, Trash2, X } from 'lucide-react';
import { UploadModal } from './components/UploadModal';
import type { Track, UserProfile } from './types';

const STYLE_ID = 'echostars-v138-upload-admin-rework';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
const MANAGEMENT_ROOT_ATTR = 'data-v138-track-management-root';
const managedRoots = new Map<HTMLElement, Root>();

function normalizeText(value: string | null | undefined) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function readCurrentUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    return raw ? JSON.parse(raw) as UserProfile : null;
  } catch {
    return null;
  }
}

function isSuperAdmin(user: UserProfile | null) {
  const email = user?.email?.trim().toLowerCase();
  return email === 'yukidu@gmail.com' || user?.role === '超級管理員' || user?.id === 'u-admin';
}

function readCachedTracks(): Track[] {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    return Array.isArray(cached?.tracks) ? cached.tracks : [];
  } catch {
    return [];
  }
}

function writeCachedTracks(tracks: Track[]) {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null') || {};
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
      ...cached,
      tracks,
      savedAt: Date.now()
    }));
  } catch {
    // Cache refresh is best-effort; the server remains the source of truth.
  }
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Upload page sits at z-index 160. Raise only the navbar while this page is active
       so the hamburger drawer is never trapped underneath the upload content. */
    body[data-main-tab="upload"] > #root header,
    body[data-main-tab="upload"] header.sticky {
      z-index: 240 !important;
    }
    body[data-main-tab="upload"] .mobile-menu-shell {
      z-index: 260 !important;
    }

    /* The old cover presentation split the label and selected-cover area across two
       grid rows while the parent still had a 1rem row gap. Bridge that gap so the
       card reads as one continuous box. */
    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-label="1"] {
      margin-bottom: -0.5rem !important;
      padding-bottom: 0.75rem !important;
      position: relative;
      z-index: 2;
    }
    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-selected="1"] {
      margin-top: -0.5rem !important;
      padding-top: 0.75rem !important;
      position: relative;
      z-index: 1;
    }

    /* Keep guest visibility visually inside the permission card without moving a
       React-owned node in the DOM. */
    #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
      padding-bottom: 3.35rem !important;
    }
    #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
      grid-column: 5 / 7 !important;
      grid-row: 3 !important;
      align-self: end !important;
      z-index: 4 !important;
      margin: 0 !important;
      padding: 0 0.75rem 0.65rem !important;
      background: transparent !important;
      border: 0 !important;
    }
    #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] > p {
      display: none !important;
    }
    #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] label {
      font-size: 0.75rem !important;
      line-height: 1.15rem !important;
    }

    [data-v138-hidden-upload-date="1"],
    [data-v138-hidden-bottom-actions="1"] {
      display: none !important;
    }

    .v138-track-management {
      margin: 0 1rem 2rem;
      padding: 1rem;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      background: rgb(248 250 252 / .82);
    }
    .dark .v138-track-management {
      border-color: rgb(51 65 85);
      background: rgb(15 23 42 / .55);
    }
    .v138-track-management-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: .75rem;
      margin-bottom: .8rem;
      flex-wrap: wrap;
    }
    .v138-track-management-title {
      font-size: 1rem;
      font-weight: 900;
      color: rgb(30 41 59);
    }
    .dark .v138-track-management-title { color: rgb(241 245 249); }
    .v138-track-search {
      min-width: min(100%, 18rem);
      flex: 1 1 14rem;
      display: flex;
      align-items: center;
      gap: .45rem;
      padding: .5rem .7rem;
      border: 1px solid rgb(203 213 225);
      border-radius: .8rem;
      background: white;
    }
    .dark .v138-track-search {
      border-color: rgb(71 85 105);
      background: rgb(15 23 42);
    }
    .v138-track-search input {
      min-width: 0;
      width: 100%;
      border: 0;
      outline: 0;
      background: transparent;
      color: rgb(30 41 59);
      font-size: .8rem;
    }
    .dark .v138-track-search input { color: rgb(241 245 249); }
    .v138-track-list {
      display: grid;
      gap: .5rem;
      max-height: 28rem;
      overflow-y: auto;
      padding-right: .2rem;
    }
    .v138-track-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: .75rem;
      align-items: center;
      padding: .7rem .8rem;
      border: 1px solid rgb(226 232 240);
      border-radius: .85rem;
      background: white;
    }
    .dark .v138-track-row {
      border-color: rgb(51 65 85);
      background: rgb(30 41 59);
    }
    .v138-track-row-title {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: .82rem;
      font-weight: 850;
      color: rgb(30 41 59);
    }
    .dark .v138-track-row-title { color: rgb(241 245 249); }
    .v138-track-row-meta {
      margin-top: .18rem;
      font-size: .7rem;
      color: rgb(100 116 139);
    }
    .dark .v138-track-row-meta { color: rgb(148 163 184); }
    .v138-track-actions { display: flex; gap: .35rem; align-items: center; }
    .v138-track-action {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: .28rem;
      min-height: 2rem;
      padding: .35rem .55rem;
      border-radius: .65rem;
      font-size: .72rem;
      font-weight: 800;
      white-space: nowrap;
    }
    .v138-track-edit {
      background: color-mix(in srgb, var(--color-primary,#c06c84) 12%, white);
      color: var(--color-primary,#c06c84);
    }
    .v138-track-delete { background: rgb(254 226 226); color: rgb(190 24 93); }
    .dark .v138-track-edit { background: rgb(51 65 85); }
    .dark .v138-track-delete { background: rgb(76 29 49); color: rgb(253 164 175); }
    .v138-track-editor-overlay {
      position: fixed;
      inset: 0;
      z-index: 320;
      overflow-y: auto;
      background: rgb(255 255 255 / .97);
      backdrop-filter: blur(8px);
    }
    .dark .v138-track-editor-overlay { background: rgb(15 23 42 / .97); }
    .v138-track-editor-overlay .upload-page {
      margin-top: 1rem !important;
      margin-bottom: 3rem !important;
    }

    @media (max-width: 767px) {
      #track-upload-form[data-upload-presentation="1"] [data-upload-guest-visibility="true"] {
        grid-column: 1 !important;
        grid-row: 5 !important;
      }
      #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
        padding-bottom: 3.35rem !important;
      }
      .v138-track-management { margin-inline: .75rem; padding: .75rem; }
      .v138-track-row { grid-template-columns: minmax(0, 1fr); }
      .v138-track-actions { justify-content: flex-end; }
    }
  `;
  document.head.appendChild(style);
}

function TrackManagementPanel() {
  const user = useMemo(readCurrentUser, []);
  const [tracks, setTracks] = useState<Track[]>(readCachedTracks);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(tracks.length === 0);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);

  useEffect(() => {
    if (tracks.length > 0) return;
    let cancelled = false;
    setLoading(true);
    void fetch('/api/tracks', { headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error('讀取音檔清單失敗');
        const data = await response.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : [];
        if (!cancelled) {
          setTracks(list);
          writeCachedTracks(list);
        }
      })
      .catch(() => { if (!cancelled) setError('讀取音檔清單失敗，請重新整理後再試。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const outerForm = document.querySelector<HTMLFormElement>('.upload-page #track-upload-form');
    if (!editingTrack) return;
    if (outerForm) outerForm.id = 'track-upload-form-v138-background';
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      const backgroundForm = document.getElementById('track-upload-form-v138-background');
      if (backgroundForm) backgroundForm.id = 'track-upload-form';
      document.body.style.overflow = oldOverflow;
    };
  }, [editingTrack]);

  const visibleTracks = useMemo(() => {
    const clean = query.trim().toLocaleLowerCase('zh-Hant');
    if (!clean) return tracks;
    return tracks.filter(track => [
      track.title,
      track.speaker,
      track.series,
      track.requiredRank,
      ...(track.categories || []),
      ...(track.keywords || [])
    ].some(value => String(value || '').toLocaleLowerCase('zh-Hant').includes(clean)));
  }, [tracks, query]);

  const deleteTrack = async (track: Track) => {
    if (deletingId !== track.id) {
      setDeletingId(track.id);
      return;
    }
    try {
      setError('');
      const userEmail = user?.email || 'yukidu@gmail.com';
      const response = await fetch(`/api/tracks/${encodeURIComponent(track.id)}?userEmail=${encodeURIComponent(userEmail)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || '刪除失敗');
      }
      const next = tracks.filter(item => item.id !== track.id);
      setTracks(next);
      writeCachedTracks(next);
      setDeletingId(null);
      window.setTimeout(() => window.location.reload(), 120);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
      setDeletingId(null);
    }
  };

  if (!isSuperAdmin(user)) return null;

  return (
    <section className="v138-track-management" aria-label="音檔管理">
      <div className="v138-track-management-head">
        <div>
          <div className="v138-track-management-title">音檔管理</div>
          <div className="v138-track-row-meta">原「後台管理 ＞ 音檔」已整合到此頁</div>
        </div>
        <label className="v138-track-search">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋音檔、講者、分類或關鍵字" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜尋"><X className="h-4 w-4" /></button>}
        </label>
      </div>

      {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</div>}
      {loading ? (
        <div className="py-5 text-center text-xs text-slate-400">讀取音檔清單中…</div>
      ) : visibleTracks.length === 0 ? (
        <div className="py-5 text-center text-xs text-slate-400">沒有符合的音檔</div>
      ) : (
        <div className="v138-track-list">
          {visibleTracks.map(track => (
            <div className="v138-track-row" key={track.id}>
              <div className="min-w-0">
                <div className="v138-track-row-title">{track.title || '未命名音檔'}</div>
                <div className="v138-track-row-meta">
                  {track.speaker || '未設定講者'} · {(!track.requiredRank || track.requiredRank === '無') ? '公開' : track.requiredRank}
                </div>
              </div>
              <div className="v138-track-actions">
                <button type="button" className="v138-track-action v138-track-edit" onClick={() => setEditingTrack(track)}>
                  <Edit2 className="h-3.5 w-3.5" />編輯
                </button>
                <button type="button" className="v138-track-action v138-track-delete" onClick={() => void deleteTrack(track)}>
                  <Trash2 className="h-3.5 w-3.5" />{deletingId === track.id ? '再按一次確認' : '刪除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingTrack && createPortal(
        <div className="v138-track-editor-overlay">
          <UploadModal
            isOpen={true}
            onClose={() => setEditingTrack(null)}
            onSuccess={updatedTrack => {
              const next = tracks.map(track => track.id === updatedTrack.id ? { ...track, ...updatedTrack } : track);
              setTracks(next);
              writeCachedTracks(next);
              setEditingTrack(null);
              window.setTimeout(() => window.location.reload(), 120);
            }}
            currentUser={user}
            isAdmin={true}
            trackToEdit={editingTrack}
            tracks={tracks}
          />
        </div>,
        document.body
      )}
    </section>
  );
}

function syncGuestVisibility(form: HTMLFormElement) {
  const guestBox = form.querySelector<HTMLElement>('[data-upload-guest-visibility="true"]');
  const guestInput = guestBox?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!guestBox || !guestInput) return;

  const permissionBox = form.querySelector<HTMLElement>('[data-upload-permission="1"]');
  const permissionSelect = permissionBox?.querySelector<HTMLSelectElement>('select');
  const vipBox = form.querySelector<HTMLElement>('[data-upload-vip="1"]');
  const vipInput = vipBox?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const stickerBox = Array.from(form.querySelectorAll<HTMLElement>('label')).find(label =>
    normalizeText(label.textContent).startsWith('解鎖本錄音所需貼紙')
  );
  const stickerSelect = stickerBox?.querySelector<HTMLSelectElement>('select');

  const rank = permissionSelect?.value || '無';
  const publicRecording = rank === '無' || rank === '公開' || rank === '';
  const freeForGuest = Number(stickerSelect?.value || 0) === 0;
  const notPrivateVip = !vipInput?.checked;

  if (publicRecording && freeForGuest && notPrivateVip && !guestInput.checked) {
    guestInput.click();
  }
}

function markUploadUi() {
  document.querySelectorAll<HTMLFormElement>('#track-upload-form').forEach(form => {
    const fields = Array.from(form.querySelectorAll<HTMLElement>('[data-upload-fields-grid="1"] > div'));
    const todayField = fields.find(field => normalizeText(field.querySelector('label')?.textContent).startsWith('今天上傳日期'));
    if (todayField) todayField.dataset.v138HiddenUploadDate = '1';

    const directChildren = Array.from(form.children).filter((node): node is HTMLElement => node instanceof HTMLElement);
    const bottomActions = directChildren.find(child => {
      const buttonTexts = Array.from(child.querySelectorAll('button')).map(button => normalizeText(button.textContent));
      return buttonTexts.includes('取消') && buttonTexts.some(text => text === '儲存音檔' || text === '儲存中…');
    });
    if (bottomActions) bottomActions.dataset.v138HiddenBottomActions = '1';

    syncGuestVisibility(form);
  });
}

function renameUploadMenu() {
  document.querySelectorAll<HTMLElement>('.mobile-menu-panel span').forEach(span => {
    if (normalizeText(span.textContent) === '上傳音檔') span.textContent = '上傳音檔與管理';
  });

  document.querySelectorAll<HTMLElement>('.mobile-menu-panel [aria-label], .mobile-menu-panel [title]').forEach(element => {
    const aria = element.getAttribute('aria-label');
    const title = element.getAttribute('title');
    if (aria?.includes('上傳音檔')) element.setAttribute('aria-label', aria.replaceAll('上傳音檔', '上傳音檔與管理'));
    if (title?.includes('上傳音檔')) element.setAttribute('title', title.replaceAll('上傳音檔', '上傳音檔與管理'));
  });
}

function findAdminRoot(): HTMLElement | null {
  const heading = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3,span')).find(element =>
    normalizeText(element.textContent) === '後台管理中心'
  );
  if (!heading) return null;
  return heading.closest('.app-modal-overlay') || heading.parentElement?.parentElement?.parentElement || null;
}

function removeMovedAndLegacyAdminTabs() {
  const adminRoot = findAdminRoot();
  if (!adminRoot) return;
  const buttons = Array.from(adminRoot.querySelectorAll<HTMLButtonElement>('button'));
  buttons.forEach(button => {
    const text = normalizeText(button.textContent);
    if (text === '音檔' || text === '顯示') {
      button.dataset.v138RemovedAdminTab = '1';
      button.style.display = 'none';
    }
  });
}

function mountTrackManagement() {
  const user = readCurrentUser();
  if (!isSuperAdmin(user)) return;

  document.querySelectorAll<HTMLElement>('.upload-modal-overlay.upload-page').forEach(page => {
    // Do not inject another management panel into the dedicated edit portal.
    if (page.closest('.v138-track-editor-overlay')) return;
    const inner = page.firstElementChild as HTMLElement | null;
    const form = inner?.querySelector<HTMLFormElement>('#track-upload-form');
    if (!inner || !form) return;

    let mount = inner.querySelector<HTMLElement>(`[${MANAGEMENT_ROOT_ATTR}]`);
    if (!mount) {
      mount = document.createElement('div');
      mount.setAttribute(MANAGEMENT_ROOT_ATTR, '1');
      form.insertAdjacentElement('afterend', mount);
      const root = createRoot(mount);
      managedRoots.set(mount, root);
      root.render(<TrackManagementPanel />);
    }
  });

  managedRoots.forEach((root, mount) => {
    if (!document.contains(mount)) {
      root.unmount();
      managedRoots.delete(mount);
    }
  });
}

let syncing = false;
function syncV138() {
  if (syncing) return;
  syncing = true;
  try {
    installStyles();
    markUploadUi();
    renameUploadMenu();
    removeMovedAndLegacyAdminTabs();
    mountTrackManagement();
  } finally {
    syncing = false;
  }
}

installStyles();
syncV138();

const observer = new MutationObserver(() => syncV138());
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true,
  attributes: true,
  attributeFilter: ['value', 'checked', 'data-main-tab']
});

window.addEventListener('pageshow', syncV138);
window.addEventListener('resize', syncV138);
