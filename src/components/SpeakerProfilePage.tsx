import React, {useEffect,useState} from 'react';
import {ChevronLeft, Headphones, BookOpenText, MessageCircle, RefreshCw} from 'lucide-react';
import {AiBadge} from './AiBadge';
type TrackSummary={id:string;title:string;speakerRank?:string;speakerAvatar?:string;uploadDate?:string;durationSeconds?:number;requiredRank?:string};
type QaPair={answerId:string;questionId:string;trackId:string;title:string;rank?:string;asker:string;question:string;answer:string;createdAt:number};
type ProfileData={speaker:{id:string;name:string;avatar:string;biography:string;bioStatus:string;bioUpdatedAt:number};tracks:TrackSummary[];replies:QaPair[];hasMore:boolean;nextOffset:number;hasMoreReplies:boolean;nextReplyOffset:number};
export const SpeakerProfilePage:React.FC<{name:string;onBack:()=>void;onOpenTrack:(trackId:string,commentId?:string)=>void;compact?:boolean}>=({name,onBack,onOpenTrack,compact=false})=>{
  const [data,setData]=useState<ProfileData|null>(null);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [more,setMore]=useState(false);
  const [moreReplies,setMoreReplies]=useState(false);
  const [section,setSection]=useState<'audio'|'qa'>('audio');
  useEffect(()=>{
    let live=true;setLoading(true);setError('');setData(null);
    void fetch('/api/speaker-profiles/view?name='+encodeURIComponent(name),{credentials:'same-origin',cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'資料讀取失敗');return d;})
      .then(d=>{if(live)setData(d);})
      .catch(e=>{if(live)setError(e.message||'無法讀取講者資料');})
      .finally(()=>{if(live)setLoading(false);});
    return()=>{live=false;};
  },[name]);
  const loadMoreReplies=async()=>{
    if(!data?.hasMoreReplies||moreReplies)return;setMoreReplies(true);
    try{
      const r=await fetch('/api/speaker-profiles/view?name='+encodeURIComponent(name)+'&replyOffset='+data.nextReplyOffset,{credentials:'same-origin'});
      const next:ProfileData=await r.json();if(!r.ok)throw Error('無法取得更多問答');
      setData(x=>x?{...x,replies:[...x.replies,...next.replies],hasMoreReplies:next.hasMoreReplies,nextReplyOffset:next.nextReplyOffset}:x);
    }catch(e){setError(e instanceof Error?e.message:'載入失敗');}
    finally{setMoreReplies(false);}
  };
  const loadMore=async()=>{
    if(!data?.hasMore||more)return;setMore(true);
    try{
      const r=await fetch('/api/speaker-profiles/view?name='+encodeURIComponent(name)+'&offset='+data.nextOffset,{credentials:'same-origin'});
      const next:ProfileData=await r.json();if(!r.ok)throw Error('無法取得更多錄音');
      setData(x=>x?{...x,tracks:[...x.tracks,...next.tracks],hasMore:next.hasMore,nextOffset:next.nextOffset}:x);
    }catch(e){setError(e instanceof Error?e.message:'載入失敗');}
    finally{setMore(false);}
  };
  return <main data-echo-page="speaker-profile" className={'w-full max-w-4xl mx-auto px-4 sm:px-6 space-y-5 text-slate-800 dark:text-slate-100 '+(compact?'py-3 pb-5':'py-5 pb-28')}>
    {!compact&&<button type="button" onClick={onBack} className="inline-flex items-center gap-1 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm"><ChevronLeft size={17}/>返回上一頁</button>}
    {loading&&<p role="status" className="text-center py-12">正在載入演講者資料…</p>}
    {error&&<p role="alert" className="text-rose-600">{error}</p>}
    {data&&<><header className="rounded-2xl p-4 bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        {data.speaker.avatar?<img src={data.speaker.avatar} alt={data.speaker.name} className="w-20 h-20 rounded-full object-cover shrink-0"/>:<div className="w-20 h-20 rounded-full shrink-0 bg-slate-200 dark:bg-slate-800 grid place-items-center text-3xl">{data.speaker.name.slice(0,1)}</div>}
        <div className="min-w-0">
          <h1 className="flex gap-2 items-center text-2xl font-black"><AiBadge/><span className="rainbow-admin-text break-words">{data.speaker.name}</span></h1>
          <p className="text-xs text-slate-500 mt-1">逐字稿整理的虛擬演講者資料頁，並非講者本人帳號</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <h2 className="flex items-center gap-2 font-bold"><BookOpenText size={18}/>綜合人物摘要</h2>
        {data.speaker.biography?<p className="whitespace-pre-wrap text-sm leading-7">{data.speaker.biography}</p>:<p className="text-sm text-slate-500">{data.speaker.bioStatus==='failed'?'摘要暫時無法生成，管理員可重新排隊':'正在整理演講逐字稿，摘要產生後會自動顯示'}</p>}
        {data.speaker.bioUpdatedAt>0&&<p className="text-xs text-slate-500">最近整理：{new Date(data.speaker.bioUpdatedAt).toLocaleDateString('zh-TW')}</p>}
        <p className="text-xs text-amber-600 dark:text-amber-400">摘要依可公開使用的逐字稿自動整理，可能不完整，請以原始錄音為準。</p>
      </div>
    </header>
    <div className="flex gap-2" role="tablist" aria-label="講者資料">
      <button type="button" role="tab" aria-selected={section==='audio'} onClick={()=>setSection('audio')} className={"flex-1 rounded-xl border px-3 py-3 text-sm font-bold "+(section==='audio'?'bg-rose-600 text-white':'border-slate-300 dark:border-slate-700')}><Headphones className="inline w-4 h-4 mr-1"/>所有錄音（{data.tracks.length}{data.hasMore?'+':''}）</button>
      <button type="button" role="tab" aria-selected={section==='qa'} onClick={()=>setSection('qa')} className={"flex-1 rounded-xl border px-3 py-3 text-sm font-bold "+(section==='qa'?'bg-rose-600 text-white':'border-slate-300 dark:border-slate-700')}><MessageCircle className="inline w-4 h-4 mr-1"/>歷史問答（{data.replies.length}）</button>
    </div>
    {section==='audio'&&<section className="space-y-2" aria-label="全部可查閱錄音">
      <p className="text-xs text-slate-500">跨所有獎銜時期，依你的會員權限顯示可以查閱的錄音。</p>
      {data.tracks.map(t=><button key={t.id} type="button" onClick={()=>onOpenTrack(t.id)} className="block w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900 p-3 hover:border-rose-400">
        <strong className="text-sm">{t.title}</strong><span className="block text-xs mt-1 text-slate-500">{t.speakerRank||'公開'} · {t.uploadDate||'日期未設定'}</span>
      </button>)}
      {!data.tracks.length&&<p className="p-5 text-center text-sm text-slate-500">目前沒有可查閱的錄音</p>}
      {data.hasMore&&<button type="button" onClick={()=>void loadMore()} disabled={more} className="w-full p-3 rounded-xl border text-sm flex items-center justify-center gap-1"><RefreshCw size={15}/>{more?'載入中…':'載入更多錄音'}</button>}
    </section>}
    {section==='qa'&&<section className="space-y-3" aria-label="歷史提問與回答">
      <p className="text-xs text-slate-500">僅顯示你有權限閱讀的公開討論。回答由 AI 根據逐字稿生成。</p>
      {data.replies.map(q=><div key={q.answerId} className="rounded-xl p-3 border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900 space-y-2">
        <div className="text-xs text-slate-500">{q.title} · {q.rank||'公開'}</div>
        <div className="rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-sm"><strong>{q.asker||'訪客'} 問：</strong>{q.question}</div>
        <div className="text-sm leading-6"><strong className="inline-flex items-center gap-1"><AiBadge/><span className="rainbow-admin-text">{data.speaker.name}</span>答：</strong><span className="whitespace-pre-wrap break-words">{q.answer}</span></div>
        <button type="button" className="text-sm underline text-rose-600" onClick={()=>onOpenTrack(q.trackId,q.questionId)}>查看原始留言對話</button>
      </div>)}
      {!data.replies.length&&<p className="text-sm text-center text-slate-500 p-5">目前沒有可公開查閱的問答紀錄</p>}
      {data.hasMoreReplies&&<button type="button" disabled={moreReplies} onClick={()=>void loadMoreReplies()} className="w-full p-3 rounded-xl border text-sm">{moreReplies?'載入中…':'載入更多歷史問答'}</button>}
    </section>}
    </>}
  </main>;
};
