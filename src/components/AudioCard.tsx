import React, { useEffect, useRef, useState } from 'react';
import { Star, MessageSquare, Heart, Clock, Lock, MoreVertical, Share2, Bookmark, Info } from 'lucide-react';
import { Track } from '../types';
import { AudioMemory } from '../utils/audio';
import './AudioCard.css';

const FAVORITES_KEY = 'echostars_favorite_track_ids_v1';

function readFavoriteIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function writeFavoriteIds(ids: string[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); } catch {}
}

interface AudioCardProps {
  track: Track;
  isPlaying: boolean;
  isCurrentTrack: boolean;
  canAccess: boolean;
  progressMemory?: AudioMemory | null;
  liveCurrentTime?: number;
  liveDuration?: number;
  userRating?: number;
  hasLiked?: boolean;
  isVipUnlocked?: boolean;
  tutorialTarget?: boolean;
  commentRewardClaimed?: boolean;
  onClick: () => void;
  onTogglePlay?: (anchor?: HTMLElement) => void;
  onRate?: (score: number) => void;
  onToggleLike?: () => void;
  onSeek?: (seconds: number) => void;
  onOpenCommentPreview?: () => void;
}

export const AudioCard: React.FC<AudioCardProps> = ({
  track,
  isPlaying,
  isCurrentTrack,
  canAccess,
  progressMemory,
  liveCurrentTime,
  liveDuration,
  userRating = 0,
  hasLiked = false,
  isVipUnlocked = true,
  tutorialTarget = false,
  commentRewardClaimed = false,
  onClick,
  onTogglePlay,
  onRate,
  onToggleLike,
  onSeek,
  onOpenCommentPreview
}) => {
  const categories = Array.isArray(track.categories)
    ? track.categories.map(cat => String(cat || '').trim()).filter(Boolean)
    : [];

  const isGuest = (() => {
    if (typeof window === 'undefined') return false;
    try { return !window.localStorage.getItem('sq_current_user_v1'); }
    catch { return true; }
  })();

  const safeDuration = (liveDuration && liveDuration > 0)
    ? liveDuration
    : (progressMemory && progressMemory.duration > 0)
    ? progressMemory.duration
    : (track.durationSeconds || 600);
  const currentTime = liveCurrentTime !== undefined
    ? liveCurrentTime
    : (progressMemory?.currentTime || 0);
  const progressRatio = safeDuration > 0 ? currentTime / safeDuration : 0;
  const isCompleted = progressMemory?.completed || progressRatio >= 0.95;

  const displayRequiredRank = track.isPrivateVip
    ? '私秘VIP'
    : (!track.requiredRank || track.requiredRank === '無' || track.requiredRank === '公開'
      ? '公開'
      : track.requiredRank);

  const speakerDisplay = `${track.speaker}${track.speakerRank || ''}`;
  const displayDuration =
    Number.isFinite(Number(track.durationSeconds)) && Number(track.durationSeconds) > 0
      ? `約 ${Math.max(1, Math.round(Number(track.durationSeconds) / 60))} 分鐘`
      : (track.duration || '時間待確認');

  const stickerUnlockCost = Math.max(0, Number(track.stickerUnlockCost || 0));
  const permissionStickerLabel = stickerUnlockCost > 0
    ? `${displayRequiredRank}│-${stickerUnlockCost}張貼紙`
    : displayRequiredRank;
  const hasReadAccess = canAccess && isVipUnlocked;
  const guestProgressPercent = isCompleted ? 100 : Math.max(0, Math.min(100, Math.round(progressRatio * 100)));

  const [moreOpen, setMoreOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [isFavorite, setIsFavorite] = useState(() => readFavoriteIds().includes(track.id));
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsFavorite(readFavoriteIds().includes(track.id));
  }, [track.id]);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [moreOpen]);

  const handlePlayClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (onTogglePlay) onTogglePlay(e.currentTarget);
  };

  const toggleFavorite = (event: React.MouseEvent) => {
    event.stopPropagation();
    const ids = new Set(readFavoriteIds());
    if (ids.has(track.id)) ids.delete(track.id);
    else ids.add(track.id);
    const next = Array.from(ids);
    writeFavoriteIds(next);
    setIsFavorite(ids.has(track.id));
    setMoreOpen(false);
    window.dispatchEvent(new CustomEvent('echostars-favorites-changed', { detail: { trackId: track.id, favorite: ids.has(track.id) } }));
  };

  const openDetails = (event: React.MouseEvent) => {
    event.stopPropagation();
    setMoreOpen(false);
    onClick();
  };

  const resolveShareSlug = async () => {
    const provided = String((track as Track & { shareSlug?: string }).shareSlug || '').trim();
    const cacheKey = `echostars_share_slug_${track.id}`;
    let cached = '';
    try { cached = localStorage.getItem(cacheKey) || ''; } catch {}
    if (provided || cached) return provided || cached;
    const response = await fetch(`/api/tracks/${encodeURIComponent(track.id)}/share-slug`, { method: 'POST' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.shareSlug) throw new Error(data?.error || '建立分享連結失敗');
    const slug = String(data.shareSlug);
    try { localStorage.setItem(cacheKey, slug); } catch {}
    return slug;
  };

  const handleShare = async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (shareBusy) return;
    setShareBusy(true);
    try {
      const slug = await resolveShareSlug();
      const shareUrl = `${window.location.origin}/share/${slug}`;
      const shareText = `${track.speaker}《${track.title}》`;
      if (navigator.share) {
        try {
          await navigator.share({ title: track.categories?.[0] || track.category || '演講', text: shareText, url: shareUrl });
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
          await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
        }
      } else {
        await navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
      }
      try {
        if (localStorage.getItem('sq_current_user_v1')) {
          void fetch('/api/share-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId: track.id })
          });
        }
      } catch {}
      setMoreOpen(false);
    } catch (error) {
      console.warn('Failed to share track:', error);
    } finally {
      setShareBusy(false);
    }
  };

  return (
    <div
      data-track-id={track.id}
      data-speaker={track.speaker}
      onClick={onClick}
      className={`audio-card group relative w-full rounded-2xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs border transition-all duration-200 cursor-pointer overflow-visible py-2.5 pl-2.5 pr-2.5 sm:py-3 sm:pl-3 sm:pr-3 shadow-2xs hover:shadow-md hover:-translate-y-0.5 ${
        isCurrentTrack
          ? 'border-[var(--color-primary,#c06c84)] dark:border-[var(--color-primary,#c06c84)] ring-2 ring-[var(--color-light-pill,#fae8ed)]'
          : 'border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 hover:border-[var(--color-primary,#c06c84)] dark:hover:border-slate-700'
      }`}
    >
      <div ref={moreRef} className="absolute right-2 top-2 z-50">
        <button
          type="button"
          aria-label="更多功能"
          aria-expanded={moreOpen}
          title="更多功能"
          onClick={event => {
            event.stopPropagation();
            setMoreOpen(open => !open);
          }}
          className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-white/90 dark:bg-slate-800/95 border border-slate-200/80 dark:border-slate-700 text-slate-500 dark:text-slate-300 shadow-sm hover:text-[var(--color-primary,#c06c84)] hover:border-[var(--color-primary,#c06c84)] transition-colors"
        >
          <MoreVertical className="w-4.5 h-4.5" />
        </button>
        {moreOpen && (
          <div className="absolute right-0 top-9 w-40 overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/98 dark:bg-slate-900/98 shadow-2xl backdrop-blur-xl py-1.5" onClick={event => event.stopPropagation()}>
            <button type="button" onClick={handleShare} disabled={shareBusy} className="w-full px-3 py-2.5 flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-[var(--color-light-pill,#fae8ed)] dark:hover:bg-slate-800 disabled:opacity-50">
              <Share2 className="w-4 h-4 text-[var(--color-primary,#c06c84)]" />
              <span>{shareBusy ? '準備分享中…' : '分享音檔'}</span>
            </button>
            <button type="button" onClick={openDetails} className="w-full px-3 py-2.5 flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-[var(--color-light-pill,#fae8ed)] dark:hover:bg-slate-800">
              <Info className="w-4 h-4 text-[var(--color-primary,#c06c84)]" />
              <span>詳細內容</span>
            </button>
            <button type="button" onClick={toggleFavorite} className="w-full px-3 py-2.5 flex items-center gap-2.5 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-[var(--color-light-pill,#fae8ed)] dark:hover:bg-slate-800">
              <Bookmark className={`w-4 h-4 text-[var(--color-primary,#c06c84)] ${isFavorite ? 'fill-[var(--color-primary,#c06c84)]' : ''}`} />
              <span>{isFavorite ? '取消收藏' : '加入收藏'}</span>
            </button>
          </div>
        )}
      </div>

      <div className={`flex items-start gap-3 sm:gap-4 transition-opacity ${hasReadAccess ? 'opacity-100' : 'opacity-25'}`}>
        <div className="shrink-0 w-28 sm:w-32">
          <button
            type="button"
            data-tutorial-target={tutorialTarget ? 'first-track-photo' : undefined}
            onClick={handlePlayClick}
            className="relative block w-28 h-28 sm:w-32 sm:h-32 rounded-2xl overflow-hidden bg-black/20 dark:bg-slate-800 shadow-sm text-left"
            title={isPlaying ? '點擊照片暫停' : '點擊照片播放'}
            aria-label={isPlaying ? '暫停播放' : '開始播放'}
          >
            <img
              src={track.speakerAvatar}
              alt={track.speaker}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />

            {isGuest ? (
              guestProgressPercent > 0 ? (
                <div
                  className="absolute top-0 inset-x-0 text-white text-[7px] sm:text-[8px] font-black text-center px-1 py-1 whitespace-nowrap flex items-center justify-center z-30 shadow-2xs leading-none"
                  style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                >
                  <span className="whitespace-nowrap">已聽{guestProgressPercent}%</span>
                </div>
              ) : null
            ) : isCompleted ? (
              <div
                className="absolute top-0 inset-x-0 text-white text-[7px] sm:text-[8px] font-black text-center px-1 py-1 whitespace-nowrap flex items-center justify-center z-30 shadow-2xs leading-none"
                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
              >
                <span className="whitespace-nowrap">[已聽100%]{commentRewardClaimed ? '已發' : '寫心得'}<span className="text-red-500">+{track.commentStickerReward || 0}</span><span className="text-white">張貼紙</span></span>
              </div>
            ) : progressRatio > 0 ? (
              <div
                className="absolute top-0 inset-x-0 text-white text-[7px] sm:text-[8px] font-black text-center px-1 py-1 z-30 shadow-2xs whitespace-nowrap leading-none"
                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
              >
                <span className="whitespace-nowrap">已聽{Math.round(progressRatio * 100)}%｜聽完<span className="text-red-500">+{track.commentStickerReward || 0}</span><span className="text-white">張貼紙</span></span>
              </div>
            ) : <div className="absolute top-0 inset-x-0 z-30 bg-black/50 text-center py-1 text-[7px] sm:text-[8px] leading-none text-white whitespace-nowrap">寫心得<span className="text-red-500">+{track.commentStickerReward || 0}</span><span className="text-white">張貼紙</span></div>}

            <div
              className="absolute bottom-0 inset-x-0 z-30 flex items-center justify-center gap-0.5 bg-black/45 px-1 py-1 text-[7px] sm:text-[8px] leading-none font-black text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)] whitespace-nowrap"
              title={`收聽權限：${isGuest ? displayRequiredRank : permissionStickerLabel}`}
            >
              {displayRequiredRank !== '公開' && <Lock className="w-2.5 h-2.5 shrink-0" />}
              <span className="whitespace-nowrap">{displayRequiredRank}{!isGuest && stickerUnlockCost>0 && <>｜<span className="text-emerald-300">-{stickerUnlockCost}</span><span className="text-white">張貼紙</span></>}</span>
            </div>
          </button>

          <div className="mt-1 flex items-center justify-center gap-1 text-[9px] sm:text-[10px] leading-none text-slate-500 dark:text-slate-400 font-mono whitespace-nowrap">
            <Clock className="w-2.5 h-2.5 shrink-0" />
            <span>{displayDuration}</span>
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col self-stretch pr-7 sm:pr-8">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-[1.02] truncate group-hover:text-[var(--color-primary,#c06c84)] transition-colors" title={track.title}>
              {track.title}
            </h3>

            <p className="font-bold text-sm sm:text-base leading-tight text-slate-700 dark:text-slate-200 mt-1 truncate" title={speakerDisplay}>
              {speakerDisplay}
            </p>

            {categories.length > 0 && (
              <div className="flex flex-nowrap items-center gap-1 mt-2 w-full overflow-hidden">
                {categories.slice(0, 3).map((cat, idx) => {
                  const isNewcomer = cat.trim() === '新人';
                  return (
                    <span
                      key={idx}
                      className={`inline-flex w-fit max-w-[32%] shrink-0 box-border text-[9px] sm:text-[10px] leading-none font-semibold px-2 py-1 rounded-full border text-center truncate whitespace-nowrap ${isNewcomer ? 'newcomer-rainbow-border' : ''}`}
                      style={{
                        backgroundColor: 'var(--color-light-pill, #fae8ed)',
                        color: 'var(--color-primary, #c06c84)',
                        borderColor: isNewcomer ? undefined : 'var(--theme-border-subtle, #f1e7ea)'
                      }}
                      title={cat}
                    >
                      {cat}
                    </span>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-auto pt-2 flex flex-col items-start gap-1.5 border-t border-slate-100 dark:border-slate-800">
            <div
              className="flex items-center flex-nowrap gap-[2px] min-w-0 order-2"
              onClick={e => e.stopPropagation()}
              title={hasReadAccess ? '點擊星星評分' : '無閱讀權限，無法評價'}
            >
              {[1, 2, 3, 4, 5].map(starNum => {
                const isRated = (userRating || 0) > 0;
                const isFilled = isRated && (userRating || 0) >= starNum;
                return (
                  <button
                    key={starNum}
                    type="button"
                    disabled={!hasReadAccess}
                    onClick={() => hasReadAccess && onRate && onRate(starNum)}
                    aria-label={hasReadAccess ? `評分 ${starNum} 星` : '無閱讀權限，無法評價'}
                    aria-pressed={userRating === starNum}
                    className={`rating-star p-0.5 transition-transform shrink-0 ${hasReadAccess ? 'hover:scale-125 cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <Star
                      className={`w-4.5 h-4.5 sm:w-5 sm:h-5 ${
                        isFilled
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 dark:text-slate-600'
                      }`}
                    />
                  </button>
                );
              })}
              <span className="text-sm font-black text-slate-700 dark:text-slate-300 ml-1 tabular-nums whitespace-nowrap">
                {(track.rating || 0).toFixed(1)}
                <span className="text-slate-400 font-semibold ml-1">({track.ratingCount || 0})</span>
              </span>
            </div>

            <div className="flex items-center gap-2.5 sm:gap-3 text-sm leading-none text-slate-600 dark:text-slate-400 order-1">
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (onOpenCommentPreview) onOpenCommentPreview();
                }}
                className="reaction-button inline-flex items-center gap-1.5 hover:text-[var(--color-primary,#c06c84)] transition-colors py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 font-bold"
                title="點擊預覽心得"
              >
                <MessageSquare className="w-5 h-5 text-slate-400 shrink-0" />
                <span>心得 {track.commentsCount}</span>
              </button>

              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  if (onToggleLike) onToggleLike();
                }}
                className="reaction-button inline-flex items-center gap-1.5 hover:scale-105 transition-transform py-1 font-bold"
                title="點擊切換喜愛"
                aria-label={hasLiked ? '收回按讚' : '按讚'}
                aria-pressed={hasLiked}
              >
                <Heart
                  className="w-5 h-5 transition-colors shrink-0"
                  style={{
                    color: hasLiked ? 'var(--color-primary, #c06c84)' : undefined,
                    fill: hasLiked ? 'var(--color-primary, #c06c84)' : 'none'
                  }}
                />
                <span
                  style={{
                    color: hasLiked ? 'var(--color-primary, #c06c84)' : undefined,
                    fontWeight: 'bold'
                  }}
                >
                  按讚 {track.likes}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};