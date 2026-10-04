import { commentThreads } from '../utils/comments';
import { apiJson, identityKeys } from '../utils/api';
import React, { useEffect, useState, useRef, useMemo } from 'react';
import {
  MessageSquare,
  X,
  Send,
  Heart,
  Reply,
  ShieldAlert,
  AtSign,
  Radio,
  Mic,
  Trash2
} from 'lucide-react';
import { Track, Comment, UserProfile } from '../types';
import { VisitorIdentity } from '../utils/visitor';
import { CollapsibleCommentText } from './CollapsibleCommentText';

interface CommentPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  track: Track | null;
  currentUser?: UserProfile | null;
  visitor?: VisitorIdentity;
  isAdmin?: boolean;
  allUsers?: UserProfile[];
  initialComments?: Comment[];
  tracks?: Track[];
  onViewMember?: (user: UserProfile) => void;
  onCommentAdded?: () => void;
  onDeleteComment?: (commentId: string) => Promise<void>;
}

export const CommentPreviewModal: React.FC<CommentPreviewModalProps> = ({
  isOpen,
  onClose,
  track,
  currentUser,
  visitor,
  isAdmin,
  allUsers = [],
  initialComments = [],
  tracks = [],
  onViewMember,
  onCommentAdded,
  onDeleteComment
}) => {
  const isSuperAdminModerator =
    isAdmin ||
    currentUser?.role === '超級管理員';
  const isAdminModerator =
    isSuperAdminModerator ||
    currentUser?.isAdminUser === true ||
    currentUser?.role === '管理員';

  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionKeyword, setMentionKeyword] = useState('');
  const [likeStats, setLikeStats] = useState<Record<string, { likes: number; hasLiked: boolean }>>({});

  const myKeys = identityKeys(currentUser, visitor?.deviceId);
  const myId = myKeys[0] || 'guest';

  useEffect(() => {
    const initial = initialComments.filter(c => c.trackId === track?.id);
    setComments(initial);
    setLikeStats({});
    setInputText('');
    setReplyingTo(null);
    setErrorMsg(null);
    setIsMentionOpen(false);
    if (!isOpen || !track) return;
    const controller = new AbortController();
    setIsLoading(initial.length === 0);
    apiJson(`/api/tracks/${encodeURIComponent(track.id)}/comments`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setComments(Array.isArray(data) ? data : []); })
      .catch(error => { if (!controller.signal.aborted) setErrorMsg(error.message || '心得載入失敗'); })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false); });
    return () => controller.abort();
  }, [isOpen, track?.id]);

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);
    const cursorPos = e.target.selectionStart || val.length;
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
    if (!inputRef.current) return;
    const cursorPos = inputRef.current.selectionStart || inputText.length;
    const textBeforeCursor = inputText.slice(0, cursorPos);
    const textAfterCursor = inputText.slice(cursorPos);
    const lastAtIdx = Math.max(textBeforeCursor.lastIndexOf('@'), textBeforeCursor.lastIndexOf('＠'));
    if (lastAtIdx !== -1) {
      const newText = textBeforeCursor.slice(0, lastAtIdx) + `@${label} ` + textAfterCursor;
      setInputText(newText);
      setIsMentionOpen(false);
      setTimeout(() => {
        if (inputRef.current) {
          const nextPos = lastAtIdx + label.length + 2;
          inputRef.current.focus();
          inputRef.current.setSelectionRange(nextPos, nextPos);
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
        return (
          u.name.toLowerCase().includes(q) ||
          (u.center && u.center.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.rank && u.rank.toLowerCase().includes(q))
        );
      })
      .slice(0, 6)
      .map(u => ({
        type: 'member' as const,
        id: `u-${u.id}`,
        label: u.name,
        badge: [u.center, u.rank || '會員'].filter(Boolean).join(' ') || '會員',
        avatar: u.avatar
      }));

    const speakerMap = new Map<string, { name: string; avatar?: string }>();
    tracks.forEach(t => {
      if (t.speaker && t.speaker.trim()) {
        const s = t.speaker.trim();
        if (!speakerMap.has(s)) speakerMap.set(s, { name: s, avatar: t.speakerAvatar });
      }
    });

    const speakers = Array.from(speakerMap.values())
      .filter(s => !q || s.name.toLowerCase().includes(q))
      .slice(0, 5)
      .map(s => ({ type: 'speaker' as const, id: `spk-${s.name}`, label: s.name, badge: '音檔演講者', avatar: s.avatar }));

    const trackItems = tracks
      .filter(t => !q || t.title.toLowerCase().includes(q) || (t.speaker && t.speaker.toLowerCase().includes(q)))
      .slice(0, 4)
      .map(t => ({ type: 'track' as const, id: `t-${t.id}`, label: t.title, badge: t.speaker ? `講師：${t.speaker}` : '音檔', avatar: t.speakerAvatar }));

    return [...members, ...speakers, ...trackItems].slice(0, 12);
  }, [allUsers, tracks, mentionKeyword]);

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
        body: JSON.stringify({ identifier: myId, userId: currentUser?.id, userEmail: currentUser?.email, deviceId: visitor?.deviceId })
      });
      setLikeStats(prev => ({ ...prev, [comment.id]: { likes: data.likes, hasLiked: data.hasLiked } }));
    } catch (error) {
      setLikeStats(prev => ({ ...prev, [comment.id]: { likes: currentCount, hasLiked: currentLiked } }));
      setErrorMsg(error instanceof Error ? error.message : '按讚失敗，請重試。');
    } finally {
      pendingLikes.current.delete(comment.id);
    }
  };

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSubmitting || !track) return;

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      authorName: currentUser?.name || visitor?.fullName || '訪客',
      authorAvatar: currentUser?.avatar || visitor?.emoji || '💬',
      authorBadge: currentUser?.role === '超級管理員' ? '超級管理員' : currentUser?.isContributor ? '貢獻者' : (currentUser?.rank || '訪客'),
      authorEmail: currentUser?.email,
      deviceId: visitor?.deviceId,
      isAdmin: !!isAdmin,
      content: inputText.trim(),
      replyToId: replyingTo?.id,
      replyToAuthor: replyingTo?.authorName
    };

    try {
      const res = await fetch(`/api/tracks/${track.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || '心得失敗');
      }
      const data = await res.json();
      const newC = data.comment || data;
      setComments(prev => [newC, ...prev]);
      setInputText('');
      setReplyingTo(null);
      setIsMentionOpen(false);
      onCommentAdded?.();
    } catch (err: any) {
      setErrorMsg(err.message || '心得發送失敗，請稍後再試');
    } finally {
      setIsSubmitting(false);
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
      const matchedUser = allUsers.find(u => u.name && u.name.trim().toLowerCase() === normalized);
      const matchedSpeaker = tracks.find(t => t.speaker && t.speaker.trim().toLowerCase() === normalized);
      const matchedTrack = tracks.find(t => t.title && (t.title.trim().toLowerCase() === normalized || normalized.includes(t.title.trim().toLowerCase())));
      if (matchedUser) {
        elements.push(
          <button key={`mention-user-${match.index}`} type="button" onClick={e => { e.stopPropagation(); onViewMember?.(matchedUser); }} className="inline-flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold hover:underline bg-rose-50 dark:bg-rose-950/70 border border-rose-200/60 dark:border-rose-900/60 px-1.5 py-0.2 rounded-lg mx-0.5 text-xs cursor-pointer" title={`查看會員【${matchedUser.name}】檔案`}>
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
          <span key={`mention-track-${match.index}`} className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-semibold bg-indigo-50/80 dark:bg-indigo-950/60 border border-indigo-200/50 dark:border-indigo-800/50 px-1.5 py-0.2 rounded-md mx-0.5 text-xs select-none" title={`音檔：${matchedTrack.title}（主講：${matchedTrack.speaker}）`}>
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

  if (!isOpen || !track) return null;

  return (
    <div onClick={onClose} className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div onClick={e => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 flex flex-col max-h-[85dvh] relative">
        <div className="p-3.5 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] flex items-center justify-center shrink-0"><MessageSquare className="w-4 h-4" /></div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex flex-wrap items-center gap-1.5"><span>心得即時預覽</span><span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] font-mono font-bold">共 {comments.length} 則</span></h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-xs sm:max-w-sm mt-0.5">{track.speaker} · 《{track.title}》</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 overflow-y-auto min-h-0 flex-1 space-y-3">
          {isLoading ? <div className="text-center py-10 text-xs text-slate-400 animate-pulse">載入心得中...</div> : comments.length === 0 ? <div className="text-center py-10 text-xs text-slate-400">這部演講目前尚無心得，歡迎在下方搶先發表第一則心得！</div> : (() => {
            const threads = commentThreads(comments);
            const rootComments = threads.roots;
            const renderSingleComment = (c: Comment, isReply = false) => {
              const registeredAuthor = getRegisteredAuthor(c);
              const isVisitor = !registeredAuthor;
              const isAuthor = Boolean(c.authorEmail ? currentUser?.email && c.authorEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim() : c.deviceId && visitor?.deviceId && c.deviceId === visitor.deviceId);
              const isClickable = Boolean(registeredAuthor);
              const displayAuthorName = registeredAuthor?.name || c.authorName;
              const displayAuthorAvatar = registeredAuthor?.avatar || c.authorAvatar;
              const displayAuthorBadge = registeredAuthor ? (registeredAuthor.rank || '無') : null;
              const isRainbow = c.isAdmin || displayAuthorBadge === '貢獻者';
              const showBadge = !!displayAuthorBadge && displayAuthorBadge !== '訪客稱號' && displayAuthorBadge !== '無';
              const userLiked = likeStats[c.id] !== undefined ? likeStats[c.id].hasLiked : (c.likedBy || []).some(k => myKeys.includes(k));
              const userLikesCount = likeStats[c.id] !== undefined ? likeStats[c.id].likes : (c.likes || 0);
              const isAvatarUrl = displayAuthorAvatar && (displayAuthorAvatar.startsWith('http') || displayAuthorAvatar.startsWith('data:'));
              return (
                <div key={c.id} className={`space-y-1 ${isReply ? 'pt-2' : 'pt-3 first:pt-0'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div onClick={isClickable ? () => handleAuthorClick(c) : undefined} className={`flex items-center gap-1.5 flex-wrap ${isClickable ? 'cursor-pointer hover:opacity-85 transition-opacity' : 'cursor-default pointer-events-none select-none'}`} title={isClickable ? `點擊查看【${displayAuthorName}】會員檔案` : undefined}>
                      {isAvatarUrl ? <img src={displayAuthorAvatar} alt={displayAuthorName} className="w-5 h-5 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" /> : <span className="text-sm shrink-0">{displayAuthorAvatar || '👤'}</span>}
                      <span className={`font-bold ${isRainbow ? 'rainbow-admin-text' : isClickable ? 'text-slate-800 dark:text-slate-200 underline decoration-dotted underline-offset-2 hover:text-rose-600 transition-colors' : 'text-slate-700 dark:text-slate-300'}`}>{displayAuthorName}</span>
                      {isVisitor && <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] font-medium border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 select-none">訪客</span>}
                      {showBadge && <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] font-medium border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">{displayAuthorBadge}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-400 font-mono">{c.timestamp}</span>
                      <button type="button" onClick={() => handleLikeComment(c)} className={`flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer ${userLiked ? 'text-rose-600 bg-rose-50 dark:bg-rose-950/60 font-bold' : 'text-slate-400 hover:text-rose-500'}`} title={userLiked ? '取消讚' : '按讚這則心得'}><Heart className={`w-3 h-3 ${userLiked ? 'fill-rose-500 text-rose-500' : ''}`} /><span>{userLikesCount > 0 ? userLikesCount : ''}</span></button>
                      <button type="button" onClick={() => { setReplyingTo(c); setInputText(`@${displayAuthorName} `); inputRef.current?.focus(); }} className="flex items-center gap-0.5 text-[11px] text-slate-400 hover:text-[var(--color-primary,#c06c84)] px-1 py-0.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" title="回覆此心得"><Reply className="w-3 h-3" /><span>回覆</span></button>
                      {(isAuthor || isSuperAdminModerator || (isAdminModerator && isVisitor)) && onDeleteComment && <button type="button" onClick={async () => { try { await onDeleteComment(c.id); setComments(prev => prev.filter(item => item.id !== c.id)); } catch (error) { setErrorMsg(error instanceof Error ? error.message : '刪除心得失敗'); } }} className="p-1 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer" title="刪除心得" aria-label="刪除心得"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                  <CollapsibleCommentText
          className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed pl-6 whitespace-pre-wrap break-words"
          resetKey={`${c.id}:${c.content}`}
        >
          {c.replyToAuthor && <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1.5">回覆 @{c.replyToAuthor}：</span>}
          {renderFormattedContent(c.content)}
        </CollapsibleCommentText>
                </div>
              );
            };
            return <div className="space-y-3">{rootComments.map(parent => {
              const replies = threads.replies.get(parent.id) || [];
              return <div key={parent.id} className="pb-2 border-b border-slate-100 dark:border-slate-800/80 last:border-b-0">{renderSingleComment(parent, false)}{replies.length > 0 && <div className="pl-5 sm:pl-7 ml-3 mt-2 border-l-2 border-rose-200/70 dark:border-slate-700/80 space-y-2">{replies.map(reply => renderSingleComment(reply, true))}</div>}</div>;
            })}</div>;
          })()}
        </div>

        <form onSubmit={handleQuickSubmit} className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5 relative">
          {replyingTo && <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-2.5 py-1 rounded-lg"><span className="flex items-center gap-1"><Reply className="w-3 h-3" /><span>正在回覆 @{replyingTo.authorName}</span></span><button type="button" onClick={() => setReplyingTo(null)} className="hover:text-rose-900 cursor-pointer"><X className="w-3 h-3" /></button></div>}

          {isMentionOpen && (
            <div className="absolute left-3 right-3 bottom-full mb-1 z-40 max-h-40 overflow-y-auto bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-1.5 animate-in fade-in zoom-in-95">
              <div className="flex items-center justify-between px-2 py-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800 mb-1"><span>標記會員或演講者 ({combinedMentionSuggestions.length})</span><button type="button" onClick={() => setIsMentionOpen(false)} className="hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"><X className="w-3 h-3" /></button></div>
              {combinedMentionSuggestions.length === 0 ? <div className="p-2 text-center text-slate-400 text-xs">無符合的關聯字</div> : <div className="space-y-0.5">{combinedMentionSuggestions.map(item => (
                <button key={item.id} type="button" onClick={() => handleSelectMention(item.label)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-rose-50/80 dark:hover:bg-slate-800 text-left transition-colors cursor-pointer group">
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-1.5">{item.avatar ? <img src={item.avatar} alt="" className="w-4 h-4 rounded-full object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700" /> : <span className="text-[10px] shrink-0">{item.type === 'member' ? '👤' : item.type === 'speaker' ? '🎙️' : '🎵'}</span>}<span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate group-hover:text-[var(--color-primary,#c06c84)]">{item.label}</span></div>
                  <span className={`text-[9px] px-1.5 py-0.2 rounded-md font-medium shrink-0 ${item.type === 'speaker' ? 'bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 border border-purple-200 dark:border-purple-800' : item.type === 'member' ? 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-900' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{item.badge}</span>
                </button>
              ))}</div>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <input ref={inputRef} type="text" value={inputText} onChange={handleInputChange} placeholder={replyingTo ? `回覆 @${replyingTo.authorName}... (輸入 @ 或 ＠ 標記)` : currentUser ? `以 ${currentUser.name} 快速發表心得... (輸入 @ 或 ＠ 標記)` : '發表快速心得... (輸入 @ 或 ＠ 標記)'} maxLength={2000} className="min-w-0 flex-1 px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-hidden focus:ring-1 focus:ring-[var(--color-primary,#c06c84)]" />
            <button type="submit" disabled={isSubmitting || !inputText.trim()} className="px-3.5 py-2 rounded-xl text-white font-bold text-xs flex items-center gap-1 shadow-2xs hover:opacity-90 disabled:opacity-50 transition-all shrink-0 cursor-pointer" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}><Send className="w-3 h-3" /><span>{isSubmitting ? '送出中' : '送出'}</span></button>
          </div>

          {errorMsg && <div className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400"><ShieldAlert className="w-3 h-3 shrink-0" /><span>{errorMsg}</span></div>}
        </form>
      </div>
    </div>
  );
};
