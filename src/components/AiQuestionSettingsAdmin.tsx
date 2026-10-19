import React,{useEffect,useMemo,useState} from 'react';
import {AiBadge} from './AiBadge';
import {Save,RefreshCw,History,FlaskConical} from 'lucide-react';

type Tier={tier:number;label:string;daily:number;free:number;cost:number};
type Model={id:string;label:string;strength:string};
type Rule={roleDirections:string;styleDirections:string;qualityDirections:string;qualityEnabled:boolean;emojiMin:number};
type Config={
 enabled:boolean;model:string;models:Model[];policies:Tier[];globalDaily:number;globalUsed:number;
 openAiConfigured:boolean;qaRules:Rule;
 history?:{commentId:string;createdAt:number;mode:string;status:string;error?:string;title?:string;authorName?:string}[];
 items:{id:string;title:string;speaker:string;status:string}[];
};
type Snapshot={id:string;createdAt:number;changeType:string};
const field:React.CSSProperties={border:'1px solid #94a3b8',borderRadius:10,padding:'9px',background:'transparent',color:'inherit',width:'100%'};
const call=async(path:string,init?:RequestInit)=>{
 const response=await fetch(path,{credentials:'same-origin',cache:'no-store',...init});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok)throw Error(payload.error||'目前無法完成操作');
 return payload;
};
const post=(path:string,value:unknown)=>call(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
export const AiQuestionSettingsAdmin:React.FC=()=>{
 const [data,setData]=useState<Config|null>(null);
 const [archive,setArchive]=useState<Snapshot[]>([]);
 const [busy,setBusy]=useState(false),[testing,setTesting]=useState(false);
 const [message,setMessage]=useState(''),[error,setError]=useState('');
 const [trackId,setTrackId]=useState(''),[question,setQuestion]=useState('請問我應該如何持續學習與突破自己？');
 const [preview,setPreview]=useState<{answer:string;modelUsed?:string;repaired?:boolean;message?:string;qualityIssues?:string[]}|null>(null);
 const load=async()=>{
   const [settings,hist]=await Promise.all([call('/api/qa/admin'),call('/api/qa/settings/history')]);
   setData(settings);setArchive(hist.items||[]);
 };
 useEffect(()=>{void load().catch(e=>setError(e.message));},[]);
 const ready=useMemo(()=>data?.items.filter(t=>t.status==='ready').slice(0,80)||[],[data]);
 const update=<K extends keyof Config>(key:K,value:Config[K])=>setData(old=>old?{...old,[key]:value}:old);
 const rule=(key:keyof Rule,value:string|boolean|number)=>setData(d=>d?{...d,qaRules:{...d.qaRules,[key]:value}}:d);
 const tier=(i:number,key:'daily'|'free'|'cost',value:number)=>setData(d=>d?{...d,policies:d.policies.map((x,j)=>i===j?{...x,[key]:value}:x)}:d);
 const save=async()=>{
  if(!data)return;
  setBusy(true);setMessage('');setError('');
  try{
   await call('/api/qa/settings',{method:'PUT',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({enabled:data.enabled,model:data.model,policies:data.policies,globalDaily:data.globalDaily,qaRules:data.qaRules,replyDirections:data.qaRules.styleDirections.slice(0,2000)})});
   await load();setMessage('設定儲存成功。只影響往後的新 AI 回覆。');
  }catch(e){setError(e instanceof Error?e.message:'儲存失敗');}finally{setBusy(false);}
 };
 const test=async()=>{
  if(!data||!trackId||!question.trim())return;
  setTesting(true);setPreview(null);setError('');
  try{
   const p=await post('/api/qa/preview',{trackId,question,model:data.model,qaRules:data.qaRules});
   setPreview(p);
  }catch(e){setError(e instanceof Error?e.message:'測試失敗');}finally{setTesting(false);}
 };
 const restore=async(id:string)=>{
   if(!window.confirm('要恢復這份舊設定嗎？會一起恢復回答規則、模型、會員額度與電池收費；已存在的留言不會改變。'))return;
   setBusy(true);setError('');setMessage('');
   try{const r=await post('/api/qa/settings/restore',{id});await load();setMessage(r.message);setPreview(null);}
   catch(e){setError(e instanceof Error?e.message:'無法還原');}finally{setBusy(false);}
 };
 const controls=[
  {key:'roleDirections' as const,title:'第一層｜演講者角色與說話視角',description:'例如：以「我剛剛分享時提到」的角度，自然回答學員。'},
  {key:'styleDirections' as const,title:'第二層｜回答語氣與文字風格',description:'可指定鼓勵、肯定、Emoji 與演講者慣用語氣；先前儲存的指令已自動保留在這裡。'},
  {key:'qualityDirections' as const,title:'第三層｜回答品質與自訂檢查',description:'可新增給 AI 的檢查提醒；下方固定檢查項目由程式確認，不符合最多自動修正一次。'}
 ];
 return <section aria-label="AI問問題" className="space-y-4 border border-slate-200 dark:border-slate-700 rounded-2xl p-3 sm:p-5">
  <div className="flex items-center justify-between gap-3">
   <h2 className="text-xl font-black flex items-center gap-2"><AiBadge/> AI問問題</h2>
   <button type="button" className="border rounded-lg p-2 text-sm flex items-center gap-1" disabled={busy} onClick={()=>void load().catch(e=>setError(e.message))}><RefreshCw size={15}/>重新整理</button>
  </div>
  <p className="text-xs text-slate-500">此處統一管理演講者 AI 問答。系統仍會保護會員權限、避免編造故事，並固定附上「{'<本留言由ai回覆，僅供參考，非本人回覆！>'}」。</p>
  {error&&<p role="alert" className="text-rose-600 font-bold text-sm">{error}</p>}
  {message&&<p role="status" className="text-emerald-700 dark:text-emerald-300 text-sm">{message}</p>}
  {data?<>
   <div className="space-y-3 rounded-xl border p-3">
    <h3 className="font-black">回答規則｜三層自訂指令</h3>
    {controls.map(c=><label key={c.key} className="block space-y-1 text-sm">
     <span className="font-bold">{c.title}</span><span className="block text-xs text-slate-500">{c.description}</span>
     <textarea rows={4} maxLength={2400} value={data.qaRules[c.key]} onChange={e=>rule(c.key,e.target.value)} style={field} aria-label={c.title}/>
     <span className="block text-right text-xs text-slate-500">{Array.from(data.qaRules[c.key]).length}／2400 字</span>
    </label>)}
    <label className="flex items-center gap-2 font-bold text-sm">
     <input type="checkbox" checked={data.qaRules.qualityEnabled} onChange={e=>rule('qualityEnabled',e.target.checked)}/>啟用回答品質自動檢查（不合格最多修正一次）
    </label>
    <label className="block text-sm">每次回答至少使用幾個 Emoji？
     <input type="number" min={0} max={8} step={1} style={{...field,maxWidth:110}} value={data.qaRules.emojiMin} onChange={e=>rule('emojiMin',Number(e.target.value))}/>
    </label>
    <p className="text-xs text-slate-500">固定檢查：第一人稱、避免提到逐字稿等後台詞彙、正向鼓勵、Emoji、最後反問。不符規則時最多額外呼叫 AI 一次，可能增加供應商費用。若仍不合格，就不公開回覆且不扣會員電池。</p>
   </div>
   <div className="space-y-2 border rounded-xl p-3">
    <h3 className="font-black">AI 回答模型</h3>
    <p className="text-xs text-slate-500">切換需儲存才會生效；原有選擇不會自行改變。ChatGPT API 依實際用量另計費。</p>
    <div className="space-y-2">{data.models.map(m=><label key={m.id} className="flex items-start gap-2 border rounded-lg p-2 text-sm">
     <input type="radio" name="qa-model" checked={data.model===m.id} onChange={()=>update('model',m.id)}/>
     <span><strong className="block">{m.label}</strong><span className="text-xs text-slate-500">{m.strength}</span></span>
    </label>)}</div>
    {!data.openAiConfigured&&<p className="text-xs text-amber-600">ChatGPT API 尚未設定安全金鑰</p>}
   </div>
   <div className="space-y-2 border rounded-xl p-3">
    <h3 className="font-black">啟用與每日使用額度／電池收費</h3>
    <label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={data.enabled} onChange={e=>update('enabled',e.target.checked)}/>啟用演講者 AI 問答</label>
    <p className="text-xs text-slate-500">全站今日已回答 {data.globalUsed} 次，設定上限 {data.globalDaily} 次。超級管理員不受站內次數限制，但仍受 AI 供應商用量與費用限制。</p>
    <label className="block text-sm font-bold">一般會員全站每日上限<input type="number" min={1} max={100} value={data.globalDaily} style={field} onChange={e=>update('globalDaily',Number(e.target.value))}/></label>
    <div className="overflow-x-auto"><table className="min-w-[460px] w-full text-xs"><thead><tr><th className="text-left p-2">會員級別</th><th>每日上限</th><th>免費次數</th><th>每次電池</th></tr></thead><tbody>{data.policies.map((p,i)=><tr key={p.tier} className="border-t"><td className="p-2 font-bold">{p.label}</td>{(['daily','free','cost'] as const).map(k=><td key={k} className="p-1"><input aria-label={p.label+k} type="number" min={0} step={k==='cost'?'0.1':'1'} value={p[k]} style={{...field,width:74}} onChange={e=>tier(i,k,Number(e.target.value))}/></td>)}</tr>)}</tbody></table></div>
   </div>
   <button type="button" className="w-full rounded-xl p-3 bg-rose-600 text-white font-bold flex items-center justify-center gap-2 disabled:opacity-50" disabled={busy} onClick={()=>void save()}><Save size={17}/>儲存 AI 問答設定</button>
   <div className="border rounded-xl p-3 space-y-3">
    <h3 className="flex items-center gap-2 font-black"><FlaskConical size={19}/>測試回答（不公開）</h3>
    <p className="text-xs text-slate-500">可在儲存前試看目前編輯中的回答規則。每天最多 10 次測試，不扣會員電池，但 AI 供應商可能收費。</p>
    <label className="text-sm block">測試哪場音檔？
     <select style={field} aria-label="選擇 AI 問答測試音檔" value={trackId} onChange={e=>setTrackId(e.target.value)}><option value="">請選擇已完成逐字稿的音檔</option>{ready.map(t=><option value={t.id} key={t.id}>{t.title} · {t.speaker}</option>)}</select>
    </label>
    <label className="text-sm block">學員想問的問題<textarea style={field} value={question} rows={2} maxLength={600} onChange={e=>setQuestion(e.target.value)}/></label>
    <button type="button" className="border rounded-xl px-3 py-2 font-bold disabled:opacity-40" disabled={testing||!trackId||!question.trim()} onClick={()=>void test()}>{testing?'AI 測試回答中…':'測試回答（不發佈留言）'}</button>
    {preview&&<div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl text-sm" role="status">
     {preview.answer?<p className="whitespace-pre-wrap break-words">{preview.answer}</p>:<p className="text-rose-600">{preview.message}</p>}
     {preview.modelUsed&&<p className="mt-2 text-xs text-slate-500">使用模型：{data.models.find(x=>x.id===preview.modelUsed)?.label||preview.modelUsed}{preview.repaired?'（已自動修正一次）':''}</p>}
     {!!preview.qualityIssues?.length&&<p className="text-xs text-rose-600">品質檢查未通過：{preview.qualityIssues.join('、')}</p>}
    </div>}
   </div>
   <div className="border rounded-xl p-3 space-y-2">
    <h3 className="flex items-center gap-2 font-black"><History size={19}/>歷史設定與還原</h3>
    <p className="text-xs text-slate-500">每次儲存前會備份舊設定，還原會同步恢復模型、回答指令、會員額度及電池數量，不會改寫舊留言。</p>
    {archive.length?archive.map(x=><div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs" key={x.id}>
     <span>{new Date(x.createdAt).toLocaleString('zh-TW')} · {x.changeType==='restore'?'還原前備份':'儲存前備份'}</span>
     <button disabled={busy} onClick={()=>void restore(x.id)} className="shrink-0 px-3 py-2 rounded-lg border">還原此版</button>
    </div>):<p className="text-xs text-slate-500">尚無歷史版本，首次儲存會自動開始備份。</p>}
   </div>
   <div className="border rounded-xl p-3 space-y-2">
    <h3 className="font-black">最近 50 筆 AI 問答紀錄</h3>
    {(data.history||[]).slice(0,50).map(h=><p key={h.commentId} className="text-xs p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">{h.authorName||'訪客'} · {h.title||'未知音檔'} · {h.status==='done'?'已完成':h.status==='failed'?'失敗':'回覆中'}{h.error?'（'+h.error+'）':''}</p>)}
    {!data.history?.length&&<p className="text-xs text-slate-500">尚無問答紀錄</p>}
   </div>
  </>:<p className="text-sm text-slate-500">正在載入 AI 問答設定…</p>}
 </section>;
};
