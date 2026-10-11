import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bookmark, EyeOff, RotateCcw, ChevronRight } from 'lucide-react';
import type { Track, UserProfile } from '../types';

const FAVORITES_KEY = 'echostars_favorite_track_ids_v1';
const PRODUCTION_HOST = 'echostars.yukidu.workers.dev';
const PREVIEW_STORAGE_PREFIX = 'preview-disliked-speakers-v2';

interface FavoritesViewProps {
  tracks: Track[];
  currentUser: UserProfile | null;
  onSelectTrack: (track: Track) => void;
}

function readFavoriteIds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function isPreviewHost() {
  const host = window.location.hostname;
  return host !== PRODUCTION_HOST && host.endsWith('-echostars.yukidu.workers.dev');
}

function previewStorageKey(currentUser: UserProfile | null) {
  const identity = String(currentUser?.id || currentUser?.email || 'preview-guest').trim().toLowerCase();
  return `${PREVIEW_STORAGE_PREFIX}:${identity}`;
}

function readPreviewHiddenSpeakers(currentUser: UserProfile | null) {
  try {
    const parsed = JSON.parse(localStorage.getItem(previewStorageKey(currentUser)) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(String).map(name => name.trim()).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

export const FavoritesView: React.FC<FavoritesViewProps> = ({ tracks, currentUser, onSelectTrack }) => {
  const [favoriteIds, setFavoriteIds] = useState<string[]>(readFavoriteIds);
  const [hiddenSpeakers, setHiddenSpeakers] = useState<string[]>([]);
  const [busySpeaker, setBusySpeaker] = useState('');

  const favoriteTracks = useMemo(() => {
    const ids = new Set(favoriteIds);
    return tracks.filter(track => ids.has(String(track.id)));
  }, [favoriteIds, tracks]);

  const loadHiddenSpeakers = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (isPreviewHost()) {
      setHiddenSpeakers(readPreviewHiddenSpeakers(currentUser));
      return;
    }
    if (!currentUser) {
      setHiddenSpeakers([]);
      return;
    }
    try {
      const response = await fetch('/api/member-hidden-speakers', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`hidden speakers: ${response.status}`);
      const data = await response.json().catch(() => ({}));
      const speakers = Array.isArray(data?.speakers) ? data.speakers : [];
      setHiddenSpeakers(speakers.map(String).map((name: string) => name.trim()).filter(Boolean));
    } catch (error) {
      console.warn('Failed to load hidden speakers:', error);
    }
  }, [currentUser]);

  useEffect(() => {
    void loadHiddenSpeakers();
    const syncFavorites = () => setFavoriteIds(readFavoriteIds());
    const syncHidden = () => void loadHiddenSpeakers();
    window.addEventListener('echostars-favorites-changed', syncFavorites as EventListener);
    window.addEventListener('echostars:member-hidden-speakers-changed', syncHidden as EventListener);
    window.addEventListener('storage', syncFavorites);
    window.addEventListener('storage', syncHidden);
    return () => {
      window.removeEventListener('echostars-favorites-changed', syncFavorites as EventListener);
      window.removeEventListener('echostars:member-hidden-speakers-changed', syncHidden as EventListener);
      window.removeEventListener('storage', syncFavorites);
      window.removeEventListener('storage', syncHidden);
    };
  }, [loadHiddenSpeakers]);

  const cancelHiddenSpeaker = async (speakerName: string) => {
    if (!speakerName || busySpeaker) return;
    setBusySpeaker(speakerName);
    try {
      if (isPreviewHost()) {
        const next = readPreviewHiddenSpeakers(currentUser).filter(name => name !== speakerName);
        localStorage.setItem(previewStorageKey(currentUser), JSON.stringify(next));
        setHiddenSpeakers(next);
      } else {
        const response = await fetch(`/api/member-hidden-speakers/${encodeURIComponent(speakerName)}`, {
          method: 'DELETE',
          credentials: 'same-origin'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || '取消隱藏失敗');
        setHiddenSpeakers(prev => prev.filter(name => name !== speakerName));
      }
      window.dispatchEvent(new CustomEvent('echostars:member-hidden-speakers-changed', {
        detail: { speakerName, hidden: false }
      }));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '取消隱藏失敗，請稍後再試。');
    } finally {
      setBusySpeaker('');
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--theme-border-subtle,#f1e7ea)] bg-white/95 dark:bg-slate-900/95 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <Bookmark className="w-5 h-5 text-[var(--color-primary,#c06c84)]" />
          <div>
            <h1 className="text-xl font-black text-slate-900 dark:text-white">我的收藏</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">收藏的音檔與個人隱藏設定</p>
          </div>
        </div>

        <div className="p-4 space-y-3">
          <h2 className="text-sm font-black text-slate-800 dark:text-slate-100">收藏音檔</h2>
          {favoriteTracks.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              尚未收藏音檔
            </div>
          ) : (
            <div className="space-y-2">
              {favoriteTracks.map(track => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onSelectTrack(track)}
                  className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-3 flex items-center gap-3 text-left hover:border-[var(--color-primary,#c06c84)] transition-colors"
                >
                  <img src={track.speakerAvatar} alt="" className="w-12 h-12 rounded-xl object-cover bg-slate-100 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-black text-slate-900 dark:text-white truncate">{track.title}</span>
                    <span className="block text-sm text-slate-500 dark:text-slate-400 truncate">{track.speaker}</span>
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--theme-border-subtle,#f1e7ea)] bg-white/95 dark:bg-slate-900/95 shadow-sm overflow-hidden">
        <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <EyeOff className="w-5 h-5 text-[var(--color-primary,#c06c84)]" />
          <div>
            <h2 className="text-base font-black text-slate-900 dark:text-white">已隱藏的演講者</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">可隨時取消隱藏</p>
          </div>
        </div>

        <div className="p-4">
          {hiddenSpeakers.length === 0 ? (
            <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              目前沒有隱藏的演講者
            </div>
          ) : (
            <div className="space-y-2">
              {hiddenSpeakers.map(speakerName => (
                <div key={speakerName} className="rounded-2xl border border-slate-200 dark:border-slate-700 px-3 py-3 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[var(--color-light-pill,#fae8ed)] flex items-center justify-center shrink-0">
                    <EyeOff className="w-4 h-4 text-[var(--color-primary,#c06c84)]" />
                  </div>
                  <span className="min-w-0 flex-1 font-black text-slate-900 dark:text-white truncate">{speakerName}</span>
                  <button
                    type="button"
                    onClick={() => void cancelHiddenSpeaker(speakerName)}
                    disabled={busySpeaker === speakerName}
                    className="shrink-0 min-h-10 px-3.5 rounded-xl border border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)] text-sm font-black hover:bg-[var(--color-light-pill,#fae8ed)] disabled:opacity-50"
                  >
                    <span className="inline-flex items-center gap-1.5"><RotateCcw className="w-4 h-4" />{busySpeaker === speakerName ? '處理中…' : '取消隱藏'}</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
