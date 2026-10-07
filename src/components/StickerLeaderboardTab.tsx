import React, { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles } from 'lucide-react';
import type { UserProfile } from '../types';

interface StickerLeaderboardEntry {
  user: { id: string; name: string; rank: string; avatar?: string; center?: string };
  current: number;
  spent: number;
  earned: number;
}

interface StickerLeaderboardResponse {
  entries?: StickerLeaderboardEntry[];
  suggestions?: string[];
  error?: string;
}

interface StickerLeaderboardTabProps {
  users: UserProfile[];
  onViewMember?: (user: UserProfile) => void;
}

function amount(value: number) {
  return Number(value || 0).toLocaleString('zh-TW', { maximumFractionDigits: 1 });
}

function rankBadge(index: number) {
  const common = 'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black font-mono shadow-xs';
  if (index === 0) return <span className={`${common} bg-amber-400 text-amber-950`}>1</span>;
  if (index === 1) return <span className={`${common} bg-slate-300 text-slate-800`}>2</span>;
  if (index === 2) return <span className={`${common} bg-amber-700 text-white`}>3</span>;
  return <span className={`${common} bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300`}>{index + 1}</span>;
}

export const StickerLeaderboardTab: React.FC<StickerLeaderboardTabProps> = ({ users, onViewMember }) => {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<StickerLeaderboardEntry[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams();
        if (query.trim()) params.set('q', query.trim());
        const suffix = params.toString();
        const response = await fetch(`/api/stickers/leaderboard${suffix ? `?${suffix}` : ''}`, {
          signal: controller.signal,
          credentials: 'same-origin'
        });
        const data: StickerLeaderboardResponse = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || '無法讀取貼紙排位賽');
        setEntries(Array.isArray(data.entries) ? data.entries : []);
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions.slice(0, 8) : []);
      } catch (caught: any) {
        if (caught?.name !== 'AbortError') setError(caught?.message || '無法讀取貼紙排位賽');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, query.trim() ? 220 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const usersById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const openMember = (entry: StickerLeaderboardEntry) => {
    if (!onViewMember) return;
    const full = usersById.get(entry.user.id);
    if (full) onViewMember(full);
  };

  return (
    <div className="space-y-4">
      <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
        <div>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>貼紙排位賽</span>
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">依現有貼紙數排序，最多顯示 20 名</p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            placeholder="搜尋會員基本資料關鍵字"
            className="w-full h-11 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-10 pr-3 text-sm text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-200 dark:focus:ring-rose-900/50"
            aria-label="搜尋貼紙排位賽會員"
          />
          {focused && query.trim() && suggestions.length > 0 && (
            <div className="absolute z-30 left-0 right-0 top-[calc(100%+6px)] rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg p-1.5 max-h-56 overflow-auto">
              {suggestions.map(item => (
                <button
                  key={item}
                  type="button"
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => { setQuery(item); setFocused(false); }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-3 sm:p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs">
        <div className="hidden sm:grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(92px,0.7fr))] gap-2 px-3 pb-2 text-[10px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-800">
          <span>會員</span><span className="text-right">現有貼紙</span><span className="text-right">累積已消費</span><span className="text-right">累積已獲得</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-400">讀取貼紙排位中…</div>
        ) : error ? (
          <div className="py-12 text-center text-sm text-rose-500">{error}</div>
        ) : entries.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">找不到符合條件的會員</div>
        ) : (
          <div className="space-y-2 pt-2">
            {entries.map((entry, index) => (
              <div key={entry.user.id} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(92px,0.7fr))] gap-2 sm:items-center p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <div className="flex items-center gap-2.5 min-w-0">
                  {rankBadge(index)}
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                    <img src={entry.user.avatar || '/icon-192.png'} alt={entry.user.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button type="button" onClick={() => openMember(entry)} className="font-bold text-sm text-slate-800 dark:text-slate-100 hover:text-rose-600 dark:hover:text-rose-400 transition-colors text-left" title="點擊查看會員資訊卡">
                        {entry.user.name}
                      </button>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">{entry.user.rank || '無'}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{entry.user.center || '無會場'}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 sm:contents">
                  <div className="sm:text-right rounded-xl sm:rounded-none bg-white/70 dark:bg-slate-900/40 sm:bg-transparent sm:dark:bg-transparent px-2 py-1.5 sm:p-0"><div className="sm:hidden text-[9px] text-slate-400">現有</div><div className="font-black font-mono text-sm text-amber-600 dark:text-amber-400">{amount(entry.current)}</div></div>
                  <div className="sm:text-right rounded-xl sm:rounded-none bg-white/70 dark:bg-slate-900/40 sm:bg-transparent sm:dark:bg-transparent px-2 py-1.5 sm:p-0"><div className="sm:hidden text-[9px] text-slate-400">已消費</div><div className="font-bold font-mono text-sm text-emerald-600 dark:text-emerald-400">{amount(entry.spent)}</div></div>
                  <div className="sm:text-right rounded-xl sm:rounded-none bg-white/70 dark:bg-slate-900/40 sm:bg-transparent sm:dark:bg-transparent px-2 py-1.5 sm:p-0"><div className="sm:hidden text-[9px] text-slate-400">已獲得</div><div className="font-bold font-mono text-sm text-rose-600 dark:text-rose-400">{amount(entry.earned)}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
