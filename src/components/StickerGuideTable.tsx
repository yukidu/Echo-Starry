import React, { useMemo, useState } from 'react';
import type { Track, UserProfile } from '../types';
import { buildStickerGuideRows, type StickerGuidePayload } from '../stickerGuidePolicy';

const guideCache = new Map<string, StickerGuidePayload>();

export function StickerGuideTable({ currentUser, tracks }: { currentUser: UserProfile; tracks: Track[] }) {
  const [expanded, setExpanded] = useState(false);
  const [guide, setGuide] = useState<StickerGuidePayload | null>(() => guideCache.get(currentUser.id) || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const rows = useMemo(() => guide ? buildStickerGuideRows(guide, tracks) : [], [guide, tracks]);

  const loadGuide = async () => {
    if (guide || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/stickers/guide');
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || '無法讀取貼紙規則');
      guideCache.set(currentUser.id, data.guide);
      setGuide(data.guide);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法讀取貼紙規則');
    } finally {
      setLoading(false);
    }
  };

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next && !guide && !loading) void loadGuide();
  };

  return <section className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800/60">
    <button type="button" onClick={toggle} aria-expanded={expanded} className="w-full px-3 py-3 flex items-center justify-between gap-3 text-left font-black">
      <span>如何獲得貼紙？</span>
      <span className="text-xs whitespace-nowrap" style={{color:'var(--color-primary,#c06c84)'}}>{expanded ? '▲收起' : '▼展開'}</span>
    </button>
    {expanded && <div className="border-t border-slate-200 dark:border-slate-700 p-2">
      {loading && <p role="status" className="py-4 text-center text-xs text-slate-400">讀取目前貼紙規則中…</p>}
      {error && <p role="alert" className="p-2 rounded-xl bg-rose-50 text-rose-700 text-xs">{error}</p>}
      {guide && <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-xs border-collapse">
          <thead><tr className="text-left text-slate-500 dark:text-slate-400"><th className="p-2">類型</th><th className="p-2">行為</th><th className="p-2 whitespace-nowrap">貼紙變化</th><th className="p-2">條件／限制</th></tr></thead>
          <tbody>{rows.map((row, index) => <tr key={`${row.kind}-${row.behavior}-${index}`} className="border-t border-slate-200 dark:border-slate-700 align-top">
            <td className="p-2 font-bold whitespace-nowrap">{row.kind}</td>
            <td className="p-2 font-bold">{row.behavior}</td>
            <td className={`p-2 text-base font-black whitespace-nowrap ${row.kind === '增加' ? 'text-red-500' : 'text-emerald-500'}`}>{row.amount}</td>
            <td className="p-2 leading-relaxed text-slate-600 dark:text-slate-300">{row.detail}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div>}
  </section>;
}
