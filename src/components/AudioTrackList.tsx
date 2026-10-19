import React,{useEffect,useMemo,useState} from 'react';
import {Edit2,Search,Trash2,X,Users,UserRound} from 'lucide-react';
import {SpeakerNameLink} from './SpeakerNameLink';
import type {Track,UserProfile} from '../types';
import '../audioWorkspace.css';
const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
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

export function AudioTrackList({mode,currentUser,onEditTrack,onDeleted}:{
 mode:'mine'|'community';currentUser:UserProfile|null;onEditTrack:(track:Track)=>void;onDeleted?:(id:string)=>void;
}) {
  const user=currentUser;
  const superAdmin = isSuperAdmin(user);
  const [tracks, setTracks] = useState<Track[]>(readTracks);
  const [members, setMembers] = useState<UserProfile[]>([]);
  const [query, setQuery] = useState('');
  const [memberQuery, setMemberQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [relisteningId, setRelisteningId] = useState<string | null>(null);
  const [transcriptStatuses, setTranscriptStatuses] = useState<Record<string, TranscriptProgressItem>>({});
  const [transcriptStatusesReady, setTranscriptStatusesReady] = useState(false);

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
      onDeleted?.(track.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗，請稍後再試。');
      setDeletingId(null);
    }
  };

  const relistenTrack = async (track: Track) => {
    if (!superAdmin || relisteningId || ['pending','queued','processing'].includes(transcriptStatuses[track.id]?.status)) return;
    setError('');
    setRelisteningId(track.id);
    try {
      const response = await fetch(`/api/v281/transcript-management/relisten/${encodeURIComponent(track.id)}`, {
        method: 'POST',
        credentials: 'same-origin'
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || '重聽逐字稿失敗');
      setTranscriptStatuses(previous => ({
        ...previous,
        [track.id]: { trackId: track.id, status: 'pending', error: null, updatedAt: Date.now() }
      }));
      setTranscriptStatusesReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '無法啟動逐字稿重聽');
    } finally {
      setRelisteningId(null);
    }
  };

  if (!user) return null;

  return (
    <section className="v138-track-management" data-v161-track-management="1" aria-label="音檔管理">
      <div className="v161-manage-toolbar">
        <div className={`v161-search-row ${superAdmin && mode === 'community' ? 'has-member-search' : ''}`}>
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
        </div>
      </div>

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
            const relistenBusy = relisteningId === track.id || ['pending','queued','processing'].includes(transcriptItem?.status || '');
            const transcriptBadge = superAdmin && transcriptStatusesReady && normalize(track.audioUrl)
              ? transcriptProgressPresentation(transcriptItem)
              : null;
            return (
              <div className="v161-track-row" key={track.id}>
                <div className="min-w-0">
                  <div className="v161-track-title">{track.title || '未命名音檔'}</div>
                  <div className="v161-track-meta">{track.speaker ? <SpeakerNameLink name={track.speaker}/> : '未設定講者'}{speakerRank} · {permission} · 上傳 {formatDate(track.uploadDate)}</div>
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
                  <button type="button" className="v161-action v161-edit" onClick={() => onEditTrack(track)}><Edit2 className="h-3.5 w-3.5" />編輯</button>
                  {superAdmin && normalize(track.audioUrl) && (
                    <button type="button" className="v161-action v161-relisten"
                      onClick={() => void relistenTrack(track)} disabled={relistenBusy}
                      title={relistenBusy ? '此音檔已在排隊或正在重聽' : 'AI 重新聆聽原始音檔，產生完整原音逐字稿'}>
                      {relistenBusy ? '正在重聽逐字稿' : '重聽逐字稿'}
                    </button>
                  )}
                  <button type="button" className="v161-action v161-delete" onClick={() => void deleteTrack(track)}><Trash2 className="h-3.5 w-3.5" />{deletingId === track.id ? '再按一次確認' : '刪除'}</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </section>
  );
}

