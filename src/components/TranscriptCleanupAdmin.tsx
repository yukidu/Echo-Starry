import React, {useEffect,useState} from 'react';
import {DEFAULT_CLEANUP_POLICY, type CleanupPolicy} from '../../shared/transcriptCleanupPolicy';
type History = {version:number;createdAt:number;createdBy:string};
const field='w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent p-2 text-sm';
const request=async(path:string,init?:RequestInit)=>{
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(data.error||'設定處理失敗');
  return data;
};
const encode=(body:unknown):RequestInit=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
export const TranscriptCleanupAdmin:React.FC=()=>{
  const [open,setOpen]=useState(false);
  const [policy,setPolicy]=useState<CleanupPolicy>({...DEFAULT_CLEANUP_POLICY});
  const [version,setVersion]=useState(1);
  const [history,setHistory]=useState<History[]>([]);
  const [previewText,setPreviewText]=useState('呃，我我我覺得，那個問題非常非常重要。然後我們繼續努力。');
  const [preview,setPreview]=useState<{before:string;after:string;note?:string}|null>(null);
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState('');
  const [restoreVersion,setRestoreVersion]=useState('1');
  const load=async()=>{
    setBusy(true);try{
      const data=await request('/api/v281/transcript-cleanup');
      setPolicy(data.policy);setVersion(data.version);
      setHistory(data.history||[]);setRestoreVersion(String(data.history?.[0]?.version||1));setNotice('');
    }catch(e){setNotice(e instanceof Error?e.message:'無法讀取規則');}
    finally{setBusy(false);}
  };
  useEffect(()=>{if(open)void load();},[open]);
  const setWordList=(name:'fillerWords'|'keepWords'|'conditionalWords',value:string)=>{
    setPolicy(p=>({...p,[name]:value.split(/[\n,，]/).map(x=>x.trim()).filter(Boolean)}));
    setPreview(null);
  };
  const runPreview=async()=>{
    setBusy(true);setNotice('');
    try{const data=await request('/api/v281/transcript-cleanup/preview',encode({policy,text:previewText}));setPreview(data);}
    catch(e){setNotice(e instanceof Error?e.message:'預覽失敗');}finally{setBusy(false);}
  };
  const save=async(next:CleanupPolicy,label:string)=>{
    setBusy(true);setNotice('');
    try{
      const r=await request('/api/v281/transcript-cleanup',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({policy:next,expectedVersion:version})});
      setVersion(r.version);setPolicy(r.policy);setPreview(null);setNotice(label+'成功，版本 v'+r.version+'。只影響往後新產生的逐字稿。');
      const status=await request('/api/v281/transcript-cleanup');
      setHistory(status.history||[]);setRestoreVersion(String(status.history?.[0]?.version||1));
    }catch(e){setNotice(e instanceof Error?e.message:'儲存失敗');}finally{setBusy(false);}
  };
  const restoreHistorical=async()=>{
    if(!window.confirm('確定恢復版本 v'+restoreVersion+' 的口語淨化設定嗎？原始逐字稿不受影響。'))return;
    setBusy(true);setNotice('');
    try{
      const r=await request('/api/v281/transcript-cleanup/restore',encode({targetVersion:Number(restoreVersion),expectedVersion:version}));
      setPolicy(r.policy);setVersion(r.version);setPreview(null);setNotice('已還原並建立新設定版本 v'+r.version);
      const fresh=await request('/api/v281/transcript-cleanup');setHistory(fresh.history||[]);
    }catch(e){setNotice(e instanceof Error?e.message:'還原失敗');}finally{setBusy(false);}
  };
  return <section className="rounded-xl border border-rose-200 dark:border-rose-900 p-3 space-y-3" aria-label="口語淨化規則">
    <button type="button" className="w-full flex items-center justify-between text-left font-black" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
      <span>口語淨化規則（C1 智慧清理）</span><span>{open?'▲ 收起':'▼ 編輯規則'}</span>
    </button>
    {open&&<div className="space-y-3 text-sm">
      <p className="text-xs text-slate-500">超級管理員專用。只清理顯示文字，原始逐字稿、字幕時間、會員訂正與電池紀錄都保留。調整規則不會自動重寫舊音檔。</p>
      <p className="text-xs font-bold">目前設定版本：v{version}</p>
      {notice&&<p role="status" className="text-rose-600 font-semibold text-xs">{notice}</p>}
      <label className="flex items-center gap-2"><input type="checkbox" checked={policy.enabled} onChange={e=>setPolicy(p=>({...p,enabled:e.target.checked}))}/>啟用 C1 智慧口語淨化</label>
      <label className="block font-bold">自動刪除的明顯贅詞（每行一個）<textarea aria-label="自動刪除詞" rows={3} className={field} value={policy.fillerWords.join('\n')} onChange={e=>setWordList('fillerWords',e.target.value)}/></label>
      <label className="block font-bold">必須保留的詞（優先於刪除規則）<textarea aria-label="保留詞" rows={3} className={field} value={policy.keepWords.join('\n')} onChange={e=>setWordList('keepWords',e.target.value)}/></label>
      <label className="block font-bold">交由 AI 判斷的口頭語（有意義就不刪）<textarea aria-label="語意判斷詞" rows={3} className={field} value={policy.conditionalWords.join('\n')} onChange={e=>setWordList('conditionalWords',e.target.value)}/></label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={policy.removeStutters} onChange={e=>setPolicy(p=>({...p,removeStutters:e.target.checked}))}/>清理明顯口吃（例如「我我我覺得」）</label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={policy.semanticJudgment} onChange={e=>setPolicy(p=>({...p,semanticJudgment:e.target.checked}))}/>開啟 AI 語意判斷（只在新逐字稿生成或按預覽時使用）</label>
      <div className="rounded-lg border p-3 space-y-2">
        <h4 className="font-bold">清理前後測試預覽</h4>
        <textarea aria-label="測試逐字稿文字" rows={3} maxLength={800} className={field} value={previewText} onChange={e=>setPreviewText(e.target.value)}/>
        <button type="button" disabled={busy} className="border rounded-lg px-3 py-2 font-bold disabled:opacity-50" onClick={()=>void runPreview()}>測試預覽（不會儲存）</button>
        {preview&&<div className="space-y-2 text-xs"><div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"><b>淨化前</b><p className="whitespace-pre-wrap">{preview.before}</p></div><div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg"><b>淨化後</b><p className="whitespace-pre-wrap">{preview.after}</p></div></div>}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} className="bg-rose-600 text-white font-bold rounded-lg px-4 py-2 disabled:opacity-50" onClick={()=>void save(policy,'儲存')}>儲存規則</button>
        <button type="button" disabled={busy} className="border rounded-lg px-4 py-2 font-bold disabled:opacity-50" onClick={()=>{if(window.confirm('確定恢復 C1 預設設定並儲存新版本？'))void save({...DEFAULT_CLEANUP_POLICY},'恢復預設');}}>恢復 C1 預設</button>
      </div>
      <div className="rounded-lg border p-3 space-y-2">
        <h4 className="font-bold">設定版本紀錄</h4>
        <p className="text-xs text-slate-500">每次儲存都產生新版本；還原只改後續規則，不會動過去的音檔。</p>
        <div className="flex gap-2">
          <select aria-label="歷史設定版本" className={field} value={restoreVersion} onChange={e=>setRestoreVersion(e.target.value)}>{history.map(h=><option key={h.version} value={h.version}>v{h.version} · {new Date(h.createdAt).toLocaleString('zh-TW')}</option>)}</select>
          <button type="button" disabled={busy||!history.length} className="shrink-0 border rounded-lg px-3 font-bold disabled:opacity-50" onClick={()=>void restoreHistorical()}>還原此版本</button>
        </div>
      </div>
    </div>}
  </section>;
};
