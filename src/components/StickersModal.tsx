import { setFeedbackRules } from './StickerFeedback';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Trophy, X, History, SlidersHorizontal, ListChecks, PlusCircle, Search, ArrowUpRight, Copy, Share2 } from 'lucide-react';
import type { Track, UserProfile } from '../types';
import { formatStickerAmount, isPlatinumOrAboveRank } from '../../shared/stickers';
import { ThemedSelect } from './ThemedSelect';
import { StickerGuideTable } from './StickerGuideTable';

export type StickerSource = { kind: 'track' | 'member' | 'feature'; trackId?: string; commentId?: string; userId?: string; label: string; available: boolean };
type StickerTransaction = { id: string; delta: number; description: string; type: string; createdAt: number; source?: StickerSource | null };
type StickerSettings = { ratingReward: number; likeReward: number; keywordReward: number; keywordRewardLimit: number; commentThreadLimit: number; replyReward: number; luckyCost: number; vipUploadCost: number; profileReward:number; luckyCompleteReward:number; luckyDailyLimit:number; toastSeconds:number; profileHintSeconds:number; profileHintText:string; luckyHintText:string; platinumRankBaseReward?:number; platinumRankMultiplier?:number; emeraldRankReward?:number; diamondRankReward?:number };
type StickerSummary = { balance: number; transactions?: StickerTransaction[]; canGrant: boolean; isSuperAdmin: boolean };
interface StickersModalProps {
  isOpen: boolean; onClose: () => void; currentUser: UserProfile | null; tracks: Track[];
  initialSummary?: StickerSummary | null;
  onTracksUpdated?: (tracks: Track[]) => void; onStickerChanged?: () => void;
  onOpenSource?: (source: StickerSource) => void;
  onRequireProfileEdit?: () => void;
}
const historyCache = new Map<string, StickerTransaction[]>();
const field = 'w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100';
const primary = { backgroundColor: 'var(--color-primary,#c06c84)' };
const actions: Record<string,string> = {profile_reward:'完善個人資料',rank_approval_reward:'獎銜審核獎勵',lucky_complete_reward:'好手氣完聽獎勵',initial:'會員初始貼紙',rating_reward:'評價錄音',like_reward:'按讚錄音',keyword_reward:'新增網友關鍵字',comment_reward:'聽完後分享心得',reply_reward:'回覆他人心得',comment_like_reward:'按讚他人心得',comment_reward_reversal:'刪除心得扣回',track_unlock_cost:'解鎖錄音',vip_upload_cost:'建立私秘VIP',lucky_cost:'好手氣',manual_grant:'人工加貼紙',manual_grant_debit:'加發貼紙給下線'};
async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options); const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '操作失敗，請稍後再試');
  return data;
}
export const StickersModal: React.FC<StickersModalProps> = ({isOpen,onClose,currentUser,tracks,initialSummary,onTracksUpdated,onStickerChanged,onOpenSource,onRequireProfileEdit}) => {
  // Tabs are available from the signed-in profile immediately; every API still checks the live session.
  const superAdmin = currentUser?.email?.trim().toLowerCase() === 'yukidu@gmail.com' || currentUser?.role === '超級管理員';
  const canManageRules = superAdmin || Boolean(currentUser?.isAdminUser) || currentUser?.role === '管理員';
  const canGrant = superAdmin || Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));
  const canCreateDownlineInvite = Boolean(currentUser?.rankApproved && isPlatinumOrAboveRank(currentUser.approvedRank || currentUser.rank));
  const [summary,setSummary] = useState<StickerSummary | null>(initialSummary || null);
  const [tab,setTab] = useState<'history'|'grant'|'batch'|'rules'>('history');
  const [error,setError] = useState(''); const [busy,setBusy] = useState(false); const [loading,setLoading] = useState(true);
  const [settings,setSettings] = useState<StickerSettings | null>(null);
  const [targets,setTargets] = useState<UserProfile[]>([]); const [grantHistory,setGrantHistory] = useState<StickerTransaction[]>([]);
  const [targetSearch,setTargetSearch] = useState(''); const [targetUserId,setTargetUserId] = useState('');
  const [grantAmount,setGrantAmount] = useState('1'); const [grantReason,setGrantReason] = useState('');
  const [trackSearch,setTrackSearch] = useState(''); const [selectedTrackIds,setSelectedTrackIds] = useState<string[]>([]);
  const [batchUnlockCost,setBatchUnlockCost] = useState(''); const [batchCommentReward,setBatchCommentReward] = useState('');
  const [inviteInfo,setInviteInfo] = useState<{url:string;dealerId:string;displayName:string;kind:'platinum'|'diamond'} | null>(null);
  const [inviteBusy,setInviteBusy] = useState(false);
  const [inviteNotice,setInviteNotice] = useState('');
  const requestSequence = useRef(0); const mutationPending = useRef(false);
  const grantOperation = useRef<{signature:string;id:string} | null>(null);
  const notifyChanged = () => { onStickerChanged?.(); window.dispatchEvent(new CustomEvent('echostars:sticker-changed')); };
  const load = async () => {
    if (!currentUser) { setLoading(false); return; }
    const sequence = ++requestSequence.current;
    setLoading(true);
    try {
      // Paint the ledger independently; management requests never block the first page.
      const historyTask=requestJson('/api/stickers/history').then(data=>{if(sequence===requestSequence.current){historyCache.set(currentUser.id,data.transactions);setSummary(prev=>({...prev!,transactions:data.transactions}));}});
      const summaryTask=requestJson('/api/stickers/summary').then(data=>{if(sequence===requestSequence.current)setSummary(prev=>({...data,transactions:prev?.transactions}));});
      const grantsTask=canGrant?requestJson('/api/stickers/grant-targets').then(data=>{if(sequence===requestSequence.current)setTargets(data.targets || []);}):Promise.resolve();
      const rulesTask=canManageRules?requestJson('/api/stickers/settings').then(data=>{if(sequence===requestSequence.current)setSettings(data.settings);}):Promise.resolve();
      const outgoingTask=canGrant?requestJson('/api/stickers/grant-history').then(data=>{if(sequence===requestSequence.current)setGrantHistory(data.transactions || []);}):Promise.resolve();
      await Promise.all([historyTask.then(()=>{if(sequence===requestSequence.current)setLoading(false);}),summaryTask,grantsTask,rulesTask,outgoingTask]);
      // Recovery runs after the history is visible, then refreshes it without blanking it.
      await requestJson('/api/stickers/reconcile',{method:'POST'});
      const fresh=await requestJson('/api/stickers/history');
      if(sequence===requestSequence.current){historyCache.set(currentUser.id,fresh.transactions);setSummary(prev=>({...prev!,transactions:fresh.transactions}));}
      notifyChanged();
    } catch (reason) { if (sequence === requestSequence.current) setError(reason instanceof Error ? reason.message : '無法讀取貼紙資料'); }
    finally { if (sequence === requestSequence.current) setLoading(false); }
  };
  useEffect(() => { if (isOpen) { setTab('history'); setError(''); setSummary({...initialSummary!,transactions:historyCache.get(currentUser?.id || '')}); void load(); } return () => {requestSequence.current += 1;}; }, [isOpen,currentUser?.id]);
  const filteredTracks = useMemo(() => tracks.filter(track => [track.title,track.speaker,track.series].some(value => String(value || '').toLocaleLowerCase('zh-Hant').includes(trackSearch.trim().toLocaleLowerCase('zh-Hant')))),[tracks,trackSearch]);
  const filteredTargets = useMemo(() => targets.filter(target => target.name.toLocaleLowerCase('zh-Hant').includes(targetSearch.trim().toLocaleLowerCase('zh-Hant'))),[targets,targetSearch]);
  if (!isOpen) return null;
  const mutate = async (action: () => Promise<void>) => {
    if (mutationPending.current) return;
    mutationPending.current = true; setBusy(true); setError('');
    try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : '操作失敗，請重試'); }
    finally { mutationPending.current = false; setBusy(false); }
  };
  const grant = () => mutate(async () => {
    if (!targetUserId || !grantReason.trim()) throw new Error('請選擇下線並填寫加貼紙原因');
    const signature = JSON.stringify([targetUserId,grantAmount,grantReason.trim()]);
    if (grantOperation.current?.signature !== signature) grantOperation.current = {signature,id:crypto.randomUUID()};
    await requestJson('/api/stickers/grant',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetUserId,amount:Number(grantAmount),reason:grantReason.trim(),operationId:grantOperation.current.id})});
    grantOperation.current=null;setGrantReason('');setTargetUserId('');await load();notifyChanged();
  });
  const batch = () => mutate(async () => {
    if (!selectedTrackIds.length || (batchUnlockCost === '' && batchCommentReward === '')) throw new Error('請勾選錄音並選擇要修改的貼紙欄位');
    const data=await requestJson('/api/stickers/tracks/batch',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({trackIds:selectedTrackIds,stickerUnlockCost:batchUnlockCost===''?undefined:Number(batchUnlockCost),commentStickerReward:batchCommentReward===''?undefined:Number(batchCommentReward)})});
    onTracksUpdated?.(data.tracks || []);setSelectedTrackIds([]);setBatchUnlockCost('');setBatchCommentReward('');
  });
  const saveRules = () => mutate(async () => {
    const data=await requestJson('/api/stickers/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(settings)});
    setSettings(data.settings);setFeedbackRules(data.settings);notifyChanged();
  });
  const copyText = async (text: string) => {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
    const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.appendChild(input);input.select();document.execCommand('copy');input.remove();
  };
  const ensureInviteInfo = async () => {
    if (!currentUser?.amwayId?.trim()) { onRequireProfileEdit?.(); return null; }
    if (inviteInfo) return inviteInfo;
    setInviteBusy(true);setInviteNotice('');setError('');
    try {
      const data=await requestJson('/api/organization/invite-link');
      const info={url:String(data.url||''),dealerId:String(data.dealerId||''),displayName:String(data.displayName||currentUser.name||''),kind:data.kind as 'platinum'|'diamond'};
      setInviteInfo(info);return info;
    } catch(reason) { setError(reason instanceof Error?reason.message:'無法產生專屬網址');return null; }
    finally { setInviteBusy(false); }
  };
  const copyInvite = async () => {
    const info=await ensureInviteInfo();if(!info)return;
    try { await copyText(info.url);setInviteNotice('專屬網址已複製'); } catch { setError('無法複製網址，請再試一次'); }
  };
  const shareInvite = async () => {
    const info=await ensureInviteInfo();if(!info)return;
    const text=`點開連結並登入繁星回聲，即可綁定成為 ${info.displayName} 的下線。`;
    try {
      if (navigator.share) await navigator.share({title:'綁定成為我下線',text,url:info.url});
      else { await copyText(info.url);setInviteNotice('此裝置沒有分享選單，已幫您複製網址'); }
    } catch(reason:any) { if (reason?.name!=='AbortError') setError('分享失敗，請再試一次'); }
  };
  const transactions = (rows: StickerTransaction[]) => <div className="space-y-1">
    {loading && !rows.length ? <p role="status" className="text-center text-slate-400 py-4">載入紀錄中…</p> : !rows.length ? <p className="text-center text-slate-400 py-4">目前沒有紀錄</p> : rows.map(tx => <div key={tx.id} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700">
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[10px] text-slate-500 dark:text-slate-400">{actions[tx.type] || tx.type}</p>
        <button type="button" disabled={!tx.source?.available} onClick={() => tx.source && onOpenSource?.(tx.source)} className="text-left text-xs font-bold break-words hover:underline disabled:no-underline disabled:cursor-default" style={{color:'var(--color-primary,#c06c84)'}}>
          {tx.source?.label || tx.description}{tx.source?.available && <ArrowUpRight className="inline w-3 h-3 ml-0.5" />}
        </button>
        {tx.type === 'manual_grant' && <p className="text-[11px] text-slate-600 dark:text-slate-300 break-words">{tx.description}</p>}
        {tx.source && !tx.source.available && <span className="text-[10px] text-slate-400">（來源已移除）</span>}
        <p className="text-[10px] text-slate-400">{new Date(tx.createdAt).toLocaleString('zh-TW')}</p>
      </div>
      <strong className={`text-2xl font-normal tabular-nums leading-none shrink-0 ${tx.delta >= 0 ? 'text-red-500' : 'text-emerald-500'}`}>{tx.delta>=0?'+':''}{formatStickerAmount(tx.delta)}<span className="text-xs">張貼紙</span></strong>
    </div>)}
  </div>;
  const tabs = [{id:'history',label:'貼紙紀錄',Icon:History},...(canGrant?[{id:'grant',label:'人工加貼紙',Icon:PlusCircle}]:[]),...(superAdmin?[{id:'batch',label:'批次修改',Icon:ListChecks}]:[]),...(canManageRules?[{id:'rules',label:'其他規則',Icon:SlidersHorizontal}]:[])] as const;
  return <div className="sticker-page w-full min-h-[70dvh]">
    <div role="region" aria-labelledby="sticker-book-title" className="w-full overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex flex-col">
      <div className="px-4 py-3 flex items-center justify-between text-white shrink-0" style={primary}><h2 id="sticker-book-title" className="font-black text-lg flex items-center gap-2"><Trophy className="w-5 h-5"/>我的貼紙簿</h2><button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-white/20" aria-label="關閉"><X className="w-5 h-5"/></button></div>
      {!currentUser ? <div className="p-8 text-center font-bold">我的貼紙是會員專屬功能，請先登入。</div> : <>
        <div role="tablist" aria-label="貼紙簿分頁" className={`grid ${tabs.length>2?'grid-cols-2 sm:grid-cols-4':tabs.length>1?'grid-cols-2':'grid-cols-1'} gap-1 p-2 border-b border-slate-100 dark:border-slate-800 shrink-0`}>
          {tabs.map(({id,label,Icon})=><button role="tab" aria-selected={tab===id} key={id} type="button" onClick={()=>setTab(id as typeof tab)} className={`px-2 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1 whitespace-nowrap ${tab===id?'text-white':'text-slate-600 dark:text-slate-300'}`} style={tab===id?primary:undefined}><Icon className="w-4 h-4 shrink-0"/>{label}</button>)}
        </div>
        <div role="tabpanel" className="overflow-y-auto min-h-0 p-3 space-y-3 text-sm text-slate-800 dark:text-slate-100">
          {error && <div role="alert" className="p-2 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 text-xs">{error}</div>}
          {tab==='history' && <><StickerGuideTable currentUser={currentUser} tracks={tracks}/><div className="rounded-2xl p-3 text-white text-center" style={primary}><p className="text-xs">目前可用貼紙</p><p className="text-4xl font-black mt-1">{summary?formatStickerAmount(summary.balance):'—'} 張</p></div><h3 className="font-black">來源與消耗紀錄</h3>{transactions(summary?.transactions || [])}</>}
          {tab==='grant' && canGrant && <div className="space-y-3">
            {canCreateDownlineInvite && <section aria-label="綁定成為我下線" className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2 bg-slate-50 dark:bg-slate-800/60">
              <div><h3 className="font-black">綁定成為我下線</h3><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">分享您的專屬網址。已登入會員點開後，系統會依您或夫妻共同事業體的最高已審核獎銜，自動綁定上手白金或上手鑽石。</p></div>
              {currentUser?.amwayId?.trim() ? <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs break-all"><p className="font-bold">直銷商編號：{currentUser.amwayId.trim()}</p>{inviteInfo?.displayName && <p className="text-slate-500 mt-0.5">共同顯示：{inviteInfo.displayName}</p>}{inviteInfo?.url && <p className="text-slate-500 mt-1">{inviteInfo.url}</p>}</div> : <button type="button" onClick={onRequireProfileEdit} className="w-full rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">請先填寫基本資料的「直銷商編號」</button>}
              {inviteNotice && <p role="status" className="text-xs font-bold text-emerald-600">{inviteNotice}</p>}
              <div className="grid grid-cols-2 gap-2"><button type="button" disabled={inviteBusy} onClick={()=>void copyInvite()} className="py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50" style={primary}><Copy className="w-4 h-4"/>複製網址</button><button type="button" disabled={inviteBusy} onClick={()=>void shareInvite()} className="py-2.5 rounded-xl text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50" style={primary}><Share2 className="w-4 h-4"/>傳 LINE 或 APP</button></div>
            </section>}
            {!superAdmin && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 px-3 py-2 text-xs leading-relaxed">加發給下線的貼紙會從你自己的餘額扣除。目前可用：<strong>{formatStickerAmount(summary?.balance || 0)} 張</strong>。</div>}
            <input aria-label="搜尋下線名字" value={targetSearch} onChange={e=>setTargetSearch(e.target.value)} placeholder={superAdmin?'搜尋會員名字':'搜尋下線名字'} className={field}/>
            <ThemedSelect aria-label="選擇下線" value={targetUserId} onChange={e=>setTargetUserId(e.target.value)} className={field}><option value="">{superAdmin?'選擇會員':'選擇下線'}</option>{filteredTargets.map(target=><option key={target.id} value={target.id}>{target.name}（{target.approvedRank || target.rank || '會員'}）</option>)}</ThemedSelect>
            <label className="block font-bold">加貼紙張數<ThemedSelect value={grantAmount} onChange={e=>setGrantAmount(e.target.value)} className={`${field} mt-1`}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n} 張</option>)}</ThemedSelect></label>
            <textarea aria-label="加貼紙原因" value={grantReason} onChange={e=>setGrantReason(e.target.value)} placeholder="加貼紙原因（必填）" rows={4} maxLength={500} className={`${field} resize-y min-h-28`}/>
            <button type="button" disabled={busy||loading} onClick={grant} className="w-full py-2.5 rounded-xl text-white font-bold disabled:opacity-50" style={primary}>確認加貼紙</button>
            <h3 className="font-black">所有加貼紙紀錄</h3>{transactions(grantHistory)}
          </div>}
          {tab==='batch' && superAdmin && <div className="space-y-3">
            <div className="relative"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input aria-label="搜尋錄音" value={trackSearch} onChange={e=>setTrackSearch(e.target.value)} placeholder="搜尋錄音標題、講者、系列" className={`${field} pl-9`}/></div>
            <div className="grid grid-cols-2 gap-2">{([['解鎖本錄音所需貼紙',batchUnlockCost,setBatchUnlockCost,50],['心得獲得貼紙',batchCommentReward,setBatchCommentReward,20]] as const).map(([label,value,setValue,max])=><label key={label} className="text-xs font-bold">{label}<ThemedSelect value={value} onChange={e=>setValue(e.target.value)} className={`${field} mt-1`}><option value="">不修改</option>{Array.from({length:max+1},(_,n)=><option key={n} value={n}>{n} 張</option>)}</ThemedSelect></label>)}</div>
            <div className="flex items-center gap-3 font-bold text-xs" style={{color:'var(--color-primary,#c06c84)'}}><button type="button" onClick={()=>setSelectedTrackIds(prev=>[...new Set([...prev,...filteredTracks.map(t=>t.id)])])}>全選{trackSearch?'搜尋結果':''}</button><button type="button" onClick={()=>setSelectedTrackIds([])}>取消全選</button><span className="ml-auto">已選 {selectedTrackIds.length} 筆</span></div>
            <div className="max-h-72 overflow-y-auto space-y-1 border border-slate-200 dark:border-slate-700 rounded-2xl p-2">{filteredTracks.map(track=><label key={track.id} className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"><input type="checkbox" checked={selectedTrackIds.includes(track.id)} onChange={e=>setSelectedTrackIds(prev=>e.target.checked?[...prev,track.id]:prev.filter(id=>id!==track.id))}/><div className="min-w-0 flex-1"><p className="font-bold text-xs">{track.speaker}{track.speakerRank==='無'?'':track.speakerRank}-{track.title}</p><p className="text-[10px] text-slate-400">解鎖 {track.stickerUnlockCost || 0}｜心得 +{track.commentStickerReward || 0}</p></div></label>)}</div>
            <button type="button" disabled={busy||!selectedTrackIds.length} onClick={batch} className="w-full py-2.5 rounded-xl text-white font-bold disabled:opacity-50" style={primary}>套用批次修改（{selectedTrackIds.length} 筆）</button>
          </div>}
          {tab==='rules' && canManageRules && (settings?<form className="space-y-3" onSubmit={e=>{e.preventDefault();void saveRules();}}>
            {([{title:'獲取貼紙',items:[['評價','ratingReward'],['按讚（錄音或他人心得）','likeReward'],['新增網友關鍵字','keywordReward'],['每人每支錄音關鍵字獎勵上限','keywordRewardLimit'],['同篇心得區可獲得貼紙總上限（本人心得＋回覆他人留言）','commentThreadLimit'],['回覆他人心得','replyReward']]},{title:'消耗貼紙',items:[['好手氣','luckyCost'],['上傳私秘VIP','vipUploadCost']]}] as const).map(group=><div key={group.title} className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 p-3 space-y-3 border border-slate-200 dark:border-slate-700"><h3 className="font-black">{group.title}</h3>{group.items.map(([label,key])=><label key={key} className="flex items-center justify-between gap-3 text-xs font-bold"><span className="leading-snug">{label}</span><span className="flex items-center gap-1 shrink-0"><input aria-label={label} type="number" min="0" max="1000" step="0.1" required value={Number.isNaN(settings[key])?'':settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value===''?NaN:Number(e.target.value)})} className={`${field} !w-20 !px-2`}/>張</span></label>)}</div>)}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3"><h3 className="font-bold">個人資料、好手氣與提示</h3>{([
              ['完整個人資料獎勵','profileReward','張'],['好手氣完聽額外獎勵','luckyCompleteReward','張'],['好手氣每日領取上限','luckyDailyLimit','次'],['全站貼紙異動提示秒數','toastSeconds','秒'],['資料未填完整提示秒數','profileHintSeconds','秒']
            ] as const).map(([label,key,unit])=><label key={key} className="flex justify-between items-center gap-2 text-xs"><span>{label}</span><span><input aria-label={label} required type="number" min={unit==='秒'?0.1:0} max={unit==='秒'?60:1000} step={unit==='次'?1:0.1} value={Number.isNaN(settings[key])?'':settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value===''?NaN:Number(e.target.value)})} className={`${field} !w-24`}/> {unit}</span></label>)}
              {([['未填完整提示文字','profileHintText'],['好手氣提示文字','luckyHintText']] as const).map(([label,key])=><label key={key} className="block text-xs">{label}（用 {'{x}'} 代入張數）<textarea required maxLength={500} rows={3} value={settings[key]} onChange={e=>setSettings({...settings,[key]:e.target.value})} className={`${field} mt-1`}/></label>)}
              <p className="text-xs text-slate-500">完善資料每會員領一次。好手氣抽中尚未聽完的錄音，當日聽完可領；同一錄音不重複領取，每日依台灣時間計算。好手氣答案會固定顯示在抽中卡片上方，點畫面任意處才關閉。</p>
            </div>
            {superAdmin && <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-3"><h3 className="font-bold">白金以上獎銜審核獎勵</h3>
              {([['白金基礎獎勵','platinumRankBaseReward','張'],['白金獎勵倍數','platinumRankMultiplier','倍'],['翡翠以上審核獎勵','emeraldRankReward','張'],['鑽石以上審核獎勵','diamondRankReward','張']] as const).map(([label,key,unit])=><label key={key} className="flex justify-between items-center gap-2 text-xs"><span>{label}</span><span><input aria-label={label} required type="number" min="0" max={unit==='倍'?100:1000} step="0.1" value={Number.isNaN(Number(settings[key]))?'':settings[key] ?? ''} onChange={e=>setSettings({...settings,[key]:e.target.value===''?NaN:Number(e.target.value)})} className={`${field} !w-24`}/> {unit}</span></label>)}
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs">目前白金實際發放：<strong>{formatStickerAmount(Number(settings.platinumRankBaseReward || 0) * Number(settings.platinumRankMultiplier || 0))} 張</strong></div>
              <p className="text-xs text-slate-500">同一會員同一級別只發一次；升到更高級別審核通過時再發該級別獎勵，降級後不會重複領取較低級別獎勵。既有符合會員由系統一次性補發目前最高符合級別。</p>
            </div>}
            <button type="submit" disabled={busy} className="w-full py-2.5 rounded-xl text-white font-bold disabled:opacity-50" style={primary}>儲存貼紙規則</button>
          </form>:<p role="status" className="text-center text-slate-400 py-4">載入規則中…</p>)}
        </div>
      </>}
    </div>
  </div>;
};
