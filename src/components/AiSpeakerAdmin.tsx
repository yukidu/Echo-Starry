import { SpeakerNameLink } from './SpeakerNameLink';
import { speakerBiographyStatusLabel, type SpeakerBiographyStatus } from '../../shared/speakerBiographyStatus';
import React,{useEffect,useMemo,useState} from 'react';
import {Search,RefreshCcw,Save} from 'lucide-react';
import {AiBadge} from './AiBadge';
type Entry={name:string;recordings:number};
type Snapshot={id:string;displayName:string;bioStatus:SpeakerBiographyStatus;bioUpdatedAt:number;error?:string};
type Setting={keywords:string;direction:string;maxChars:number};
const call=async(path:string,init?:RequestInit)=>{
  const res=await fetch(path,{cache:'no-store',credentials:'same-origin',...init});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw Error(data.error||'操作失敗');
  return data;
};
export const AiSpeakerAdmin:React.FC=()=>{
  const [list,setList]=useState<Entry[]>([]);
  const [profiles,setProfiles]=useState<Snapshot[]>([]);
  const [cfg,setCfg]=useState<Setting>({keywords:'',direction:'',maxChars:500});
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const load=async()=>{
    setBusy(true);setError('');
    try{const d=await call('/api/speaker-profiles/admin');setList(d.speakers||[]);setProfiles(d.profiles||[]);setCfg(d.settings||cfg);}
    catch(e){setError(e instanceof Error?e.message:'資料讀取失敗');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();},[]);
  const visible=useMemo(()=>list.filter(x=>x.name.includes(query)).slice(0,180),[query,list]);
  const save=async()=>{
    setBusy(true);setNotice('');setError('');
    try{await call('/api/speaker-profiles/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});setNotice('摘要方向與字數設定已儲存');}
    catch(e){setError(e instanceof Error?e.message:'儲存失敗');}
    finally{setBusy(false);}
  };
  const refresh=async(name:string)=>{
    setBusy(true);setError('');setNotice('');
    try{const d=await call('/api/speaker-profiles/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name})});setNotice(name+'：'+d.message);await load();}
    catch(e){setError(e instanceof Error?e.message:'無法重新整理');}
    finally{setBusy(false);}
  };
  return <section className="space-y-4 p-3 sm:p-5 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-800 dark:text-slate-100" aria-label="Ai 演講者管理">
    <h2 className="flex items-center gap-2 text-xl font-black"><AiBadge/>演講者管理</h2>
    <p className="text-xs text-slate-500">不修改原本音檔與會員資料庫。綜合摘要只引用可公開的逐字稿，錄音與問答仍遵守各會員權限。</p>
    {error&&<p role="alert" className="text-rose-600 text-sm">{error}</p>}
    {notice&&<p role="status" className="text-emerald-600 text-sm">{notice}</p>}
    <div className="grid gap-3">
      <label className="block text-sm font-bold">摘要關鍵字與重點
        <textarea rows={2} value={cfg.keywords} maxLength={800} onChange={e=>setCfg(x=>({...x,keywords:e.target.value}))} className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent p-3 mt-1 text-sm" placeholder="例如：人生經驗、領導理念、重要觀點"/>
      </label>
      <label className="block text-sm font-bold">彙整方向與寫作要求
        <textarea rows={3} value={cfg.direction} maxLength={1200} onChange={e=>setCfg(x=>({...x,direction:e.target.value}))} className="block w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-transparent p-3 mt-1 text-sm" placeholder="例如：客觀第三人稱、依時間整理不同獎銜時期的發展"/>
      </label>
      <label className="block text-sm font-bold">摘要文字上限
        <input type="number" min={50} max={3000} value={cfg.maxChars} onChange={e=>setCfg(x=>({...x,maxChars:Number(e.target.value)}))} className="mt-1 block w-full rounded-xl border bg-transparent p-3"/>
      </label>
      <button type="button" disabled={busy} onClick={()=>void save()} className="inline-flex justify-center items-center gap-2 bg-rose-600 text-white rounded-xl p-3 font-black disabled:opacity-40"><Save size={18}/>儲存摘要設定</button>
    </div>
    <div className="flex gap-2 items-center"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 border rounded-xl bg-transparent p-2" placeholder="搜尋演講者名字"/><button type="button" onClick={()=>void load()} disabled={busy} className="border rounded-lg px-2 py-2"><RefreshCcw size={17}/></button></div>
    <div className="space-y-2 max-h-[550px] overflow-auto">
      {visible.map(v=>{
        const p=profiles.find(x=>x.displayName===v.name);
        return <div key={v.name} className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 flex gap-3 items-center justify-between">
          <div className="min-w-0"><strong className="block break-words"><SpeakerNameLink name={v.name}/></strong><span className="text-xs text-slate-500">{v.recordings} 場錄音 · {speakerBiographyStatusLabel(p?.bioStatus||'pending')}</span></div>
          <button disabled={busy} onClick={()=>void refresh(v.name)} type="button" className="shrink-0 text-xs font-bold px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl disabled:opacity-40">重新摘要</button>
        </div>;
      })}
    </div>
  </section>;
};
