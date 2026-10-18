import React,{useEffect,useState} from 'react';
import {splitSpeakerNames} from '../../shared/speakers';

type Pilot={trackId:string;title:string;speaker:string;status:string;cursor:number;transcriptStatus?:string;stale?:boolean;error?:string;approvedFacts?:number};
type Claim={id:string;segmentId:string;owner:string;narrator:string;kind:string;summary:string;evidence:string;start:number};
type Draft={done?:boolean;cursor?:number;total?:number;items:Claim[]};
type Decision={include:boolean;owner:string};
const api=async(url:string,body?:any)=>{
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'操作失敗');
  return d;
};
const labels:Record<string,string>={pending:'等待分析',processing:'AI 分析中',needs_review:'等待管理員確認',approved:'已核對完成',failed:'分析異常'};
export const AiSpeakerStoryAdmin:React.FC=()=>{
  const [pilots,setPilots]=useState<Pilot[]>([]);
  const [selected,setSelected]=useState('');
  const [draft,setDraft]=useState<Draft|null>(null);
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=async(id=selected)=>{
    const d=await api('/api/speaker-stories/admin'+(id?'?trackId='+encodeURIComponent(id):''));
    setPilots(d.items||[]);
    setDraft(d.draft||null);
  };
  useEffect(()=>{void load('').catch(e=>setError(e.message));},[]);
  const select=async(id:string)=>{
    setSelected(id);setDecisions({});setNotice('');setError('');
    try{await load(id);}catch(e){setError(e instanceof Error?e.message:'無法讀取資料');}
  };
  const operation=async(path:string,id:string,body:any)=>{
    setBusy(true);setNotice('');setError('');
    try{const d=await api(path,{trackId:id,...body});setNotice(d.message||'操作完成');await load(id);if(path.endsWith('/reset'))setDecisions({});}
    catch(e){setError(e instanceof Error?e.message:'操作失敗');}
    finally{setBusy(false);}
  };
  const current=pilots.find(x=>x.trackId===selected);
  const speakers=splitSpeakerNames(current?.speaker);
  const accepted=Object.values(decisions).filter(x=>x.include).length;
  return <section className="mt-6 space-y-3 border border-indigo-200 dark:border-indigo-900 rounded-xl p-3 sm:p-4" aria-label="多人故事歸屬管理">
    <h3 className="text-lg font-black">多人演講｜AI 故事歸屬測試</h3>
    <p className="text-xs text-slate-600 dark:text-slate-300">目前限五場試點。直接使用既有 R2 逐字稿，AI 的結果必須經你逐項核對，才可供人物摘要及留言板使用。原始逐字稿不會改動。</p>
    {error&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {notice&&<p role="status" className="text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
    <div className="grid gap-2">
      {pilots.map(p=><button type="button" key={p.trackId} disabled={busy} onClick={()=>void select(p.trackId)}
        className={'w-full text-left rounded-lg border px-3 py-2 text-sm '+(p.trackId===selected?'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60':'border-slate-200 dark:border-slate-700')}>
        <strong className="block">{p.title} · {p.speaker}</strong>
        <span className="text-xs text-slate-500">{p.stale?'逐字稿已更新，需要重新分析':labels[p.status]||p.status}{p.approvedFacts?' · 已確認 '+p.approvedFacts+' 筆':''}</span>
      </button>)}
    </div>
    {current&&<div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <strong className="block">目前選取：{current.speaker}</strong>
      {current.error&&<p className="text-xs text-red-600">{current.error}</p>}
      <div className="flex flex-wrap gap-2">
        {current.status!=='approved'&&current.status!=='processing'&&
          <button disabled={busy||current.transcriptStatus!=='ready'} type="button" onClick={()=>void operation('/api/speaker-stories/analyze',current.trackId,{})} className="rounded-lg border border-indigo-400 px-3 py-2 text-sm font-bold">
            {busy?'處理中…':draft?.done?'分析已完成':'分析下一段逐字稿'}
          </button>}
        {current.status==='approved'&&<button disabled={busy} type="button" onClick={()=>{if(window.confirm('重新分析會暫停這場錄音的已確認人物問答。確定要重置嗎？'))void operation('/api/speaker-stories/reset',current.trackId,{});}} className="rounded-lg border px-3 py-2 text-sm">重新分析</button>}
        <button type="button" disabled={busy} onClick={()=>void load(selected).catch(e=>setError(e.message))} className="rounded-lg border px-3 py-2 text-sm">更新狀態</button>
      </div>
      {draft&&<p className="text-xs text-slate-500">已讀取 {draft.cursor||0}／{draft.total||'？'} 段，找到 {draft.items?.length||0} 項候選經歷。每按一次「分析下一段」只處理一部分，以控制 AI 用量。</p>}
      {draft?.items?.length>0&&<div className="max-h-[600px] overflow-auto space-y-2">
        {draft.items.map(f=>{
          const decision=decisions[f.id]||{include:false,owner:f.owner};
          return <div key={f.id} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
            <p className="text-xs text-slate-500">{Math.floor(f.start/60)} 分 {Math.round(f.start%60)} 秒 · 原始文字：{f.evidence}</p>
            <p className="text-sm font-medium">{f.summary}</p>
            <div className="flex flex-wrap gap-3 items-center">
              <label className="text-xs">歸屬人物
                <select className="block border rounded-lg px-2 py-1 mt-1 bg-white dark:bg-slate-800" value={decision.owner} onChange={e=>setDecisions(x=>({...x,[f.id]:{...decision,owner:e.target.value}}))}>
                  <option value="unknown">無法確認／不納入</option>
                  <option value="shared">雙方共同經歷</option>
                  {speakers.map(name=><option key={name} value={name}>{name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-bold">
                <input type="checkbox" checked={decision.include} onChange={e=>setDecisions(x=>({...x,[f.id]:{...decision,include:e.target.checked}}))}/>
                已核對來源並同意使用
              </label>
            </div>
          </div>;
        })}
      </div>}
      {current.status==='needs_review'&&draft?.done&&<button disabled={busy||!accepted} type="button" onClick={()=>void operation('/api/speaker-stories/approve',current.trackId,{decisions:Object.entries(decisions).map(([id,x])=>({id,...x}))})}
        className="w-full rounded-xl bg-indigo-600 text-white p-3 font-black disabled:opacity-40">
        確認 {accepted} 項人物故事，供摘要與 AI 問答使用
      </button>}
      {current.status==='approved'&&<p className="text-xs text-emerald-600">本場人物故事已完成核對。舊的逐字稿、錄音和會員權限全部保留。</p>}
    </div>}
  </section>;
};
