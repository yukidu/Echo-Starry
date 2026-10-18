import { effectiveMemberRank } from '../utils/ranks';
import { vipPasswordForTrack } from '../../shared/stickers';
import { commentThreads } from '../utils/comments';
import { apiJson, identityKeys } from '../utils/api';
import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  MessageSquare,
  Trash2,
  Edit3,
  Check,
  X,
  ShieldAlert,
  Heart,
  Reply,
  AtSign,
  Radio,
  Mic
} from 'lucide-react';
import { Comment, UserProfile, Track } from '../types';
import { VisitorIdentity } from '../utils/visitor';
import { CollapsibleCommentText } from './CollapsibleCommentText';
import { AiBadge } from './AiBadge';
import { SpeakerNameLink } from './SpeakerNameLink';
import { splitSpeakerNames } from '../../shared/speakers';
import { formatCommentTimestampDisplay } from '../../shared/commentTime';
import { isDuduDragonComment } from '../../shared/commentAuthorStyle';

const stripLegacyAutoReplyMention = (content: string, replyToAuthor?: string) => {
  const value = typeof content === 'string' ? content : '';
  const author = replyToAuthor?.trim();
  if (!author) return value;
  for (const prefix of [`@${author}`, `＠${author}`]) {
    if (!value.startsWith(prefix)) continue;
    const nextChar = value.slice(prefix.length, prefix.length + 1);
    if (nextChar && !/\s/.test(nextChar)) continue;
    return value.slice(prefix.length).trimStart();
  }
  return value;
};

interface CommentsSectionProps {
  trackId: string;
  speakerName?: string;
  speakerRank?: string;
  speakerAvatar?: string;
  commentStickerReward?: number;
  comments: Comment[];
  visitor: VisitorIdentity;
  currentUser: UserProfile | null;
  isAdmin: boolean;
  onAddComment: (content: string, replyToId?: string, replyToAuthor?: string, qaMode?: 'current' | 'all' | 'off') => Promise<void>;
  onDeleteComment: (commentId: string) => Promise<void>;
  onEditComment: (commentId: string, newContent: string) => Promise<void>;
  onViewMember?: (user: UserProfile) => void;
  onViewSpeaker?: (name:string) => void;
  allUsers?: UserProfile[];
  tracks?: Track[];
}

export const CommentsSection: React.FC<CommentsSectionProps> = ({
  trackId,
  speakerName = '演講者',
  speakerRank = '',
  speakerAvatar = '',
  commentStickerReward = 0,
  comments,
  visitor,
  currentUser,
  isAdmin,
  onAddComment,
  onDeleteComment,
  onEditComment,
  onViewMember,
  onViewSpeaker,
  allUsers = [], 
  tracks = []
}) => {
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [qaMode, setQaMode] = useState<'current' | 'all' | 'off'>('current');
  const searchModel = new URLSearchParams(window.location.search).get('qa-test');
  const qaTestModel = searchModel === 'gpt' || searchModel === 'glm' ? searchModel : null;
  type PrivateEntry = { id:string; question:string; answer:string; model:string; mode:string; elapsedMs:number; createdAt:number };
  const [qaTestAccess,setQaTestAccess] = useState(false);
  const [qaTestError,setQaTestError] = useState('');
  const [qaTestEntries,setQaTestEntries] = useState<PrivateEntry[]>([]);
  useEffect(()=>{
    if(!qaTestModel)return;
    let active=true;
    setQaTestAccess(false);setQaTestEntries([]);setQaTestError('');
    void fetch('/api/qa/test/status',{credentials:'same-origin',cache:'no-store'})
      .then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error||'登入權限不足');return d;})
      .then(async d=>{
        if(!active||!d.authorized)return;
        setQaTestAccess(true);
        const r=await fetch('/api/qa/test?model='+qaTestModel+'&trackId='+encodeURIComponent(trackId),{credentials:'same-origin',cache:'no-store'});
        const history=await r.json();
        if(!r.ok)throw Error(history.error||'無法讀取測試問答');
        if(active)setQaTestEntries(history.items||[]);
      }).catch(e=>{if(active)setQaTestError(e instanceof Error?e.message:'無法驗證測試權限');});
    return ()=>{active=false;};
  },[qaTestModel,trackId,currentUser?.id]);
  const speakerOptions=useMemo(()=>splitSpeakerNames(speakerName),[speakerName]);
  const [qaTargetSpeaker,setQaTargetSpeaker]=useState('');
  useEffect(()=>{setQaTargetSpeaker('');},[trackId,speakerName]);
  const [qaStatus, setQaStatus] = useState<{enabled:boolean;reason:string;freeLeft:number;left:number;cost:number;unlimited?:boolean}|null>(null);
  const [pendingQa,setPendingQa] = useState<{id:string;phase:'starting'|'typing'}|null>(null);
  const [qaNotice,setQaNotice] = useState('');
  // The stored original comment is the only reliable trigger for an AI answer.
  useEffect(()=>{
    const onSent=(event:Event)=>{
      const d=(event as CustomEvent<{trackId?:string;commentId?:string}>).detail;
      if(d?.trackId!==trackId || !d.commentId)return;
      setQaNotice('');
      setPendingQa({id:d.commentId,phase:'starting'});
    };
    window.addEventListener('echostars:qa-comment-sent',onSent);
    return ()=>window.removeEventListener('echostars:qa-comment-sent',onSent);
  },[trackId]);
  useEffect(()=>{
    if(!pendingQa?.id)return;
    let alive=true, timer:number|undefined,tries=0;
    const started=Date.now(),id=pendingQa.id;
    const tick=async()=>{
      if(!alive)return;
      try{
        const r=await fetch('/api/qa/progress?commentId='+encodeURIComponent(id),{credentials:'same-origin',cache:'no-store'});
        const data=r.ok?await r.json():null;
        if(!alive)return;
        if(data?.status==='done'){
          setPendingQa(null);
          setQaNotice('已完成回覆');
          window.dispatchEvent(new CustomEvent('echostars:qa-refresh',{detail:{trackId}}));
          return;
        }
        if(data?.status==='failed'){
          setPendingQa(null);
          setQaNotice('本次回答未成功：'+String(data.reason||'服務暫時無法回覆')+'。沒有扣除電池，可重新發起新留言。');
          return;
        }
        if(data?.status==='pending')setPendingQa(old=>old?.id===id?{...old,phase:'typing'}:old);
        if(data?.status==='starting'&&Date.now()-started>12000){
          setPendingQa(null);
          setQaNotice('此留言尚未啟動演講者回答，請確認今日額度及是否有開啟召喚。');
          return;
        }
      }catch{/* Poor connections should not make an unverified failure claim. */}
      if(Date.now()-started>90000){
        setPendingQa(null);
        setQaNotice('回答時間較久，請稍後返回這篇留言查看。');
        return;
      }
      tries++;
      timer=window.setTimeout(tick,tries<10?2600:5100);
    };
    timer=window.setTimeout(tick,1300);
    return ()=>{alive=false;if(timer!==undefined)window.clearTimeout(timer);};
  },[pendingQa?.id,trackId]);
  // Refresh saved quotas after returning from the administrator settings page.
  useEffect(()=>{
    if(qaTestModel)return;
    let alive=true;
    const refresh=()=>{
      if(document.visibilityState==='hidden')return;
      void fetch('/api/qa/status?trackId='+encodeURIComponent(trackId),{credentials:'same-origin',cache:'no-store'})
        .then(async r=>r.ok?r.json():null)
        .then(d=>{
          if(!alive||!d)return;
          const previouslyDenied=!!qaStatus?.reason;
          setQaStatus(d);
          if(!d.enabled)setQaMode('off');
          else if(previouslyDenied)setQaMode(mode=>mode==='off'?'current':mode);
        }).catch(()=>{});
    };
    window.addEventListener('echostars:qa-settings-updated',refresh);
    window.addEventListener('focus',refresh);
    return ()=>{alive=false;window.removeEventListener('echostars:qa-settings-updated',refresh);window.removeEventListener('focus',refresh);};
  },[trackId,qaStatus?.reason]);
  const headingRef = useRef<HTMLHeadingElement|null>(null);
  useEffect(() => {
    if(qaTestModel)return;
    let cancelled = false;
    setQaMode('current');
    void fetch('/api/qa/status?trackId=' + encodeURIComponent(trackId), { credentials:'same-origin',cache:'no-store' })
      .then(async res => res.ok ? res.json() : null)
      .then(data => {
        if (cancelled) return;
        setQaStatus(data);
        if (!data?.enabled) setQaMode('off');
      }).catch(() => { if (!cancelled) { setQaStatus({enabled:false,reason:'問答服務目前無法使用',freeLeft:0,left:0,cost:0});setQaMode('off'); } });
    return () => { cancelled = true; };
  }, [trackId,currentUser?.id]);
  useEffect(() => {
    const heading = headingRef.current;
    if (!heading) return;
    const resize = () => {
      heading.style.fontSize = '32px';
      for (let size=32;size>=10 && heading.scrollWidth>heading.clientWidth;size-=1) heading.style.fontSize = size+'px';
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (heading.parentElement) observer?.observe(heading.parentElement);
    resize();
    return () => observer?.disconnect();
  }, [speakerName,comments.length,qaMode]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [likeStats, setLikeStats] = useState<Record<string, { likes: number; hasLiked: boolean }>>({});

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionKeyword, setMentionKeyword] = useState('');
  const [mentionTab, setMentionTab] = useState<'members' | 'tracks'>('members');

  const myKeys = identityKeys(currentUser, visitor.deviceId);
  const myId = myKeys[0];
  const isSuperAdminModerator = isAdmin || currentUser?.role === '超級管理員';
  const isAdminModerator = isSuperAdminModerator || currentUser?.isAdminUser === true || currentUser?.role === '管理員';

  const pendingLikes = useRef(new Set<string>());
  useEffect(() => { setLikeStats({}); }, [myId]);

  const handleLikeComment = async (comment: Comment) => {
    if (pendingLikes.current.has(comment.id)) return;
    pendingLikes.current.add(comment.id);
    const currentLiked = likeStats[comment.id] !== undefined
      ? likeStats[comment.id].hasLiked
      : (comment.likedBy || []).some(k => myKeys.includes(k));
    const currentCount = likeStats[comment.id] !== undefined
      ? likeStats[comment.id].likes
      : (comment.likes || 0);

    const nextLiked = !currentLiked;
    const nextCount = nextLiked ? currentCount + 1 : Math.max(0, currentCount - 1);
    setLikeStats(prev => ({ ...prev, [comment.id]: { likes: nextCount, hasLiked: nextLiked } }));

    try {
      const data = await apiJson(`/api/comments/${encodeURIComponent(comment.id)}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: myId, userId: currentUser?.id, userEmail: currentUser?.email, deviceId: visitor?.deviceId, vipPassword: vipPasswordForTrack(trackId) })
      });
      setLikeStats(prev => ({ ...prev, [comment.id]: { likes: data.likes, hasLiked: data.hasLiked } }));
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
    } catch (error) {
      setLikeStats(prev => ({ ...prev, [comment.id]: { likes: currentCount, hasLiked: currentLiked } }));
      setErrorMessage(error instanceof Error ? error.message : '按讚失敗，請重試。');
    } finally {
      pendingLikes.current.delete(comment.id);
    }
  };

  const getRegisteredAuthor = (c: Comment): UserProfile | null => {
    const email = c.authorEmail?.toLowerCase().trim();
    if (!email) return null;
    if (currentUser?.email?.toLowerCase().trim() === email) return currentUser;
    return allUsers.find(u => u.email?.toLowerCase().trim() === email) || null;
  };

  const handleAuthorClick = (c: Comment) => {
    const member = getRegisteredAuthor(c);
    if (!member || !onViewMember) return;
    onViewMember(member);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInputText(val);
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const lastAtIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('＠'));
    if (lastAtIdx !== -1) {
      const query = textBeforeCursor.slice(lastAtIdx + 1);
      if (!query.includes(' ') && !query.includes('\n')) {
        setMentionKeyword(query);
        setIsMentionOpen(true);
        return;
      }
    }
    setIsMentionOpen(false);
  };

  const handleSelectMention = (label: string) => {
    if (!textareaRef.current) return;
    const cursorPos = textareaRef.current.selectionStart;
    const textBeforeCursor = inputText.slice(0, cursorPos);
    const textAfterCursor = inputText.slice(cursorPos);
    const lastAtIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('＠'));
    if (lastAtIdx !== -1) {
      const newText = textBeforeCursor.slice(0, lastAtIdx) + `@${label} ` + textAfterCursor;
      setInputText(newText);
      setIsMentionOpen(false);
      setTimeout(() => {
        if (textareaRef.current) {
          const nextPos = lastAtIdx + label.length + 2;
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(nextPos, nextPos);
        }
      }, 0);
    }
  };

  const combinedMentionSuggestions = useMemo(() => {
    const q = mentionKeyword.toLowerCase().trim();
    const members = allUsers
      .filter(u => {
        if (!u.name || u.name.startsWith('訪客')) return false;
        if (!q) return true;
        return u.name.toLowerCase().includes(q) ||
          (u.center && u.center.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          effectiveMemberRank(u, '').toLowerCase().includes(q);
      })
      .slice(0, 6)
      .map(u => ({
        type: 'member' as const,
        id: `u-${u.id}`,
        label: u.name,
        badge: [u.center, effectiveMemberRank(u, '會員')].filter(Boolean).join(' ') || '會員',
        avatar: u.avatar
      }));

    const speakerMap = new Map<string, { name: string; avatar?: string }>();
    tracks.forEach(t => {
      if (t.speaker?.trim() && !speakerMap.has(t.speaker.trim())) {
        speakerMap.set(t.speaker.trim(), { name: t.speaker.trim(), avatar: t.speakerAvatar });
      }
    });
    const speakers = Array.from(speakerMap.values())
      .filter(s => !q || s.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(s => ({ type: 'speaker' as const, id: `spk-${s.name}`, label: s.name, badge: '音檔演講者', avatar: s.avatar }));

    const trackItems = tracks
      .filter(t => !q || t.title.toLowerCase().includes(q) || t.speaker?.toLowerCase().includes(q))
      .slice(0, 4)
      .map(t => ({ type: 'track' as const, id: `t-${t.id}`, label: t.title, badge: t.speaker ? `講師：${t.speaker}` : '音檔', avatar: t.speakerAvatar }));

    return [...members, ...speakers, ...trackItems].slice(0, 12);
  }, [allUsers, tracks, mentionKeyword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    if(qaMode!=='off'&&speakerOptions.length>1&&!speakerOptions.includes(qaTargetSpeaker)){
      setErrorMessage('多人演講請先選擇要召喚的演講者');
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const question=qaMode!=='off'&&speakerOptions.length>1?'@'+qaTargetSpeaker+' '+inputText.trim():inputText.trim();
      if (qaTestModel) {
        if(!qaTestAccess)throw Error(qaTestError||'請先以指定管理員身分登入，測試不會公開發布');
        if(qaMode==='off')throw Error('請選擇測試演講範圍');
        const r=await fetch('/api/qa/test',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({trackId,model:qaTestModel,mode:qaMode,question})});
        const data=await r.json();
        if(!r.ok)throw Error(data.error||'模型回答失敗');
        setQaTestEntries(prev=>[data.entry,...prev].slice(0,30));
        setInputText('');setReplyingTo(null);setIsMentionOpen(false);
        return;
      }
      await onAddComment(question, replyingTo?.id, replyingTo?.authorName, qaMode);
      if (qaMode !== 'off') {
        window.setTimeout(() => {
          void fetch('/api/qa/status?trackId=' + encodeURIComponent(trackId), {credentials:'same-origin',cache:'no-store'})
            .then(async r => r.ok ? r.json() : null).then(data => {
              if (data) {
                setQaStatus(data);
                if (!data.enabled) setQaMode('off');
              }
            }).catch(() => {});
        }, 8000);
      }
      setInputText('');
      setReplyingTo(null);
      setIsMentionOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || '心得發送失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStartEdit = (c: Comment) => {
    setEditingId(c.id);
    setEditContent(c.content);
  };

  const handleSaveEdit = async (commentId: string) => {
    if (!editContent.trim()) return;
    try {
      await onEditComment(commentId, editContent.trim());
      setEditingId(null);
    } catch (err: any) {
      setErrorMessage(err.message || '修改失敗');
    }
  };

  const renderFormattedContent = (value: string) => {
    const content = typeof value === 'string' ? value : '';
    const regex = /[@＠]([^\s@＠\n,，。！!？?]+)/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      if (match.index > lastIndex) elements.push(content.substring(lastIndex, match.index));
      const rawLabel = match[1];
      const normalized = rawLabel.trim().toLowerCase();
      const matchedUser = allUsers.find(u => u.name?.trim().toLowerCase() === normalized);
      const matchedSpeaker = tracks.find(t => t.speaker?.trim().toLowerCase() === normalized);
      const matchedTrack = tracks.find(t => t.title && (t.title.trim().toLowerCase() === normalized || normalized.includes(t.title.trim().toLowerCase())));
      if (matchedUser) {
        elements.push(
          <button key={`mention-user-${match.index}`} type="button" onClick={e => { e.stopPropagation(); onViewMember?.(matchedUser); }} className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold hover:underline bg-rose-50 dark:bg-rose-950/70 border border-rose-200/60 dark:border-rose-900/60 px-1.5 py-0.5 rounded-lg mx-0.5 text-xs transition-colors cursor-pointer" title={`查看會員【${matchedUser.name}】個人資料卡`}>
            <AtSign className="w-3 h-3 shrink-0" /><span>{matchedUser.name}</span>
          </button>
        );
      } else if (matchedSpeaker) {
        elements.push(
          <span key={`mention-speaker-${match.index}`} className="inline-flex items-center gap-1 text-purple-700 dark:text-purple-300 font-bold bg-purple-50 dark:bg-purple-950/70 border border-purple-200/60 dark:border-purple-900/60 px-1.5 py-0.2 rounded-lg mx-0.5 text-xs select-none" title={`音檔演講者：${matchedSpeaker.speaker}`}>
            <Mic className="w-3 h-3 shrink-0 text-purple-500" /><span>@{matchedSpeaker.speaker}</span><span className="text-[9px] px-1 rounded-sm bg-purple-200/60 dark:bg-purple-900/60 text-purple-700 dark:text-purple-200 font-medium">演講者</span>
          </span>
        );
      } else if (matchedTrack) {
        elements.push(
          <span key={`mention-track-${match.index}`} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 px-1.5 py-0.2 rounded-md mx-0.5 text-xs select-none" title={`標記音檔：${matchedTrack.title}（主講：${matchedTrack.speaker}）`}>
            <Radio className="w-3 h-3 shrink-0" /><span>{matchedTrack.title}</span>
          </span>
        );
      } else {
        elements.push(`@${rawLabel}`);
      }
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < content.length) elements.push(content.substring(lastIndex));
    return elements;
  };

  return (
    <div className="w-full bg-white/70 dark:bg-slate-900/60 rounded-3xl p-4 sm:p-5 border border-rose-100/60 dark:border-slate-800 shadow-xs relative leading-snug">
      <div className="w-full min-w-0 mb-3">
        <h3 ref={headingRef} className="font-black text-slate-800 dark:text-slate-100 flex items-center gap-[0.18em] whitespace-nowrap overflow-hidden w-full max-w-full leading-tight" style={{fontSize:32}}>
          {qaMode === 'off' ? <>
            <span className="shrink-0">分享學習心得獲得</span><span className="rainbow-admin-text font-black shrink-0">電池</span>
          </> : <>
            <span className="shrink-0">召喚</span><AiBadge/>
            <span className="rainbow-admin-text font-black shrink-0"><SpeakerNameLink name={qaTargetSpeaker || speakerName || '演講者'}/></span><span className="shrink-0">問問題</span>
          </>} 
        </h3>
        {qaTestModel && <div className="mt-2 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm" role="status"><strong>私人 AI 測試：{qaTestModel==='gpt'?'GPT-6 Luna':'GLM-4.7-Flash'}</strong><p>只有指定管理員可使用；問答獨立保存、不公開留言、不扣電池。每款每日最多 30 題。{qaTestError && <span className="text-rose-600">{qaTestError}</span>}</p></div>}
        <fieldset className="mt-2 flex flex-wrap items-center gap-3 text-xs sm:text-sm" aria-label="召喚範圍">
          {([['current','本場演講'],['all','所有演講'],...(qaTestModel?[]:[['off','關閉']])] as Array<['current'|'all'|'off',string]>).map(([value,label]) => (
            <label key={value} className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="radio" name={'speaker-qa-'+trackId} checked={qaMode===value}
                disabled={qaTestModel ? !qaTestAccess : value!=='off' && !qaStatus?.enabled}
                onChange={() => setQaMode(value)} />
              <span className="font-bold">{label}{value==='off' && <AiBadge className="ml-1"/>}</span>
            </label>
          ))}
        </fieldset>
        {qaMode!=='off' && speakerOptions.length>1 && <label className="block mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">本次召喚哪位演講者？
          <select aria-label="選擇要召喚的演講者" required value={qaTargetSpeaker} onChange={e=>setQaTargetSpeaker(e.target.value)} className="block mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm">
            <option value="">請選擇一位演講者</option>
            {speakerOptions.map(person=><option key={person} value={person}>{person}</option>)}
          </select>
        </label>}
        {!qaTestModel && qaStatus?.reason && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300" role="status">已自動關閉 <AiBadge/>：{qaStatus.reason}（一般心得留言仍可使用）</div>}
        {!qaTestModel && qaStatus?.enabled && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{qaStatus.unlimited ? '超級管理員：網站內召喚不限次數、不扣電池' : <>今日免費剩餘 {qaStatus.freeLeft} 次／總共剩餘 {qaStatus.left} 次{qaStatus.freeLeft===0 ? ' · 每次 '+qaStatus.cost+' 顆電池':''}</>}</p>}
      </div>

      <form onSubmit={handleSubmit} className="mb-5 relative">
        <div className="bg-slate-50/80 dark:bg-slate-800/60 rounded-2xl p-3.5 border border-slate-200/70 dark:border-slate-700/60 focus-within:border-rose-400 dark:focus-within:border-rose-500 focus-within:bg-white dark:focus-within:bg-slate-800 transition-all relative">
          {replyingTo && (
            <div className="flex items-center justify-between bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-xl text-xs mb-2 border border-rose-200/60 dark:border-rose-900 font-medium">
              <span className="flex items-center gap-1.5"><Reply className="w-3.5 h-3.5" /><span>正在回覆這則留言</span></span>
              <button type="button" onClick={() => setReplyingTo(null)} className="p-0.5 hover:text-rose-900 dark:hover:text-rose-100"><X className="w-3.5 h-3.5" /></button>
            </div>
          )}

          <textarea ref={textareaRef} value={inputText} onChange={handleTextareaChange} maxLength={2000} rows={3} placeholder={qaTestModel ? '請輸入你的 AI 演講者測試問題（不會發布正式留言）' : replyingTo ? '寫下回覆內容...' : currentUser ? `按這裡寫下您的心得收穫，可獲得+${commentStickerReward}張貼紙（必須100%聽完錄音）` : '按這裡寫下您的心得收穫...'} className="w-full bg-transparent resize-none outline-hidden text-sm sm:text-base text-slate-800 dark:text-slate-100 placeholder:text-slate-400" />

          {isMentionOpen && (
            <div className="absolute left-2 top-full mt-1 z-40 w-64 max-w-[calc(100vw-32px)] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/80 px-2.5 py-1 border-b border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 font-bold">
                <span>標記關聯字 ({combinedMentionSuggestions.length})</span>
                <button type="button" onClick={() => setIsMentionOpen(false)} className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"><X className="w-3 h-3" /></button>
              </div>
              <div className="max-h-40 overflow-y-auto p-1 text-[11px] space-y-0.5">
                {combinedMentionSuggestions.length === 0 ? <div className="p-2 text-center text-slate-400 text-[10px]">無符合的會員或演講者</div> : combinedMentionSuggestions.map(item => (
                  <button key={item.id} type="button" onClick={() => handleSelectMention(item.label)} className="w-full flex items-center justify-between px-2 py-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 pr-1.5">
                      {item.avatar ? <img src={item.avatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0" /> : <span className="text-[10px] shrink-0">{item.type === 'member' ? '👤' : item.type === 'speaker' ? '🎙️' : '🎵'}</span>}
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate group-hover:text-[var(--color-primary,#c06c84)]">{item.label}</span>
                    </div>
                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium shrink-0 ${item.type === 'speaker' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800' : item.type === 'member' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{item.badge}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2.5 border-t border-slate-200/50 dark:border-slate-700/50 mt-1.5">
  <span className="text-xs text-slate-400 font-mono">{inputText.length}/2000</span>
  <button type="submit" disabled={isSubmitting || !inputText.trim() || Boolean(qaTestModel && !qaTestAccess)} className="px-5 py-2 rounded-xl text-white font-medium text-sm transition-all shadow-xs active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}>
    {isSubmitting ? '送出中...' : '送出'}
  </button>
</div>
        </div>

        {errorMessage && (
          <div className="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 p-2.5 rounded-xl border border-rose-200 dark:border-rose-900">
            <ShieldAlert className="w-4 h-4 shrink-0" /><span>{errorMessage}</span>
          </div>
        )}
      </form>

      {(isSubmitting && qaMode !== 'off' || pendingQa) && (
        <div role="status" aria-live="polite" className="mb-3 min-w-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 px-3 py-3 text-sm">
          <div className="flex min-w-0 items-start gap-2">
            <span className="shrink-0"><AiBadge/></span>
            <span className="rainbow-admin-text min-w-0 flex-1 font-bold break-all whitespace-normal"><SpeakerNameLink name={speakerName}/></span>
          </div>
          <p className="mt-2 whitespace-nowrap text-sm leading-6">{pendingQa?.phase==='typing'?'正在輸入訊息中':'正在準備回答'}<span className="inline-block animate-pulse">…</span></p>
        </div>
      )}
      {qaNotice && !pendingQa && (
        <p className="mb-3 text-sm text-amber-700 dark:text-amber-300" role="status" aria-live="polite">{qaNotice}</p>
      )}
      <div className="space-y-2.5 divide-y divide-slate-100 dark:divide-slate-800/70">
        {qaTestModel ? (
          qaTestEntries.length===0 ? <p className="text-center py-6 text-slate-400 text-sm">尚無私人測試紀錄。請選擇演講範圍，親自輸入問題。</p> :
          qaTestEntries.map(item=><div key={item.id} className="py-3 space-y-2 text-sm">
            <div className="rounded-xl bg-rose-50 dark:bg-slate-800 p-3"><strong>我的測試提問</strong><p className="whitespace-pre-wrap break-words mt-1">{item.question}</p></div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3"><strong>{item.model==='gpt'?'GPT-6 Luna':'GLM-4.7-Flash'} · 回答耗時 {(item.elapsedMs/1000).toFixed(1)} 秒</strong><p className="whitespace-pre-wrap break-words mt-1">{item.answer}</p></div>
          </div>)
        ) : comments.length === 0 ? (
          <div className="text-center py-6 text-slate-400 dark:text-slate-500 text-xs">目前還沒有心得，快來當第一個分享心得的人吧！</div>
        ) : (() => {
          const threads = commentThreads(comments);
          const rootComments = threads.roots;
          const renderCommentItem = (c: Comment, isReply = false) => {
            const isAuthor = Boolean(c.authorEmail ? currentUser?.email && c.authorEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim() : c.deviceId && c.deviceId === visitor.deviceId);
            const isAiSpeaker = c.id.startsWith('qa-') && c.authorBadge === 'AI_SPEAKER';
            const registeredAuthor = isAiSpeaker ? null : getRegisteredAuthor(c);
            const isVisitor = !registeredAuthor && !isAiSpeaker;
            const displayAuthorName = isAiSpeaker ? (c.authorName || speakerName) : (registeredAuthor?.name || c.authorName);
            const displayAuthorAvatar = isAiSpeaker ? (c.authorAvatar || speakerAvatar) : (registeredAuthor?.avatar || c.authorAvatar);
            const displayAuthorBadge = isAiSpeaker ? speakerRank : (registeredAuthor ? effectiveMemberRank(registeredAuthor) : null);
            const showBadge = isAiSpeaker || !!registeredAuthor;
            const userLiked = likeStats[c.id] !== undefined ? likeStats[c.id].hasLiked : (c.likedBy || []).some(k => myKeys.includes(k));
            const userLikesCount = likeStats[c.id] !== undefined ? likeStats[c.id].likes : (c.likes || 0);
            const isAvatarUrl = displayAuthorAvatar && (displayAuthorAvatar.startsWith('http') || displayAuthorAvatar.startsWith('data:') || displayAuthorAvatar.startsWith('/'));
            const isClickable = Boolean(registeredAuthor || (isAiSpeaker && onViewSpeaker));
            const timestampLines = formatCommentTimestampDisplay(c);
            const displayContent = stripLegacyAutoReplyMention(c.content, c.replyToAuthor);

            return (
              <div id={`comment-${c.id}`} key={c.id} className={`${isReply ? 'pt-2' : 'pt-3 first:pt-0'}`}>
                <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-x-2">
                  <div
                    onClick={isClickable ? () => isAiSpeaker ? onViewSpeaker?.(displayAuthorName.split(/\s*[&＆]\s*/)[0]) : handleAuthorClick(c) : undefined}
                    className={`w-14 shrink-0 flex flex-col items-center gap-1 ${isClickable ? 'cursor-pointer hover:opacity-85 transition-opacity' : 'cursor-default pointer-events-none'}`}
                    title={isClickable ? `點擊查看【${displayAuthorName}】個人資料頁` : undefined}
                  >
                    {isAvatarUrl ? <img src={displayAuthorAvatar} alt={displayAuthorName} className="w-14 h-14 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" /> : <span className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shrink-0">{displayAuthorAvatar || '👤'}</span>}
                    <span className="text-[8px] text-slate-400 dark:text-slate-500 font-mono leading-[1.05] text-center">{timestampLines.map((line, index) => <span key={`${c.id}-time-${index}`} className="block whitespace-nowrap">{line}</span>)}</span>
                  </div>

                  <div className="min-w-0">
                    <div
                      onClick={isClickable ? () => isAiSpeaker ? onViewSpeaker?.(displayAuthorName.split(/\s*[&＆]\s*/)[0]) : handleAuthorClick(c) : undefined}
                      className={`${isClickable ? 'cursor-pointer hover:opacity-85 transition-opacity' : 'cursor-default pointer-events-none'} min-w-0`}
                      title={isClickable ? `點擊查看【${displayAuthorName}】個人資料頁` : undefined}
                    >
                      {isAiSpeaker ? <span className="inline-flex items-center gap-1 font-bold text-base leading-tight break-words"><AiBadge/><span className="rainbow-admin-text"><SpeakerNameLink name={displayAuthorName}/></span></span> : !isDuduDragonComment(c) && (c.isAdmin || displayAuthorBadge === '貢獻者') ? <span className="rainbow-admin-text font-bold text-base leading-tight break-words">{displayAuthorName}</span> : isClickable ? <span className="font-bold text-slate-800 dark:text-slate-100 text-base underline decoration-dotted underline-offset-2 hover:text-rose-600 transition-colors leading-tight break-words">{displayAuthorName}</span> : <span className="font-bold text-slate-700 dark:text-slate-300 text-base select-none leading-tight break-words">{displayAuthorName}</span>}
                    </div>

                    <div className="mt-1 flex items-center gap-1 min-w-0 flex-nowrap">
                      <div className="flex items-center gap-1 min-w-0 shrink">
                        {isVisitor && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium select-none leading-tight whitespace-nowrap shrink-0">訪客</span>}
                        {showBadge && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-medium whitespace-nowrap shrink-0 leading-tight">{displayAuthorBadge}</span>}
                      </div>

                      <div className="ml-auto flex items-center justify-end gap-0.5 shrink-0">
                        <button type="button" onClick={() => handleLikeComment(c)} className={`flex items-center gap-0.5 text-sm px-0.5 py-0.5 rounded-lg transition-colors cursor-pointer ${userLiked ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 font-bold' : 'text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800'}`} title={userLiked ? '取消讚' : '按讚這則心得'}>
                          <Heart className={`w-5 h-5 ${userLiked ? 'fill-rose-500 text-rose-500' : ''}`} /><span>{userLikesCount > 0 ? userLikesCount : ''}</span>
                        </button>
                        <button type="button" onClick={() => { setReplyingTo(c); textareaRef.current?.focus(); }} className="flex items-center gap-0.5 text-base leading-none text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-0.5 py-0.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap" title="回覆此心得"><Reply className="w-5 h-5" /><span>回覆</span></button>
                        {isAuthor && editingId !== c.id && <button onClick={() => handleStartEdit(c)} title="編輯心得" className="p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"><Edit3 className="w-4 h-4" /></button>}
                        {(isAuthor || isSuperAdminModerator || (isAdminModerator && isVisitor)) && editingId !== c.id && <button onClick={() => onDeleteComment(c.id)} title="刪除心得" className="p-0.5 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
                      </div>
                    </div>

                    {editingId === c.id ? (
                      <div className="mt-1.5 space-y-1.5">
                        <textarea maxLength={2000} value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full p-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 text-sm text-slate-800 dark:text-slate-100 outline-hidden" rows={2} />
                        <p className="text-xs leading-snug text-amber-700 dark:text-amber-300"><AiBadge/> <span className="rainbow-admin-text font-bold"><SpeakerNameLink name={speakerName}/></span>並無法知道你曾編輯此留言，如果要重新發問，請重新發起一篇新留言</p>
                        <div className="flex justify-end gap-1.5">
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 rounded-lg text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1 cursor-pointer"><X className="w-3 h-3" /> 取消</button>
                          <button onClick={() => handleSaveEdit(c.id)} className="px-2.5 py-1 rounded-lg text-xs bg-rose-600 text-white flex items-center gap-1 shadow-2xs font-bold cursor-pointer"><Check className="w-3 h-3" /> 儲存修改</button>
                        </div>
                      </div>
                    ) : (
                      <CollapsibleCommentText
                        className="text-base text-slate-700 dark:text-slate-300 leading-snug whitespace-pre-wrap mt-1.5 break-words"
                        resetKey={`${c.id}:${c.content}`}
                      >
                        {renderFormattedContent(displayContent)}
                      </CollapsibleCommentText>
                    )}
                  </div>
                </div>
              </div>
            );
          };

          return <div className="space-y-3">{rootComments.map(parent => {
            const replies = threads.replies.get(parent.id) || [];
            return <div key={parent.id} className="pb-2 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0">
              {renderCommentItem(parent, false)}
              {replies.length > 0 && <div className="pl-5 sm:pl-7 ml-3 mt-2 border-l-2 border-rose-200/70 dark:border-slate-700/80 space-y-2">{replies.map(reply => renderCommentItem(reply, true))}</div>}
            </div>;
          })}</div>;
        })()}
      </div>
    </div>
  );
};