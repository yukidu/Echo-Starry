import React, { useEffect, useMemo, useState } from 'react';
import { Bot, RefreshCw, Download, Save, Search } from 'lucide-react';

type Item = { id:string;title:string;speaker:string;speakerRank:string;status:string;error?:string;wordCount?:number;segmentCount?:number;durationSeconds?:number };
type Model = {id:string;label:string;strength:string};
type Tier = {tier:number;label:string;daily:number;free:number;cost:number};
type Data = {items:Item[];models:Model[];policies:Tier[];model:string;enabled:boolean;globalDaily:number;history?:{commentId:string;createdAt:number;mode:string;status:string;error?:string;title?:string;authorName?:string}[]};
type Transcript = {text:string;segments:{start:number;end:number;text:string}[];chineseCount:number;totalChars:number};
const statuses:Record<string,string>={pending:'排隊中逐字稿',queued:'排隊中逐字稿',processing:'正在撰寫逐字稿',ready:'已完成逐字稿',failed:'逐字稿異常'};
const field:React.CSSProperties={border:'1px solid #94a3b8',borderRadius:10,padding:'7px',background:'transparent',color:'inherit',width:'100%'};
const api=async(path:string,init?:RequestInit)=>{
  const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
  const data=await res.json().catch(()=>({}));
  if(!res.ok)throw new Error(data.error||'載入失敗');
  return data;
};
const stamp=(n:number)=>new Date(Math.max(0,n)*1000).toISOString().slice(11,23).replace('.',',');
export const TranscriptQaAdmin:React.FC=()=>{
  const [data,setData]=useState<Data|null>(null);
  const [query,setQuery]=useState('');
  const [speaker,setSpeaker]=useState('');
  const [status,setStatus]=useState('');
  const [opened,setOpened]=useState<{item:Item;file:Transcript}|null>(null);
  const [fullQuery,setFullQuery]=useState('');
  const [hits,setHits]=useState<{trackId:string;title:string;speaker:string;start:number;text:string}[]>([]);
  const [searchNotice,setSearchNotice]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const load=async()=>{
    setBusy(true);
    try{setData(await api('/api/qa/admin'));setMessage('');}
    catch(e){setMessage(e instanceof Error?e.message:'讀取失敗');}
    finally{setBusy(false);}
  };
  useEffect(()=>{void load();},[]);
  const speakers=useMemo(()=>Array.from(new Set((data?.items||[]).flatMap(i=>i.speaker.split(/\s*[&＆]\s*/).filter(Boolean)))).sort((a,b)=>a.localeCompare(b,'zh-Hant')),[data]);
  const items=useMemo(()=>data?.items.filter(i=>(!speaker||i.speaker.split(/\s*[&＆]\s*/).includes(speaker))&&(!status||i.status===status||(status==='queued'&&i.status==='pending'))&&(!query||[i.title,i.speaker,i.speakerRank,i.id].join(' ').toLowerCase().includes(query.toLowerCase())))||[],[data,speaker,status,query]);
  const counts={total:data?.items.length||0,ready:data?.items.filter(x=>x.status==='ready').length||0,working:data?.items.filter(x=>['queued','pending','processing'].includes(x.status)).length||0,failed:data?.items.filter(x=>x.status==='failed').length||0};
  const open=async(item:Item)=>{
    setBusy(true);try{setOpened({item,file:await api('/api/qa/transcripts/'+encodeURIComponent(item.id))});}
    catch(e){setMessage(e instanceof Error?e.message:'無法開啟');}finally{setBusy(false);}
  };
  const download=(kind:'txt'|'srt'|'vtt')=>{
    if(!opened)return;
    const result=kind==='txt'?opened.file.text:(kind==='vtt'?'WEBVTT\n\n':'')+opened.file.segments.map((s,i)=>(kind==='srt'?String(i+1)+'\n':'')+stamp(s.start).replace(',',kind==='vtt'?'.':',')+' --> '+stamp(s.end).replace(',',kind==='vtt'?'.':',')+'\n'+s.text+'\n').join('\n');
    const url=URL.createObjectURL(new Blob([result],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=opened.item.title.replace(/[\\/:*?"<>|]/g,'_')+'.'+kind;a.click();URL.revokeObjectURL(url);
  };
  const searchAll=async()=>{
    if(fullQuery.trim().length<2){setSearchNotice('請輸入至少兩個字');return;}
    setBusy(true);setSearchNotice('搜尋中…');
    try{
      const found=await api('/api/qa/search?q='+encodeURIComponent(fullQuery.trim())+'&speaker='+encodeURIComponent(speaker));
      setHits(found.matches||[]);
      setSearchNotice('找到 '+Number(found.matches?.length||0)+' 個符合的逐字稿段落'+(found.partial?'（結果較多，僅顯示前 100 筆）':''));
    }catch(e){setSearchNotice(e instanceof Error?e.message:'搜尋失敗');}
    finally{setBusy(false);}
  };
  const retry=async(item:Item)=>{
    if(!window.confirm('將異常逐字稿重新排入隊列？'))return;
    setBusy(true);
    try{const result=await api('/api/qa/retry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({trackId:item.id})});setMessage(result.message||'已重新排隊');await load();}
    catch(e){setMessage(e instanceof Error?e.message:'重試失敗');}
    finally{setBusy(false);}
  };
  const save=async()=>{
    if(!data)return;
    setBusy(true);setMessage('');
    try{await api('/api/qa/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:data.enabled,model:data.model,policies:data.policies,globalDaily:data.globalDaily})});setMessage('設定已儲存');}
    catch(e){setMessage(e instanceof Error?e.message:'儲存失敗');}finally{setBusy(false);}
  };
  const update=(i:number,key:'daily'|'free'|'cost',n:number)=>setData(d=>d?{...d,policies:d.policies.map((p,j)=>i===j?{...p,[key]:n}:p)}:d);
  return <section className="space-y-4 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 sm:p-5" aria-label="逐字稿管理">
    <div className="flex justify-between items-center gap-2"><h2 className="flex items-center gap-1 text-xl font-black"><Bot size={24}/> 逐字稿管理</h2><button type="button" onClick={()=>void load()} disabled={busy} className="flex items-center gap-1 border rounded-lg p-2"><RefreshCw size={16}/>重新整理</button></div>
    {message&&<p role="status" className="text-rose-600 font-bold text-xs">{message}</p>}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{([['總數',counts.total],['已完成',counts.ready],['排隊／處理中',counts.working],['異常',counts.failed]] as const).map(([k,v])=><div key={k} className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800"><small>{k}</small><strong className="block text-2xl">{v}</strong></div>)}</div>
    <div className="grid sm:grid-cols-3 gap-2"><label className="flex items-center gap-1"><Search size={18}/><input style={field} value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜尋演講者、音檔名稱"/></label><select style={field} value={speaker} onChange={e=>setSpeaker(e.target.value)} aria-label="講者篩選"><option value="">全部演講者</option>{speakers.map(s=><option key={s} value={s}>{s}</option>)}</select><select style={field} value={status} onChange={e=>setStatus(e.target.value)} aria-label="逐字稿狀態"><option value="">全部狀態</option><option value="ready">已完成</option><option value="processing">正在撰寫</option><option value="queued">排隊中</option><option value="failed">異常</option></select></div>

    <div className="space-y-2 p-3 border rounded-xl">
      <label className="text-xs font-bold">搜尋所有逐字稿的關鍵字（指定演講者或全部）</label>
      <div className="flex gap-2"><input aria-label="搜尋逐字稿全文" style={field} value={fullQuery} onChange={e=>setFullQuery(e.target.value)} placeholder="搜尋逐字稿內容"/><button type="button" disabled={busy} onClick={()=>void searchAll()} className="border rounded-lg px-3 font-bold text-xs shrink-0">全文搜尋</button></div>
      {searchNotice&&<p className="text-xs" role="status">{searchNotice}</p>}
      {hits.length>0&&<div className="max-h-[260px] overflow-auto space-y-2">{hits.map((h,i)=><div key={h.trackId+'-'+i} className="rounded-lg bg-slate-100 dark:bg-slate-800 p-2 text-xs"><b>{h.title} · {h.speaker} · {Math.floor(h.start/60)}:{String(Math.floor(h.start%60)).padStart(2,'0')}</b><p className="mt-1 whitespace-pre-wrap break-all">{h.text}</p><button type="button" className="underline mt-1" onClick={()=>{const item=data?.items.find(v=>v.id===h.trackId);if(item)void open(item);}}>查閱完整內容</button></div>)}</div>}
    </div>
    <div className="max-h-[340px] overflow-y-auto space-y-2">{items.map(i=><div key={i.id} className="flex justify-between gap-2 border border-slate-200 dark:border-slate-700 rounded-xl p-3"><div className="min-w-0 text-xs"><b className="block text-sm break-words">{i.title}</b><span>{i.speaker} · {i.speakerRank}</span><span className="block opacity-70">{statuses[i.status]||i.status} · {i.wordCount||0} 字元 · {i.segmentCount||0} 段</span>{i.error&&<span className="block text-rose-600">{i.error}</span>}</div><div className="flex flex-col gap-1 shrink-0"><button type="button" onClick={()=>void open(i)} disabled={busy||i.status!=='ready'} className="border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1 text-xs disabled:opacity-30">全文</button>{i.status==='failed'&&<button type="button" className="text-xs underline text-rose-600" disabled={busy} onClick={()=>void retry(i)}>重試</button>}</div></div>)}{!items.length&&<p className="text-center text-sm opacity-60 p-3">沒有符合條件的逐字稿</p>}</div>
    {opened&&<div className="space-y-2 border-2 rounded-xl p-3"><div className="flex justify-between gap-2"><b>{opened.item.title}</b><button onClick={()=>setOpened(null)}>返回</button></div><p className="text-xs">中文字數：{opened.file.chineseCount}｜總字元：{opened.file.totalChars}｜段落：{opened.file.segments.length}</p><div className="flex gap-2">{(['txt','srt','vtt'] as const).map(f=><button type="button" key={f} onClick={()=>download(f)} className="border rounded-lg p-2 flex gap-1 items-center text-xs"><Download size={13}/>{f.toUpperCase()}</button>)}</div><pre className="max-h-[380px] overflow-auto whitespace-pre-wrap break-words text-sm leading-relaxed p-3 bg-slate-50 dark:bg-slate-900">{opened.file.text}</pre></div>}
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2"><h3 className="text-lg font-black">最近 50 筆問答紀錄</h3><div className="max-h-52 overflow-auto space-y-1">{(data?.history||[]).map(h=><p key={h.commentId} className="text-xs rounded-lg p-2 bg-slate-100 dark:bg-slate-800">{h.authorName||'訪客'} · {h.title||'未知音檔'} · {h.mode==='all'?'所有演講':'本場演講'} · {h.status==='done'?'完成':h.status==='failed'?'失敗':'回覆中'}{h.error?'（'+h.error+'）':''}</p>)}{!data?.history?.length&&<p className="text-xs text-slate-500">目前尚無問答紀錄</p>}</div></div>
    <div className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-3"><h3 className="text-lg font-black flex items-center gap-2"><Bot size={21}/> 演講者問答設定</h3><label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={!!data?.enabled} onChange={e=>setData(d=>d?{...d,enabled:e.target.checked}:d)}/>啟用演講者問答（預設關閉）</label><label className="block text-xs">全站每日最多回答數（保護免費額度）<input type="number" style={field} min="1" max="100" value={data?.globalDaily??12} onChange={e=>setData(d=>d?{...d,globalDaily:Number(e.target.value)}:d)}/></label>
    <div className="overflow-x-auto"><table className="w-full min-w-[440px] text-xs"><thead><tr><th className="text-left p-2">會員等級</th><th>每天上限</th><th>免費次數</th><th>每次電池</th></tr></thead><tbody>{data?.policies.map((p,i)=><tr key={p.tier} className="border-t dark:border-slate-700"><td className="font-bold p-2">{p.tier}. {p.label}</td>{(['daily','free','cost'] as const).map(k=><td key={k} className="p-1"><input type="number" style={{...field,width:'78px'}} min="0" step={k==='cost'?'0.1':'1'} aria-label={p.label+k} value={p[k]} onChange={e=>update(i,k,Number(e.target.value))}/></td>)}</tr>)}</tbody></table></div>
    <h4 className="font-bold flex items-center gap-1"><Bot size={19}/> 回答模型（僅後台顯示）</h4><table className="w-full text-xs"><thead><tr><th className="text-left p-2">模型</th><th className="text-left">優點</th><th>選擇</th></tr></thead><tbody>{data?.models.map(m=><tr key={m.id} className="border-t dark:border-slate-700"><td className="p-2 font-bold">{m.label}</td><td>{m.strength}</td><td className="text-center"><input type="radio" name="qa-model" checked={data.model===m.id} onChange={()=>setData(d=>d?{...d,model:m.id}:d)}/></td></tr>)}</tbody></table><button type="button" disabled={busy||!data} onClick={()=>void save()} className="w-full rounded-xl p-3 flex items-center gap-2 justify-center bg-rose-600 text-white font-bold disabled:opacity-50"><Save size={18}/>儲存設定</button></div>
  </section>;
};
