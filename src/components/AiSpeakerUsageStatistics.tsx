import React,{useEffect,useState} from 'react';
import {Activity,BarChart3,ChevronDown,ChevronUp,Clock3,Coins,Headphones,RefreshCw,ShieldCheck,Users} from 'lucide-react';

type Metric={calls:number;members:number;successes:number;failures:number;pending:number;
  repeat5:number;repeat30:number;repeat60:number;actualTwd:number|null;
  estimatedTwd:number|null;costState:string;responseMs:number|null;
  tokenCount:number|null;fallbackCalls:number|null};
type UsageRow=Metric & {id:string;title:string;speaker?:string;uploadDate?:string;
  linkedSpeakers?:string[];trackCount?:number};
type Usage= {totals:Metric;rows:UsageRow[];trend:{day:string;calls:number}[];
  costDisclosure:{actual:string;estimate:string;b07:string};
  recordingDisclosure:string;historyDisclosure:string;limit:number};
type Period='today'|'7d'|'30d'|'all';
type Group='track'|'speaker';
type Sort='calls'|'members'|'repeat'|'cost';
const nf=new Intl.NumberFormat('zh-TW');
const show=(value:number|null|undefined,unit='')=>value===null||value===undefined?'尚無紀錄':nf.format(value)+unit;
const money=(v:number|null|undefined)=>v===null||v===undefined?'尚無紀錄':'NT$ '+v.toFixed(2);
const filters:{value:Period;label:string}[]=[
 {value:'today',label:'今天'},{value:'7d',label:'7天'},
 {value:'30d',label:'30天'},{value:'all',label:'全部'}
];
const statFields=[
 {name:'召喚次數',field:'calls',unit:' 次',icon:Activity},
 {name:'不重複會員',field:'members',unit:' 人',icon:Users},
 {name:'30分鐘重複引用',field:'repeat30',unit:' 次',icon:RefreshCw},
 {name:'成功次數',field:'successes',unit:' 次',icon:ShieldCheck},
 {name:'失敗次數',field:'failures',unit:' 次',icon:Activity},
 {name:'Token 用量',field:'tokenCount',unit:'',icon:BarChart3},
 {name:'實際費用',field:'actualTwd',unit:'',icon:Coins},
 {name:'平均回應時間',field:'responseMs',unit:' 毫秒',icon:Clock3}
] as const;
function MetricTile({item,data}: {item:(typeof statFields)[number];data:Metric}){
 const Icon=item.icon;
 const value=data[item.field];
 const display=item.field==='actualTwd'?money(value):show(value,item.unit);
 return <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
   <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Icon size={14}/><span>{item.name}</span></div>
   <div className="mt-2 truncate text-lg font-black tabular-nums" title={display}>{display}</div>
 </div>;
}
function UsageDetail({row,group}: {row:UsageRow;group:Group}){
 return <div className="rounded-b-xl border border-t-0 border-slate-200 p-3 dark:border-slate-700">
   {group==='track'&&<div className="mb-3 space-y-1 text-xs text-slate-600 dark:text-slate-300">
     <div>音檔：{row.title}</div>
     <div>講者：{row.linkedSpeakers?.length?row.linkedSpeakers.join('、'):row.speaker||'未指定'}</div>
     <div>上傳日期：{row.uploadDate||'尚無紀錄'}</div>
   </div>}
   {group==='speaker'&&<div className="mb-3 text-xs text-slate-600 dark:text-slate-300">
     關聯音檔 {show(row.trackCount,' 場')}
   </div>}
   <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
     {([['5分鐘重複',row.repeat5,' 次'],['30分鐘重複',row.repeat30,' 次'],
       ['60分鐘重複',row.repeat60,' 次'],['等待中',row.pending,' 次'],
       ['成功',row.successes,' 次'],['失敗',row.failures,' 次'],
       ['模型備援',row.fallbackCalls,' 次'],['平均反應',row.responseMs,' 毫秒']] as const).map(([label,value,unit])=>
       <div key={label} className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
         <div className="text-[11px] text-slate-500">{label}</div>
         <div className="mt-1 text-sm font-bold">{show(value,unit)}</div>
       </div>)}
   </div>
   <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-slate-400">
     <p>Token：{show(row.tokenCount)}　實際費用：{money(row.actualTwd)}</p>
     <p>估算費用：{money(row.estimatedTwd)}（無歷史紀錄就不估算）</p>
   </div>
 </div>;
}
export const AiSpeakerUsageStatistics:React.FC=()=>{
 const [period,setPeriod]=useState<Period>('7d');
 const [group,setGroup]=useState<Group>('track');
 const [sort,setSort]=useState<Sort>('calls');
 const [version,setVersion]=useState(0);
 const [data,setData]=useState<Usage|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [expanded,setExpanded]=useState<string|null>(null);
 useEffect(()=>{
   const controller=new AbortController();
   setLoading(true);setError('');setExpanded(null);
   const params=new URLSearchParams({period,group,sort});
   fetch('/api/admin/ai-speaker-usage?'+params.toString(),{
     credentials:'same-origin',cache:'no-store',signal:controller.signal
   }).then(async response=>{
     const result=await response.json().catch(()=>({}));
     if(!response.ok)throw new Error(response.status===403?'只有 Starry ID 中央超級管理員可以查詢':result.error||'統計讀取失敗');
     return result as Usage;
   }).then(result=>setData(result)).catch(err=>{
     if(!controller.signal.aborted){setError(err instanceof Error?err.message:'讀取失敗');setData(null);}
   }).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
   return ()=>controller.abort();
 },[period,group,sort,version]);
 const hasData=Boolean(data?.totals.calls);
 const max=Math.max(1,...(data?.trend||[]).map(x=>x.calls));
 return <section className="space-y-4" aria-label="AI演講者管理員使用統計">
   <header className="flex items-center justify-between gap-2">
     <div><h3 className="text-lg font-black">使用統計排行榜</h3>
       <p className="text-xs text-slate-500">只統計真實 AI 召喚記錄，會員跨音檔不重複計算</p></div>
     <button type="button" aria-label="重新載入統計" disabled={loading} onClick={()=>setVersion(v=>v+1)}
       className="rounded-lg border border-slate-300 p-2 dark:border-slate-600"><RefreshCw size={18}/></button>
   </header>
   <div role="group" aria-label="統計時間" className="grid grid-cols-4 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
     {filters.map(f=><button key={f.value} type="button" onClick={()=>setPeriod(f.value)}
       aria-pressed={period===f.value} className={'rounded-lg px-1 py-2 text-sm font-bold '+(period===f.value?'bg-rose-600 text-white':'text-slate-700 dark:text-slate-200')}>{f.label}</button>)}
   </div>
   {loading&&<p role="status" className="text-sm text-slate-500">正在查詢統計資料…</p>}
   {error&&<p role="alert" className="rounded-lg border border-rose-300 p-3 text-sm text-rose-600">{error}</p>}
   {data&&<>
     <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
       {statFields.map(item=><MetricTile key={item.field} item={item} data={data.totals}/>)}
     </div>
     <div className="grid gap-4 lg:grid-cols-2">
       <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
         <h4 className="mb-3 flex items-center gap-2 text-sm font-black"><BarChart3 size={16}/>召喚趨勢</h4>
         {data.trend.length?
           <div className="flex h-32 items-end gap-1 overflow-x-auto" aria-label="依日期排列之真實召喚數趨勢">
             {data.trend.map(point=><div key={point.day} title={point.day+'：'+point.calls+' 次'}
               className="group relative flex h-full min-w-[12px] flex-1 items-end">
               <div className="w-full rounded-t bg-rose-500" style={{height:Math.max(2,point.calls/max*100)+'%'}}/>
             </div>)}
           </div>:
           <p className="py-12 text-center text-sm text-slate-500">此期間沒有 AI 召喚紀錄</p>}
         <p className="mt-2 text-xs text-slate-500">以台灣日期統計，僅含有記錄的日子</p>
       </section>
       <section className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
         <div className="flex flex-wrap items-center justify-between gap-2">
           <h4 className="text-sm font-black">卡片排行榜</h4>
           <div className="flex gap-1">{([{value:'track',label:'依音檔'},{value:'speaker',label:'依講者'}] as const).map(x=>
             <button key={x.value} type="button" onClick={()=>setGroup(x.value)} aria-pressed={group===x.value}
               className={'rounded-lg px-3 py-1.5 text-xs font-bold '+(group===x.value?'bg-rose-600 text-white':'border border-slate-300 dark:border-slate-700')}>{x.label}</button>)}</div>
         </div>
         <label className="mt-3 block text-xs font-bold">排序方式
           <select value={sort} onChange={e=>setSort(e.target.value as Sort)}
             className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white">
             <option value="calls">AI 召喚次數</option><option value="members">不重複會員</option>
             <option value="repeat">30 分鐘重複引用</option><option value="cost">實際成本（尚無資料，暫依召喚數）</option>
           </select>
         </label>
         {!hasData&&<p className="mt-3 text-sm text-slate-500">所選期間沒有可排行的歷史資料</p>}
         <div className="mt-3 max-h-[540px] space-y-2 overflow-auto">
           {data.rows.map((row,index)=><div key={row.id}>
             <button type="button" onClick={()=>setExpanded(x=>x===row.id?null:row.id)}
               aria-expanded={expanded===row.id}
               className="flex w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-left dark:border-slate-700 dark:bg-slate-800">
               <span className="w-5 shrink-0 text-xs font-bold text-rose-600">{index+1}</span>
               <Headphones className="shrink-0" size={19}/>
               <span className="min-w-0 flex-1"><strong className="block truncate text-sm">{row.title}</strong>
                 <span className="block truncate text-xs text-slate-500">{group==='track'?row.speaker:(show(row.trackCount,' 場錄音'))}</span>
                 <span className="text-xs text-slate-500">{show(row.calls,' 次召喚')} · {show(row.members,' 位會員')}</span></span>
               {expanded===row.id?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
             </button>
             {expanded===row.id&&<UsageDetail row={row} group={group}/>}
           </div>)}
         </div>
         {data.rows.length===data.limit&&<p className="mt-2 text-xs text-slate-500">目前顯示前 {data.limit} 筆，排序由伺服器計算。</p>}
       </section>
     </div>
     <aside className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
       <p className="font-bold">費用與歷史完整性說明</p>
       <p>實際費用：{data.costDisclosure.actual}</p>
       <p>估算費用：{data.costDisclosure.estimate}</p>
       <p>{data.costDisclosure.b07}</p>
       <p>{data.recordingDisclosure}</p>
       <p>{data.historyDisclosure}</p>
     </aside>
   </>}
   <p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={15}/>本頁僅供 Starry ID 中央超級管理員使用，伺服器每次重新驗證權限。</p>
 </section>;
};
