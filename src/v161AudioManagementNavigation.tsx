import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { Edit2, Search, Trash2, X, Users, UserRound, Bot } from 'lucide-react';
import { TranscriptQaAdmin } from './components/TranscriptQaAdmin';
import { UploadModal } from './components/UploadModal';
import type { Track, UserProfile } from './types';

const STYLE_ID = 'echostars-v161-audio-management-navigation';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
const ROOT_ATTR = 'data-v161-track-management-root';
const roots = new Map<HTMLElement, Root>();
const originalInputClick = HTMLInputElement.prototype.click;
const originalScrollIntoView = Element.prototype.scrollIntoView;

type ManageMode = 'mine' | 'community' | 'qa';
type TranscriptProgressItem = {
  trackId: string;
  status: string;
  error?: string | null;
  updatedAt?: number;
};

function normalize(value: string | null | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function lower(value: string | null | undefined) {
  return normalize(value).toLocaleLowerCase('zh-Hant');
}

function transcriptProgressPresentation(item?: TranscriptProgressItem) {
  switch (item?.status) {
    case 'processing':
      return { label: '正在撰寫逐字稿', className: 'is-processing' };
    case 'ready':
      return { label: '已完成逐字稿', className: 'is-ready' };
    case 'failed':
      return { label: '逐字稿異常', className: 'is-failed' };
    case 'queued':
    case 'pending':
    default:
      return { label: '排隊中逐字稿', className: 'is-queued' };
  }
}

function readUser(): UserProfile | null {
  try {
    const raw = localStorage.getItem('sq_current_user_v1');
    return raw ? JSON.parse(raw) as UserProfile : null;
  } catch {
    return null;
  }
}

function isSuperAdmin(user: UserProfile | null) {
  const email = lower(user?.email);
  return email === 'yukidu@gmail.com' || user?.role === '超級管理員' || user?.id === 'u-admin';
}

function readTracks(): Track[] {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null');
    return Array.isArray(cached?.tracks) ? cached.tracks : [];
  } catch {
    return [];
  }
}

function writeTracks(tracks: Track[]) {
  try {
    const cached = JSON.parse(localStorage.getItem(HOME_CACHE_KEY) || 'null') || {};
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({ ...cached, tracks, savedAt: Date.now() }));
  } catch {}
}

function isTrackOwnedBy(track: Track, user: UserProfile | null) {
  if (!user) return false;
  if (track.uploaderId && user.id && track.uploaderId === user.id) return true;
  const trackEmail = lower(track.uploaderEmail);
  const userEmail = lower(user.email);
  return Boolean(trackEmail && userEmail && trackEmail === userEmail);
}

function isLegacyAdminTrack(track: Track) {
  return !normalize(track.uploaderId) && !normalize(track.uploaderEmail) && !normalize(track.uploadedBy);
}

function formatDate(value?: string) {
  const raw = normalize(value);
  if (!raw) return '未記錄';
  const match = raw.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  if (!match) return raw;
  return `${match[1]}/${String(Number(match[2])).padStart(2, '0')}/${String(Number(match[3])).padStart(2, '0')}`;
}

function memberForTrack(track: Track, members: UserProfile[]) {
  const email = lower(track.uploaderEmail);
  return members.find(member =>
    (track.uploaderId && member.id === track.uploaderId) ||
    (email && lower(member.email) === email)
  ) || null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .v138-track-management:not([data-v161-track-management="1"]) { display:none !important; }
    .upload-page[data-v139-upload-tab="manage"] > div > .v139-upload-tabs + div { display:none !important; }
    [data-v161-track-management="1"] {
      margin:.45rem .65rem 1.2rem !important;
      padding:.65rem !important;
      border:1px solid rgb(226 232 240);
      border-radius:1rem;
      background:rgb(248 250 252 / .78);
    }
    .dark [data-v161-track-management="1"] { border-color:rgb(51 65 85); background:rgb(15 23 42 / .55); }
    .v161-manage-toolbar { display:grid; gap:.5rem; margin-bottom:.55rem; }
    .v161-manage-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:.4rem; }
    .v161-manage-tab { min-height:2.35rem; border:1px solid rgb(203 213 225); border-radius:.75rem; background:white; color:rgb(71 85 105); font-size:.78rem; font-weight:900; }
    .dark .v161-manage-tab { border-color:rgb(71 85 105); background:rgb(30 41 59); color:rgb(226 232 240); }
    .v161-manage-tab[aria-selected="true"] { border-color:var(--color-primary,#c06c84); background:var(--color-primary,#c06c84); color:white; }
    .v161-search-row { display:grid; grid-template-columns:minmax(0,1fr); gap:.4rem; }
    .v161-search { display:flex; align-items:center; gap:.4rem; min-height:2.45rem; padding:.38rem .62rem; border:1px solid rgb(203 213 225); border-radius:.75rem; background:white; }
    .dark .v161-search { border-color:rgb(71 85 105); background:rgb(15 23 42); }
    .v161-search input { min-width:0; width:100%; border:0; outline:0; background:transparent; color:rgb(30 41 59); font-size:.78rem; }
    .dark .v161-search input { color:rgb(241 245 249); }
    .v161-track-list { display:grid; gap:.34rem; max-height:31rem; overflow-y:auto; padding-right:.15rem; }
    .v161-track-row { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:.5rem; align-items:center; padding:.48rem .58rem; border:1px solid rgb(226 232 240); border-radius:.72rem; background:white; }
    .dark .v161-track-row { border-color:rgb(51 65 85); background:rgb(30 41 59); }
    .v161-track-title { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.8rem; line-height:1.15rem; font-weight:900; color:rgb(30 41 59); }
    .dark .v161-track-title { color:rgb(241 245 249); }
    .v161-track-meta { margin-top:.06rem; font-size:.68rem; line-height:1.05rem; color:rgb(100 116 139); }
    .dark .v161-track-meta { color:rgb(148 163 184); }
    .v161-transcript-status { display:inline-flex; align-items:center; margin-top:.22rem; border-radius:999px; padding:.18rem .48rem; font-size:.66rem; line-height:1rem; font-weight:900; }
    .v161-transcript-status.is-processing { background:rgb(254 243 199); color:rgb(146 64 14); }
    .v161-transcript-status.is-ready { background:rgb(209 250 229); color:rgb(4 120 87); }
    .v161-transcript-status.is-failed { background:rgb(254 226 226); color:rgb(190 24 93); }
    .v161-transcript-status.is-queued { background:rgb(219 234 254); color:rgb(29 78 216); }
    .dark .v161-transcript-status.is-processing { background:rgb(120 53 15 / .45); color:rgb(253 230 138); }
    .dark .v161-transcript-status.is-ready { background:rgb(6 78 59 / .5); color:rgb(167 243 208); }
    .dark .v161-transcript-status.is-failed { background:rgb(127 29 29 / .5); color:rgb(254 202 202); }
    .dark .v161-transcript-status.is-queued { background:rgb(30 58 138 / .5); color:rgb(191 219 254); }
    .v161-actions { display:flex; gap:.28rem; align-items:center; }
    .v161-action { display:inline-flex; align-items:center; justify-content:center; gap:.2rem; min-height:1.9rem; padding:.3rem .48rem; border-radius:.6rem; font-size:.7rem; font-weight:850; white-space:nowrap; }
    .v161-edit { background:color-mix(in srgb,var(--color-primary,#c06c84) 12%,white); color:var(--color-primary,#c06c84); }
    .v161-delete { background:rgb(254 226 226); color:rgb(190 24 93); }
    .dark .v161-edit { background:rgb(51 65 85); }
    .dark .v161-delete { background:rgb(76 29 49); color:rgb(253 164 175); }
    #track-upload-form [data-upload-guest-visibility="true"] input[type="checkbox"] { width:2.25rem !important; height:2.25rem !important; min-width:2.25rem !important; accent-color:var(--color-primary,#c06c84); cursor:pointer; }
    #track-upload-form [data-upload-guest-visibility="true"] label { font-size:.92rem !important; gap:.65rem !important; }
    .v161-track-editor-overlay { position:fixed; inset:0; z-index:210; }
    .v161-track-editor-overlay .upload-modal-overlay { inset:4.4rem 0 0 !important; height:calc(100dvh - 4.4rem) !important; z-index:210 !important; overflow-y:auto !important; }
    @media (min-width:640px) { .v161-search-row.has-member-search { grid-template-columns:minmax(0,1fr) minmax(0,1fr); } }
    @media (max-width:767px) {
      [data-v161-track-management="1"] { margin-inline:.4rem !important; padding:.5rem !important; }
      .v161-track-row { grid-template-columns:minmax(0,1fr); gap:.3rem; }
      .v161-actions { justify-content:flex-end; }
      .v161-track-editor-overlay .upload-modal-overlay { inset:4rem 0 0 !important; height:calc(100dvh - 4rem) !important; }
    }
  `;
  document.head.appendChild(style);
}

function TrackManagement() {
  const user = useMemo(readUser, []);
  const superAdmin = isSuperAdmin(user);
  const [mode, setMode] = useState<ManageMode>('mine');
  const [tracks, setTracks] = useState<Track[]>(readTracks);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [transcriptStatuses, setTranscriptStatuses] = useState<Record<string, TranscriptProgressItem>>({});
  const [transcriptStatusesReady, setTranscriptStatusesReady] = useState(false);
  const returnScrollRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch('/api/tracks', { headers: { Accept: 'application/json' } })
      .then(async response => {
        if (!response.ok) throw new Error('讀取音檔清單失敗');
        const data = await response.json();
        const list = Array.isArray(data) ? data : Array.isArray(data?.tracks) ? data.tracks : [];
        if (!cancelled) { setTracks(list); writeTracks(list); }
      })
      .catch(() => { if (!cancelled) setError('讀取音檔清單失敗，請重新整理後再試。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!superAdmin) return;
    let cancelled = false;
    const loadTranscriptStatuses = async () => {
      try {
        const response = await fetch('/api/v281/transcripts/bulk-status', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) return;
        const data = await response.json();
        const next: Record<string, TranscriptProgressItem> = {};
        for (const item of Array.isArray(data?.items) ? data.items : []) {
          const trackId = normalize(item?.trackId);
          if (!trackId) continue;
          next[trackId] = {
            trackId,
            status: normalize(item?.status) || 'pending',
            error: normalize(item?.error) || null,
            updatedAt: Number(item?.updatedAt || 0)
          };
        }
        if (!cancelled) {
          setTranscriptStatuses(next);
          setTranscriptStatusesReady(true);
        }
      } catch {}
    };
    void loadTranscriptStatuses();
    const timer = window.setInterval(() => { void loadTranscriptStatuses(); }, 15000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [superAdmin]);

  useEffect(() => {
    if (!superAdmin) return;
    let cancelled = false;
    void fetch('/api/users', { headers: { Accept: 'application/json' } })
      .then(async response => response.ok ? response.json() : [])
      .then(data => { if (!cancelled && Array.isArray(data)) setMembers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [superAdmin]);

  const memberNameFor = (track: Track) => {
    const member = memberForTrack(track, members);
    return normalize(track.uploaderName) || normalize(member?.name) || normalize(track.uploaderEmail).split('@')[0] || '未辨識會員';
  };

  const scopedTracks = useMemo(() => {
    if (!user) return [];
    if (!superAdmin) return tracks.filter(track => isTrackOwnedBy(track, user));
    if (mode === 'mine') return tracks.filter(track => isTrackOwnedBy(track, user) || isLegacyAdminTrack(track));
    return tracks.filter(track => !isTrackOwnedBy(track, user) && !isLegacyAdminTrack(track));
  }, [tracks, user, superAdmin, mode]);

  const visibleTracks = useMemo(() => {
    const clean = lower(query);
    const memberClean = lower(memberQuery);
    return scopedTracks.filter(track => {
      if (memberClean && mode === 'community' && !lower(memberNameFor(track)).includes(memberClean)) return false;
      if (!clean) return true;
      return [track.title, track.speaker, track.speakerRank, track.requiredRank, track.uploadDate, track.series, memberNameFor(track), ...(track.categories || []), ...(track.keywords || [])]
        .some(value => lower(String(value || '')).includes(clean));
    });
  }, [scopedTracks, query, memberQuery, mode, members]);

  const memberSuggestions = useMemo(() => {
    const clean = lower(memberQuery);
    const unique = new Set<string>();
    members.forEach(member => {
      const name = normalize(member.name);
      if (name && (!clean || lower(name).includes(clean))) unique.add(name);
    });
    return Array.from(unique).slice(0, 12);
  }, [members, memberQuery]);

  const openEditor = (track: Track) => {
    returnScrollRef.current = window.scrollY;
    setEditingTrack(track);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  };

  const closeEditor = () => {
    setEditingTrack(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: returnScrollRef.current, behavior: 'auto' }));
  };

  const deleteTrack = async (track: Track) => {
    if (deletingId !== track.id) { setDeletingId(track.id); return; }
    try {
      setError('');
      const response = await fetch(`/api/tracks/${encodeURIComponent(track.id)}?userEmail=${encodeURIComponent(user?.email || '')}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || '刪除失敗');
      }
      const next = tracks.filter(item => item.id !== track.id);
      setTracks(next);
      writeTracks(next);
      setDeletingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
      setDeletingId(null);
    }
  };

  if (!user) return null;

  return (
    <section className="v138-track-management" data-v161-track-management="1" aria-label="音檔管理">
      <div className="v161-manage-toolbar">
        {superAdmin && (
          <div className="v161-manage-tabs" role="tablist" aria-label="管理音檔來源">
            <button type="button" className="v161-manage-tab" aria-selected={mode === 'mine'} onClick={() => { setMode('mine'); setMemberQuery(''); }}>我的音檔</button>
            <button type="button" className="v161-manage-tab" aria-selected={mode === 'community'} onClick={() => setMode('community')}>網友音檔</button>
            <button type="button" className="v161-manage-tab" aria-selected={mode === 'qa'} onClick={() => setMode('qa')}><Bot className="inline h-4 w-4"/> 逐字稿</button>
          </div>
        )}
        {mode !== 'qa' && <div className={`v161-search-row ${superAdmin && mode === 'community' ? 'has-member-search' : ''}`}>
          <label className="v161-search">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜尋音檔、講者、獎銜或日期" />
            {query && <button type="button" onClick={() => setQuery('')} aria-label="清除搜尋"><X className="h-4 w-4" /></button>}
          </label>
          {superAdmin && mode === 'community' && (
            <label className="v161-search">
              <Users className="h-4 w-4 shrink-0 text-slate-400" />
              <input list="v161-member-name-suggestions" value={memberQuery} onChange={event => setMemberQuery(event.target.value)} placeholder="搜尋網友會員名稱" autoComplete="off" />
              {memberQuery && <button type="button" onClick={() => setMemberQuery('')} aria-label="清除會員搜尋"><X className="h-4 w-4" /></button>}
              <datalist id="v161-member-name-suggestions">{memberSuggestions.map(name => <option key={name} value={name} />)}</datalist>
            </label>
          )}
        </div>}
      </div>

      {superAdmin && mode === 'qa' && <TranscriptQaAdmin />}
      {mode !== 'qa' && <>
      {error && <div className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">{error}</div>}
      {loading ? (
        <div className="py-4 text-center text-xs text-slate-400">讀取音檔清單中…</div>
      ) : visibleTracks.length === 0 ? (
        <div className="py-4 text-center text-xs text-slate-400">沒有符合的音檔</div>
      ) : (
        <div className="v161-track-list">
          {visibleTracks.map(track => {
            const permission = !track.requiredRank || track.requiredRank === '無' ? '公開' : track.requiredRank;
            const speakerRank = normalize(track.speakerRank) && track.speakerRank !== '無' ? ` ${track.speakerRank}` : '';
            const transcriptItem = transcriptStatuses[track.id];
            const transcriptBadge = superAdmin && transcriptStatusesReady && normalize(track.audioUrl)
              ? transcriptProgressPresentation(transcriptItem)
              : null;
            return (
              <div className="v161-track-row" key={track.id}>
                <div className="min-w-0">
                  <div className="v161-track-title">{track.title || '未命名音檔'}</div>
                  <div className="v161-track-meta">{track.speaker || '未設定講者'}{speakerRank} · {permission} · 上傳 {formatDate(track.uploadDate)}</div>
                  {transcriptBadge && (
                    <div
                      className={`v161-transcript-status ${transcriptBadge.className}`}
                      title={transcriptItem?.error || transcriptBadge.label}
                    >
                      {transcriptBadge.label}
                    </div>
                  )}
                  {superAdmin && mode === 'community' && <div className="v161-track-meta inline-flex items-center gap-1"><UserRound className="h-3 w-3" />網友：{memberNameFor(track)}</div>}
                </div>
                <div className="v161-actions">
                  <button type="button" className="v161-action v161-edit" onClick={() => openEditor(track)}><Edit2 className="h-3.5 w-3.5" />編輯</button>
                  <button type="button" className="v161-action v161-delete" onClick={() => void deleteTrack(track)}><Trash2 className="h-3.5 w-3.5" />{deletingId === track.id ? '再按一次確認' : '刪除'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      </>}
      {editingTrack && createPortal(
        <div className="v161-track-editor-overlay">
          <UploadModal
            isOpen={true}
            onClose={closeEditor}
            onSuccess={updatedTrack => {
              const next = tracks.map(track => track.id === updatedTrack.id ? { ...track, ...updatedTrack } : track);
              setTracks(next);
              writeTracks(next);
              closeEditor();
            }}
            currentUser={user}
            isAdmin={superAdmin}
            trackToEdit={editingTrack}
            tracks={tracks}
          />
        </div>,
        document.body
      )}
    </section>
  );
}

function isPublicPermission(value: string | null | undefined) {
  const rank = normalize(value);
  return rank === '' || rank === '無' || rank === '公開';
}

function guestInputFor(form: HTMLFormElement) {
  return form.querySelector<HTMLInputElement>('[data-upload-guest-visibility="true"] input[type="checkbox"]');
}

function permissionSelectFor(form: HTMLFormElement) {
  return form.querySelector<HTMLSelectElement>('[data-upload-permission="1"] select');
}

function setGuestChecked(input: HTMLInputElement, checked: boolean) {
  if (input.checked === checked) return;
  input.dataset.v161AutoGuestChange = '1';
  delete input.dataset.v161ManualGuestOff;
  originalInputClick.call(input);
  delete input.dataset.v161AutoGuestChange;
}

function syncGuestRule(form: HTMLFormElement) {
  const guest = guestInputFor(form);
  const permission = permissionSelectFor(form);
  if (!guest || !permission) return;

  const heading = normalize(form.closest('.upload-page')?.querySelector('h2')?.textContent);
  const editing = heading === '編輯音檔';
  const publicPermission = isPublicPermission(permission.value);

  if (form.dataset.v161GuestInitialized !== '1') {
    form.dataset.v161GuestInitialized = '1';
    if (!publicPermission) setGuestChecked(guest, false);
    else if (!editing) setGuestChecked(guest, true);
    else if (!guest.checked) guest.dataset.v161ManualGuestOff = '1';
  }

  if (permission.dataset.v161GuestRuleBound !== '1') {
    permission.dataset.v161GuestRuleBound = '1';
    permission.addEventListener('change', () => {
      delete guest.dataset.v161ManualGuestOff;
      setGuestChecked(guest, isPublicPermission(permission.value));
    });
  }

  if (guest.dataset.v161GuestRuleBound !== '1') {
    guest.dataset.v161GuestRuleBound = '1';
    guest.addEventListener('change', () => {
      if (guest.dataset.v161AutoGuestChange === '1') return;
      if (isPublicPermission(permission.value) && !guest.checked) guest.dataset.v161ManualGuestOff = '1';
      if (guest.checked) delete guest.dataset.v161ManualGuestOff;
    });
  }
}

function hideLegacyUploadFields(form: HTMLFormElement) {
  const fields = Array.from(form.querySelectorAll<HTMLElement>('[data-upload-fields-grid="1"] > div'));
  const today = fields.find(field => normalize(field.querySelector('label')?.textContent).startsWith('今天上傳日期'));
  if (today) today.style.setProperty('display', 'none', 'important');

  const bottomActions = Array.from(form.children).find(child => {
    if (!(child instanceof HTMLElement)) return false;
    const texts = Array.from(child.querySelectorAll('button')).map(button => normalize(button.textContent));
    return texts.includes('取消') && texts.some(text => text === '儲存音檔' || text === '儲存中…');
  });
  if (bottomActions instanceof HTMLElement) bottomActions.style.setProperty('display', 'none', 'important');
}

function mountManagement() {
  installStyles();
  document.querySelectorAll<HTMLFormElement>('#track-upload-form').forEach(form => {
    syncGuestRule(form);
    hideLegacyUploadFields(form);
  });

  const user = readUser();
  if (!user) return;
  document.querySelectorAll<HTMLElement>('.upload-modal-overlay.upload-page').forEach(page => {
    if (page.closest('.v161-track-editor-overlay') || normalize(page.querySelector('h2')?.textContent) === '編輯音檔') return;
    const inner = page.firstElementChild as HTMLElement | null;
    const form = inner?.querySelector<HTMLFormElement>('#track-upload-form');
    if (!inner || !form) return;

    let mount = inner.querySelector<HTMLElement>(`[${ROOT_ATTR}]`);
    if (!mount) {
      mount = document.createElement('div');
      mount.setAttribute(ROOT_ATTR, '1');
      form.insertAdjacentElement('afterend', mount);
      const root = createRoot(mount);
      roots.set(mount, root);
      root.render(<TrackManagement />);
    }
  });

  roots.forEach((root, mount) => {
    if (!document.contains(mount)) {
      root.unmount();
      roots.delete(mount);
    }
  });
}

function scheduleSync() {
  window.setTimeout(mountManagement, 0);
  window.setTimeout(mountManagement, 80);
  window.setTimeout(mountManagement, 240);
}

function installGuestProgrammaticGuard() {
  if ((HTMLInputElement.prototype.click as any).__echostarsV161) return;
  const guarded = function(this: HTMLInputElement) {
    const isGuest = this.matches('[data-upload-guest-visibility="true"] input[type="checkbox"]');
    if (isGuest) {
      const form = this.closest('form');
      const heading = normalize(form?.closest('.upload-page')?.querySelector('h2')?.textContent);
      if (this.dataset.v161ManualGuestOff === '1') return;
      if (heading === '編輯音檔' && !this.checked && this.dataset.v161AutoGuestChange !== '1') return;
    }
    return originalInputClick.call(this);
  } as typeof HTMLInputElement.prototype.click;
  (guarded as any).__echostarsV161 = true;
  HTMLInputElement.prototype.click = guarded;
}

function installDetailTopNavigation() {
  if ((Element.prototype.scrollIntoView as any).__echostarsV161) return;
  const guarded = function(this: Element, arg?: boolean | ScrollIntoViewOptions) {
    if (this instanceof HTMLElement && this.id === 'audio-timeline') {
      window.scrollTo({ top: 0, behavior: 'auto' });
      return;
    }
    return originalScrollIntoView.call(this, arg as any);
  } as typeof Element.prototype.scrollIntoView;
  (guarded as any).__echostarsV161 = true;
  Element.prototype.scrollIntoView = guarded;
}

function installMenuDismissal() {
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const hamburger = document.querySelector<HTMLButtonElement>('[data-main-menu="hamburger"]');
    if (!hamburger || hamburger.getAttribute('aria-expanded') !== 'true') return;
    if (target.closest('[data-main-menu="hamburger"]')) return;
    if (target.closest('.navbar-menu-font-row, .navbar-menu-palette-shortcut')) return;

    window.queueMicrotask(() => {
      const current = document.querySelector<HTMLButtonElement>('[data-main-menu="hamburger"]');
      if (current?.getAttribute('aria-expanded') === 'true') current.click();
    });
  });
}

installGuestProgrammaticGuard();
installDetailTopNavigation();
installMenuDismissal();
installStyles();
scheduleSync();

window.addEventListener('pageshow', scheduleSync);
window.addEventListener('popstate', () => window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' })));
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;
  if (target.closest('button[title="跳轉編輯音檔視窗介面"], [data-main-menu="hamburger"], .v139-upload-tab, .v161-action, .navbar-menu-panel button')) scheduleSync();
  if (target.closest('button[title="跳轉編輯音檔視窗介面"]')) window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
}, true);