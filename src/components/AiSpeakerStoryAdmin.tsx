import React,{useEffect,useState} from 'react';
import {splitSpeakerNames} from '../../shared/speakers';

type Pilot={trackId:string;title:string;speaker:string;status:string;cursor:number;autoRun?:number;transcriptStatus?:string;stale?:boolean;error?:string;approvedFacts?:number};
type Claim={id:string;segmentId:string;owner:string;narrator:string;kind:string;summary:string;evidence:string;start:number};
type Draft={done?:boolean;cursor?:number;total?:number;items:Claim[]};
type Override={segmentId:string;owner:string;editedAt:number};
const api=async(path:string,body?:any)=>{
  const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(data.error||'操作失敗');
  return data;
};
const label=(r:Pilot)=>r.stale?'逐字稿已變更，需要重新分析':r.status==='approved'?'自動歸屬已完成':r.status==='failed'?'分析異常':r.autoRun?'背景自動分析中':r.status==='processing'?'正在分析一批逐字稿':r.status==='needs_review'?'舊版分析已完成，可啟動自動歸屬':'尚未啟動';
export const AiSpeakerStoryAdmin:React.FC=()=>{
  const [pilots,setPilots]=useState<Pilot[]>([]);
  const [selected,setSelected]=useState('');
  const [draft,setDraft]=useState<Draft|null>(null);
  const [manualOverrides,setManualOverrides]=useState<Override[]>([]);
  const [changes,setChanges]=useState<Record<string,string>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=async(id:string)=>{
    const data=await api('/api/speaker-stories/admin'+(id?'?trackId='+encodeURIComponent(id):''));
    setPilots(data.items||[]);
    setDraft(data.draft||null);
    setManualOverrides(data.manualOverrides||[]);
  };
  useEffect(()=>{
    void load(selected).catch(e=>setError(e.message));
    const timer=window.setInterval(()=>{void load(selected).catch(()=>{});},20_000);
    return ()=>window.clearInterval(timer);
  },[selected]);
  const select=(id:string)=>{setError('');setNotice('');setChanges({});setSelected(id);};
  const act=async(route:string,body:any)=>{
    setBusy(true);setError('');setNotice('');
    try{const out=await api('/api/speaker-stories/'+route,{trackId:selected,...body});
      setNotice(out.message||'操作成功');await load(selected);if(route==='reset')setChanges({});
    }catch(e){setError(e instanceof Error?e.message:'操作失敗');}
    finally{setBusy(false);}
  };
  const current=pilots.find(x=>x.trackId===selected);
  const speakers=splitSpeakerNames(current?.speaker);
  const overridden=new Map(manualOverrides.map(x=>[x.segmentId,x.owner]));
  return <section aria-label="多人演講管理" className="space-y-4">
    <h3 className="text-lg font-black">多人演講｜故事自動歸屬</h3>
    <p className="text-sm text-slate-600 dark:text-slate-300">僅限原本五場試點。按一次「開始整場 AI 分析」，每五分鐘背景接續一小批；離開畫面也會繼續。完成後有依據的故事會自動歸屬，無法確認的故事不會冒充個人經歷。日後可人工更正，人工修正優先於 AI。</p>
    {error&&<p role="alert" className="text-sm text-rose-600">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-700">{notice}</p>}
    <div className="grid gap-2">
      {pilots.map(p=><button key={p.trackId} type="button" onClick={()=>select(p.trackId)} disabled={busy}
        className={'text-left w-full rounded-xl border p-3 '+(selected===p.trackId?'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60':'border-slate-200 dark:border-slate-700')}>
        <strong className="block text-sm break-words">{p.title} · {p.speaker}</strong>
        <span className="text-xs text-slate-500">{label(p)}{p.cursor?' · 已分析 '+p.cursor+' 段':''}{p.approvedFacts?' · 可用人物資料 '+p.approvedFacts+' 筆':''}</span>
      </button>)}
    </div>
    {current&&<div className="space-y-3 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <h4 className="font-black">{current.speaker}</h4>
      <p className="text-sm">{label(current)}</p>
      {current.error&&<p role="alert" className="text-xs text-rose-600">最近錯誤：{current.error}</p>}
      {draft&&<div className="space-y-1">
        <p className="text-sm font-bold">分析進度：{draft.cursor||0}／{draft.total||'…'} 段</p>
        <progress aria-label="逐字稿故事分析進度" className="w-full" value={draft.cursor||0} max={Math.max(1,draft.total||1)}/>
        <p className="text-xs text-slate-500">已找到 {draft.items.length} 項故事，未知故事不會納入公開摘要與 AI 問答。</p>
      </div>}
      <div className="flex gap-2 flex-wrap">
        {!current.autoRun&&current.status!=='approved'&&current.status!=='processing'&&
          <button type="button" disabled={busy||current.transcriptStatus!=='ready'} onClick={()=>void act('start',{})}
            className="rounded-xl bg-indigo-600 text-white p-3 text-sm font-bold disabled:opacity-40">開始整場 AI 分析</button>}
        {!!current.autoRun&&<button type="button" disabled={busy} onClick={()=>void act('pause',{})} className="rounded-xl border px-3 py-2 text-sm font-bold">暫停背景分析</button>}
        {current.status==='approved'&&<button type="button" disabled={busy} onClick={()=>{if(window.confirm('重新分析會暫停本場已核對的 AI 問答，但保留您曾經手動修改的人物歸屬。確定重新分析嗎？'))void act('reset',{});}}
          className="rounded-xl border px-3 py-2 text-sm">重設並重新分析</button>}
        <button type="button" disabled={busy} onClick={()=>void load(selected).catch(e=>setError(e.message))} className="rounded-xl border px-3 py-2 text-sm">更新進度</button>
      </div>
      {current.status==='approved'&&<p className="text-xs text-emerald-700 dark:text-emerald-300">背景分析已完成。下列 AI 歸屬並非獨立事實查證；你可以修改任何故事的人物歸屬。</p>}
      {draft?.items?.length? <div className="space-y-2 max-h-[650px] overflow-y-auto">
        {draft.items.map(f=>{
          const owner=overridden.get(f.segmentId)||f.owner;
          const chosen=changes[f.id]??owner;
          return <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2" key={f.id}>
            <p className="text-xs text-slate-500">{Math.floor(f.start/60)} 分 {Math.round(f.start%60)} 秒 · 原文：{f.evidence}</p>
            <p className="text-sm font-medium">{f.summary}</p>
            <label className="block text-xs font-bold">故事屬於誰？
              <select disabled={current.status!=='approved'||busy} value={chosen} onChange={e=>setChanges(x=>({...x,[f.id]:e.target.value}))}
                className="block mt-1 w-full rounded-lg border px-3 py-2 bg-white dark:bg-slate-800">
                <option value="unknown">無法確認（不公開使用）</option>
                <option value="shared">夫妻共同經歷</option>
                {speakers.map(name=><option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            {overridden.has(f.segmentId)&&<p className="text-xs text-indigo-600">已人工修正，優先使用你的設定</p>}
            {current.status==='approved'&&chosen!==owner&&<button type="button" disabled={busy} onClick={()=>void act('edit',{factId:f.id,owner:chosen}).then(()=>setChanges(x=>{const n={...x};delete n[f.id];return n;}))}
              className="rounded-lg border border-indigo-500 px-3 py-2 text-sm font-bold">儲存人物歸屬修正</button>}
          </div>;
        })}
      </div>:null}
    </div>}
  </section>;
};
