import { SpeakerNameLink } from './SpeakerNameLink';
import React, { useRef, useState } from 'react';
import { Play, Pause, ArrowUp, Home, X } from 'lucide-react';
import { Track, PlayerDisplayMode } from '../types';
import { formatTime } from '../utils/audio';

interface MiniPlayerProps {
  track: Track;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  playerMode: PlayerDisplayMode;
  onSetPlayerMode: (mode: PlayerDisplayMode) => void;
  onTogglePlay: () => void;
  onSeek: (seconds: number) => void;
  onSkip: (seconds: number) => void;
  onChangeSpeed: (speed: number) => void;
  onScrollToTop: () => void;
  onReturnHome: () => void;
  onClose: () => void;
}

export const MiniPlayer: React.FC<MiniPlayerProps> = ({
  track,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  playerMode,
  onSetPlayerMode,
  onTogglePlay,
  onSeek,
  onSkip,
  onChangeSpeed,
  onScrollToTop,
  onReturnHome,
  onClose
}) => {
  const safeDuration = duration > 0 ? duration : (track.durationSeconds || 600);

  // Requirement 14: 記憶播放器狀態，維持浮動狀態，不會因點擊或切換而強制跳回底部播放器
  const [position, setPosition] = useState<{left:number;top:number}|null>(null);
  const drag = useRef<{x:number;y:number;left:number;top:number}|null>(null);

  return (
    <div
      data-echostars-media-session="1"
      data-media-track-id={track.id}
      data-media-title={track.title}
      data-media-artist={`${track.speaker}${track.speakerRank ? ` ${track.speakerRank}` : ''}`}
      data-media-artwork={track.speakerAvatar || '/icon-512.png'}
      onClick={() => onSetPlayerMode('expanded')}
      style={position ? { left: position.left, top: position.top, bottom: 'auto', right: 'auto' } : undefined}
      className="fixed bottom-5 right-2 sm:right-4 z-[70] flex items-center gap-1.5 max-w-[calc(100vw-8px)]"
    >
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onScrollToTop(); }}
        aria-label="回到頁面最前面"
        title="回到頁面最前面"
        className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-[var(--color-primary)] active:scale-95"
      >
        <ArrowUp size={20} />
      </button>
      <button
        type="button"
        onClick={e => { e.stopPropagation(); onReturnHome(); }}
        aria-label="返回首頁清單"
        title="返回首頁清單"
        className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center justify-center text-[var(--color-primary)] active:scale-95"
      >
        <Home size={20} />
      </button>

      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-700 shadow-2xl rounded-full p-1.5 pl-2 pr-2.5 flex items-center gap-2 hover:shadow-rose-500/15 transition-all group/bubble min-w-0">
        <button
          type="button"
          data-echostars-media-toggle="1"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePlay();
          }}
          className="relative cursor-pointer group shrink-0 focus:outline-hidden"
          title={isPlaying ? '點擊照片暫停' : '點擊照片播放'}
        >
          <div
            className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden shadow-md ${isPlaying ? 'animate-spin-slow' : ''}`}
            style={{
              '--spin-duration': `${8 / Math.max(0.2, playbackRate)}s`,
              boxShadow: '0 0 0 3px var(--color-primary, #c06c84), 0 6px 16px rgba(15,23,42,0.18)'
            } as React.CSSProperties}
          >
            <img src={track.speakerAvatar} alt={track.speaker} className="w-full h-full object-cover" />
          </div>

          <div className="absolute inset-0 rounded-full flex items-center justify-center pointer-events-none">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/35 backdrop-blur-[1px] flex items-center justify-center shadow-md">
              {isPlaying ? (
                <Pause className="w-4 h-4 sm:w-5 sm:h-5 fill-white text-white" />
              ) : (
                <Play className="w-4 h-4 sm:w-5 sm:h-5 fill-white text-white ml-0.5" />
              )}
            </div>
          </div>
        </button>

        <div
          className="max-w-[90px] sm:max-w-[160px] select-none min-w-0 cursor-pointer"
          title="點擊開啟此音檔的播放時間軸"
        >
          <p className="text-xs font-bold text-[var(--color-primary,#c06c84)] truncate transition-colors">
            {track.title}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
            <SpeakerNameLink name={track.speaker}/>{track.speakerRank || ''}
          </p>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(safeDuration)}
          </p>
        </div>

        <button
          onClick={e => e.stopPropagation()}
          aria-label="按住移動播放器"
          className="touch-none cursor-grab px-2 self-stretch"
          onPointerDown={e => {
            const r = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
            drag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
            e.currentTarget.setPointerCapture(e.pointerId);
          }}
          onPointerMove={e => {
            const d = drag.current;
            if (!d) return;
            const r = e.currentTarget.parentElement!.parentElement!.getBoundingClientRect();
            setPosition({
              left: Math.max(8, Math.min(window.innerWidth - r.width - 8, d.left + e.clientX - d.x)),
              top: Math.max(8, Math.min(window.innerHeight - r.height - 8, d.top + e.clientY - d.y))
            });
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        >
          ⠿
        </button>
      </div>

      <button
        type="button"
        onClick={e => { e.stopPropagation(); onClose(); }}
        aria-label="關閉迷你播放器"
        title="關閉迷你播放器"
        className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-full bg-white/95 dark:bg-slate-900/95 border border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-700 shadow-lg flex items-center justify-center text-slate-500 dark:text-slate-300 hover:text-[var(--color-primary,#c06c84)] active:scale-95 transition-colors"
      >
        <X size={22} strokeWidth={2.5} />
      </button>
    </div>
  );
};
