import React, { useEffect, useMemo, useState } from 'react';
import { Gift, X, History, SlidersHorizontal, ListChecks, PlusCircle, Search } from 'lucide-react';
import type { Track, UserProfile } from '../types';
import { formatStickerAmount } from '../../shared/stickers';
import { ThemedSelect } from './ThemedSelect';

type StickerTransaction = {
  id: string;
  delta: number;
  balanceAfter: number;
  description: string;
  type: string;
  createdAt: number;
};

type StickerSettings = {
  ratingReward: number;
  likeReward: number;
  keywordReward: number;
  keywordRewardLimit: number;
  luckyCost: number;
  vipUploadCost: number;
};

type StickerSummary = {
  balance: number;
  transactions: StickerTransaction[];
  canGrant: boolean;
  isSuperAdmin: boolean;
};

interface StickersModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  tracks: Track[];
  onTracksUpdated?: (tracks: Track[]) => void;
  onStickerChanged?: () => void;
}

const TENTH_OPTIONS = Array.from({ length: 10 }, (_, index) => (index + 1) / 10);
const WHOLE_OPTIONS = Array.from({ length: 21 }, (_, index) => index);

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '操作失敗，請稍後再試');
  return data;
}

export const StickersModal: React.FC<StickersModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  tracks,
  onTracksUpdated,
  onStickerChanged
}) => {
  const [summary, setSummary] = useState<StickerSummary | null>(null);
  const [tab, setTab] = useState<'history' | 'batch' | 'rules'>('history');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState<StickerSettings | null>(null);
  const [targets, setTargets] = useState<UserProfile[]>([]);
  const [targetUserId, setTargetUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState('1');
  const [grantReason, setGrantReason] = useState('');
  const [trackSearch, setTrackSearch] = useState('');
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [batchUnlockCost, setBatchUnlockCost] = useState('');
  const [batchCommentReward, setBatchCommentReward] = useState('');

  const notifyChanged = () => {
    onStickerChanged?.();
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
  };

  const loadSummary = async () => {
    if (!currentUser) {
      setSummary(null);
      return;
    }
    try {
      const data = await requestJson('/api/stickers/me');
      setSummary(data);
      setError('');
      if (data.canGrant) {
        const grantData = await requestJson('/api/stickers/grant-targets');
        setTargets(Array.isArray(grantData.targets) ? grantData.targets : []);
      } else {
        setTargets([]);
      }
      if (data.isSuperAdmin) {
        const settingsData = await requestJson('/api/stickers/settings');
        setSettings(settingsData.settings);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法讀取貼紙資料');
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    setTab('history');
    void loadSummary();
  }, [isOpen, currentUser?.id]);

  const filteredTracks = useMemo(() => {
    const query = trackSearch.trim().toLocaleLowerCase('zh-Hant');
    if (!query) return tracks;
    return tracks.filter(track => [track.title, track.speaker, track.series]
      .some(value => String(value || '').toLocaleLowerCase('zh-Hant').includes(query)));
  }, [tracks, trackSearch]);

  if (!isOpen) return null;

  const grantStickers = async () => {
    if (!targetUserId || !grantReason.trim()) {
      setError('請選擇會員並填寫加貼紙原因');
      return;
    }
    setBusy(true);
    try {
      await requestJson('/api/stickers/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId,
          amount: Number(grantAmount),
          reason: grantReason.trim(),
          operationId: crypto.randomUUID()
        })
      });
      setGrantReason('');
      setTargetUserId('');
      await loadSummary();
      notifyChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加貼紙失敗');
    } finally {
      setBusy(false);
    }
  };

  const saveBatch = async () => {
    if (!selectedTrackIds.length) {
      setError('請先勾選至少一筆錄音');
      return;
    }
    if (batchUnlockCost === '' && batchCommentReward === '') {
      setError('請至少選一個要修改的貼紙欄位');
      return;
    }
    setBusy(true);
    try {
      const data = await requestJson('/api/stickers/tracks/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trackIds: selectedTrackIds,
          stickerUnlockCost: batchUnlockCost === '' ? undefined : Number(batchUnlockCost),
          commentStickerReward: batchCommentReward === '' ? undefined : Number(batchCommentReward)
        })
      });
      if (Array.isArray(data.tracks)) onTracksUpdated?.(data.tracks);
      setSelectedTrackIds([]);
      setBatchUnlockCost('');
      setBatchCommentReward('');
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批次修改失敗');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const data = await requestJson('/api/stickers/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      setSettings(data.settings);
      setError('');
      notifyChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '貼紙規則儲存失敗');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[190] bg-black/60 backdrop-blur-sm flex items-center justify-center p-3" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="w-full max-w-2xl max-h-[88vh] overflow-hidden rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">
        <div className="px-4 py-3 flex items-center justify-between text-white" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>
          <div className="flex items-center gap-2">
            <Gift className="w-5 h-5" />
            <div>
              <h2 className="font-black">我的貼紙{currentUser && summary ? `${formatStickerAmount(summary.balance)}張` : ''}</h2>
              <p className="text-[10px] text-white/80">累積學習互動，解鎖更多錄音</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/20" aria-label="關閉"><X className="w-5 h-5" /></button>
        </div>

        {!currentUser ? (
          <div className="p-8 text-center space-y-3">
            <Gift className="w-12 h-12 mx-auto text-slate-300" />
            <h3 className="font-black text-slate-800 dark:text-slate-100">我的貼紙是會員專屬功能</h3>
            <p className="text-sm text-slate-500">登入會員後可獲得初始 6 張貼紙，並查看完整獲得與使用紀錄。</p>
          </div>
        ) : (
          <>
            <div className={`grid ${summary?.isSuperAdmin ? 'grid-cols-3' : 'grid-cols-1'} gap-1 p-2 border-b border-slate-100 dark:border-slate-800`}>
              <button type="button" onClick={() => setTab('history')} className={`px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${tab === 'history' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} style={tab === 'history' ? { backgroundColor: 'var(--color-primary,#c06c84)' } : undefined}><History className="w-4 h-4" />貼紙紀錄</button>
              {summary?.isSuperAdmin && <button type="button" onClick={() => setTab('batch')} className={`px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${tab === 'batch' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} style={tab === 'batch' ? { backgroundColor: 'var(--color-primary,#c06c84)' } : undefined}><ListChecks className="w-4 h-4" />批次修改</button>}
              {summary?.isSuperAdmin && <button type="button" onClick={() => setTab('rules')} className={`px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${tab === 'rules' ? 'text-white' : 'text-slate-600 dark:text-slate-300'}`} style={tab === 'rules' ? { backgroundColor: 'var(--color-primary,#c06c84)' } : undefined}><SlidersHorizontal className="w-4 h-4" />更多貼紙規則</button>}
            </div>

            <div className="overflow-y-auto p-4 space-y-4 text-sm">
              {error && <div className="p-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs">{error}</div>}

              {tab === 'history' && (
                <>
                  <div className="rounded-2xl p-4 text-white shadow-sm" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>
                    <p className="text-xs text-white/80">目前可用貼紙</p>
                    <p className="text-3xl font-black mt-1">{summary ? formatStickerAmount(summary.balance) : '—'} 張</p>
                  </div>

                  {summary?.canGrant && (
                    <div className="rounded-2xl border border-amber-200 dark:border-slate-700 p-3 space-y-2 bg-amber-50/50 dark:bg-slate-800/50">
                      <div className="font-black flex items-center gap-1"><PlusCircle className="w-4 h-4" />人工加貼紙</div>
                      <ThemedSelect value={targetUserId} onChange={event => setTargetUserId(event.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        <option value="">選擇會員</option>
                        {targets.map(target => <option key={target.id} value={target.id}>{target.name}（{target.rank || '會員'}）</option>)}
                      </ThemedSelect>
                      <div className="grid grid-cols-[110px_1fr] gap-2">
                        <ThemedSelect value={grantAmount} onChange={event => setGrantAmount(event.target.value)} className="px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                          {Array.from({ length: 200 }, (_, index) => (index + 1) / 10).map(value => <option key={value} value={value}>{formatStickerAmount(value)} 張</option>)}
                        </ThemedSelect>
                        <input value={grantReason} onChange={event => setGrantReason(event.target.value)} placeholder="加貼紙原因（必填）" maxLength={120} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" />
                      </div>
                      <button type="button" disabled={busy} onClick={grantStickers} className="w-full py-2 rounded-xl text-white font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>確認加貼紙</button>
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <h3 className="font-black text-slate-800 dark:text-slate-100">來源與消耗紀錄</h3>
                    {!summary?.transactions?.length ? <p className="text-slate-400 text-xs py-4">目前沒有貼紙紀錄</p> : summary.transactions.map(transaction => (
                      <div key={transaction.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-xs text-slate-700 dark:text-slate-200 break-words">{transaction.description}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{new Date(transaction.createdAt).toLocaleString('zh-TW')}</p>
                        </div>
                        <div className={`font-black tabular-nums ${transaction.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{transaction.delta >= 0 ? '+' : ''}{formatStickerAmount(transaction.delta)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {tab === 'batch' && summary?.isSuperAdmin && (
                <div className="space-y-3">
                  <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={trackSearch} onChange={event => setTrackSearch(event.target.value)} placeholder="搜尋錄音標題、講者、系列" className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900" /></div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-bold">解鎖本錄音所需貼紙<ThemedSelect value={batchUnlockCost} onChange={event => setBatchUnlockCost(event.target.value)} className="mt-1 w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"><option value="">不修改</option>{WHOLE_OPTIONS.map(value => <option key={value} value={value}>{value} 張</option>)}</ThemedSelect></label>
                    <label className="text-xs font-bold">心得獲得貼紙<ThemedSelect value={batchCommentReward} onChange={event => setBatchCommentReward(event.target.value)} className="mt-1 w-full px-2 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"><option value="">不修改</option>{WHOLE_OPTIONS.map(value => <option key={value} value={value}>{value} 張</option>)}</ThemedSelect></label>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-2xl p-2">
                    {filteredTracks.map(track => {
                      const checked = selectedTrackIds.includes(track.id);
                      return <label key={track.id} className="flex items-center gap-2 p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"><input type="checkbox" checked={checked} onChange={() => setSelectedTrackIds(prev => checked ? prev.filter(id => id !== track.id) : [...prev, track.id])} /><div className="min-w-0 flex-1"><p className="font-bold text-xs truncate">{track.title}</p><p className="text-[10px] text-slate-400">{track.speaker}｜解鎖 {track.stickerUnlockCost || 0}｜心得 +{track.commentStickerReward || 0}</p></div></label>;
                    })}
                  </div>
                  <button type="button" disabled={busy || !selectedTrackIds.length} onClick={saveBatch} className="w-full py-2 rounded-xl text-white font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>套用批次修改（{selectedTrackIds.length} 筆）</button>
                </div>
              )}

              {tab === 'rules' && summary?.isSuperAdmin && settings && (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-emerald-50/60 dark:bg-slate-800/70 p-3 space-y-2 border border-emerald-100 dark:border-slate-700">
                    <h3 className="font-black">賺取貼紙</h3>
                    {([['評價', 'ratingReward'], ['按讚', 'likeReward'], ['新增網友關鍵字', 'keywordReward']] as const).map(([label, key]) => <label key={key} className="flex items-center justify-between gap-3 text-xs font-bold"><span>{label}</span><ThemedSelect value={settings[key]} onChange={event => setSettings({ ...settings, [key]: Number(event.target.value) })} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">{TENTH_OPTIONS.map(value => <option key={value} value={value}>{value.toFixed(1)} 張</option>)}</ThemedSelect></label>)}
                    <label className="flex items-center justify-between gap-3 text-xs font-bold"><span>每人每支錄音關鍵字獎勵上限</span><ThemedSelect value={settings.keywordRewardLimit} onChange={event => setSettings({ ...settings, keywordRewardLimit: Number(event.target.value) })} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">{Array.from({ length: 20 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value} 次</option>)}</ThemedSelect></label>
                  </div>
                  <div className="rounded-2xl bg-rose-50/60 dark:bg-slate-800/70 p-3 space-y-2 border border-rose-100 dark:border-slate-700">
                    <h3 className="font-black">消耗貼紙</h3>
                    {([['好手氣', 'luckyCost'], ['上傳私秘VIP', 'vipUploadCost']] as const).map(([label, key]) => <label key={key} className="flex items-center justify-between gap-3 text-xs font-bold"><span>{label}</span><ThemedSelect value={settings[key]} onChange={event => setSettings({ ...settings, [key]: Number(event.target.value) })} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">{TENTH_OPTIONS.map(value => <option key={value} value={value}>{value.toFixed(1)} 張</option>)}</ThemedSelect></label>)}
                  </div>
                  <button type="button" disabled={busy} onClick={saveSettings} className="w-full py-2 rounded-xl text-white font-bold disabled:opacity-50" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>儲存貼紙規則</button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
