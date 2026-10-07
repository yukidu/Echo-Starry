from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


notifications = r'''import { effectiveMemberRank } from '../utils/ranks';
import { ThemedSelect } from './ThemedSelect';
import React, { useMemo, useRef, useState } from 'react';
import {
  Bell,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  MessageSquare,
  Play,
  Radio,
  Reply,
  X
} from 'lucide-react';
import { UserProfile, AmwayRank, RANK_ORDER, Track, Comment } from '../types';

interface NotificationsViewProps {
  users: UserProfile[];
  currentUser: UserProfile | null;
  isAdmin: boolean;
  isAdministrator?: boolean;
  onApproveRank: (userId: string, rank?: AmwayRank) => Promise<void>;
  onViewMember?: (user: UserProfile) => void;
  comments?: Comment[];
  tracks?: Track[];
  onSelectTrack?: (track: Track, commentId?: string) => void;
  onAddComment?: (trackId: string, content: string, replyToId?: string, replyToAuthor?: string) => Promise<void>;
}

type NotificationTab = 'messages' | 'pending' | 'new-members';

const dateValue = (value?: string | number | null) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (!value) return 0;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

const shortDate = (value?: string | number | null) => {
  if (!value) return '近期';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleDateString('zh-TW', { year: 'numeric', month: 'numeric', day: 'numeric' });
};

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  users,
  currentUser,
  isAdmin,
  onApproveRank,
  onViewMember,
  comments = [],
  tracks = [],
  onSelectTrack,
  onAddComment
}) => {
  const cleanEmail = currentUser?.email?.toLowerCase().trim() || '';
  const canAudit = isAdmin || cleanEmail === 'yukidu@gmail.com' || currentUser?.role === '獎銜審核員';
  const currentRank = effectiveMemberRank(currentUser, '');
  const currentRankIndex = (RANK_ORDER as readonly string[]).indexOf(currentRank);
  const platinumIndex = (RANK_ORDER as readonly string[]).indexOf('白金');
  const isPlatinumOrAbove = platinumIndex >= 0 && currentRankIndex >= platinumIndex;
  const canSeePending = canAudit || isPlatinumOrAbove;

  const [activeTab, setActiveTab] = useState<NotificationTab>('messages');
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isQuickReplying, setIsQuickReplying] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [modifiedRank, setModifiedRank] = useState<AmwayRank>('3%');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [dismissedMentionIds, setDismissedMentionIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const stored = localStorage.getItem('sq_dismissed_mentions');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [internalComments, setInternalComments] = useState<Comment[]>(comments);

  React.useEffect(() => {
    if (comments.length > 0) setInternalComments(comments);
  }, [comments]);

  React.useEffect(() => {
    if (activeTab === 'pending' && !canSeePending) setActiveTab('messages');
  }, [activeTab, canSeePending]);

  React.useEffect(() => {
    let cancelled = false;
    void fetch('/api/comments')
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && Array.isArray(data)) setInternalComments(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const dismissMention = (commentId: string) => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('sq_dismissed_mentions');
        const list: string[] = stored ? JSON.parse(stored) : [];
        if (!list.includes(commentId)) {
          list.push(commentId);
          localStorage.setItem('sq_dismissed_mentions', JSON.stringify(list));
        }
      } catch {}
    }
    setDismissedMentionIds(prev => (prev.includes(commentId) ? prev : [...prev, commentId]));
    setInternalComments(prev => prev.filter(comment => comment.id !== commentId));
  };

  const mentionNotifications = useMemo(() => {
    const list = internalComments.length > 0 ? internalComments : comments;
    const myName = currentUser?.name?.trim().toLowerCase();
    return list
      .filter(comment => {
        if (!comment.content || dismissedMentionIds.includes(comment.id)) return false;
        const isSelf =
          (comment.authorEmail && currentUser?.email && comment.authorEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
          (comment.authorName && currentUser?.name && comment.authorName.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
        if (isSelf) return false;
        return comment.content.includes('@') || comment.content.includes('＠');
      })
      .map(comment => {
        const track = tracks.find(trackItem => trackItem.id === comment.trackId);
        const authorUser = users.find(user =>
          (comment.authorEmail && user.email && user.email.toLowerCase().trim() === comment.authorEmail.toLowerCase().trim()) ||
          (user.name && user.name === comment.authorName)
        );
        const lower = comment.content.toLowerCase();
        const isDirectMention = myName
          ? lower.includes(`@${myName}`) || lower.includes(`＠${myName}`) || comment.replyToAuthor?.toLowerCase().trim() === myName
          : false;
        return {
          id: `mention-${comment.id}`,
          comment,
          track,
          authorUser,
          isDirectMention,
          createdAt: comment.createdAt || 0,
          timestamp: comment.timestamp || '近期'
        };
      })
      .sort((a, b) => {
        if (a.isDirectMention !== b.isDirectMention) return a.isDirectMention ? -1 : 1;
        return Number(b.createdAt || 0) - Number(a.createdAt || 0);
      })
      .slice(0, 100);
  }, [internalComments, comments, currentUser, tracks, users, dismissedMentionIds]);

  const pendingUsers = useMemo(
    () => users
      .filter(user => user.rankAuditStatus === 'pending' || user.rankApproved === false)
      .sort((a, b) => dateValue(b.rankUpdatedAt || b.registerDate) - dateValue(a.rankUpdatedAt || a.registerDate)),
    [users]
  );

  const newMembers = useMemo(
    () => users
      .filter(user =>
        user.email?.toLowerCase().trim() !== 'yukidu@gmail.com' &&
        (user.rankAuditStatus === 'approved' || user.rankApproved === true)
      )
      .sort((a, b) => dateValue(b.registerDate || b.auditedAt) - dateValue(a.registerDate || a.auditedAt))
      .slice(0, 50),
    [users]
  );

  const handleScrollTabs = (direction: 'left' | 'right') => {
    tabsContainerRef.current?.scrollBy({ left: direction === 'left' ? -160 : 160, behavior: 'smooth' });
  };

  const handleQuickApprove = async (userId: string) => {
    if (!canAudit) return;
    setIsSubmitting(true);
    try {
      await onApproveRank(userId);
    } catch (error) {
      alert(error instanceof Error ? error.message : '審核儲存失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModifyAndApprove = async (userId: string) => {
    if (!canAudit) return;
    setIsSubmitting(true);
    try {
      await onApproveRank(userId, modifiedRank);
      setEditingUserId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '審核儲存失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const tabClass = (tab: NotificationTab) =>
    `pb-2 px-2 font-bold border-b-2 shrink-0 transition-colors ${
      activeTab === tab
        ? 'border-rose-500 text-rose-600 dark:text-rose-400'
        : 'border-transparent text-slate-500 dark:text-slate-400'
    }`;

  return (
    <div className="space-y-3 max-w-2xl mx-auto pb-24">
      <div className="rounded-3xl overflow-hidden bg-white dark:bg-slate-900 border border-rose-100 dark:border-slate-800 shadow-xs">
        <div className="p-4 sm:p-5 bg-gradient-to-r from-rose-50/90 via-white to-amber-50/90 dark:from-slate-800/90 dark:via-slate-900/90 dark:to-slate-800/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}>
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100">繁星動態通知與獎銜審核</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                訊息、審核與近期加入會員
              </p>
            </div>
          </div>
        </div>

        {/* 分頁樣式與個人中心一致：底線式橫向分頁，左右箭頭可移動。 */}
        <div className="flex items-center border-t border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-1 pt-1.5 gap-1">
          <button
            type="button"
            onClick={() => handleScrollTabs('left')}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
            title="向左移動標籤"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div ref={tabsContainerRef} className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth px-1 text-xs">
            <button type="button" onClick={() => setActiveTab('messages')} className={tabClass('messages')}>
              我的訊息
            </button>
            {canSeePending && (
              <button type="button" onClick={() => setActiveTab('pending')} className={tabClass('pending')}>
                未審合
              </button>
            )}
            <button type="button" onClick={() => setActiveTab('new-members')} className={tabClass('new-members')}>
              新會員
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleScrollTabs('right')}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
            title="向右移動標籤"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {activeTab === 'messages' && (
        <div className="space-y-2">
          {mentionNotifications.length === 0 ? (
            <div className="py-10 px-4 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-400 text-xs">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-500 dark:text-slate-300">目前沒有新訊息</p>
              <p className="mt-1">有人在心得中標記你時，會顯示在這裡。</p>
            </div>
          ) : mentionNotifications.map(message => {
            const displayAuthorName = message.authorUser?.name || message.comment.authorName;
            const displayAvatar = message.authorUser?.avatar || message.comment.authorAvatar;
            const displayBadge = message.authorUser
              ? message.authorUser.role === '超級管理員'
                ? '管理員'
                : message.authorUser.isContributor
                  ? '貢獻者'
                  : effectiveMemberRank(message.authorUser, message.comment.authorBadge || '無')
              : message.comment.authorBadge;

            return (
              <div key={message.id} className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <div className="flex items-start gap-2.5">
                  <button
                    type="button"
                    onClick={() => message.authorUser && onViewMember?.(message.authorUser)}
                    className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    title={message.authorUser ? `查看 ${displayAuthorName}` : undefined}
                  >
                    {displayAvatar && (displayAvatar.startsWith('http') || displayAvatar.startsWith('data:')) ? (
                      <img src={displayAvatar} alt={displayAuthorName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-sm">{displayAvatar || '💬'}</span>
                    )}
                  </button>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                        <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">{displayAuthorName}</span>
                        {displayBadge && displayBadge !== '無' && displayBadge !== '訪客稱號' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{displayBadge}</span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{message.timestamp}</span>
                    </div>

                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 min-w-0">
                      <span>{message.isDirectMention ? '標記了你' : '在心得中提及你'}</span>
                      {message.track && (
                        <>
                          <span>·</span>
                          <Radio className="w-3 h-3 shrink-0" />
                          <span className="truncate">{message.track.title}</span>
                        </>
                      )}
                    </div>

                    <p className="mt-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs leading-relaxed text-slate-700 dark:text-slate-200 break-words">
                      {message.comment.content}
                    </p>

                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {message.track && onSelectTrack && (
                        <button
                          type="button"
                          onClick={() => {
                            dismissMention(message.comment.id);
                            onSelectTrack(message.track!, message.comment.id);
                          }}
                          className="px-2.5 py-1 rounded-lg text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs"
                          style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                        >
                          <Play className="w-3 h-3" />
                          查看心得
                        </button>
                      )}
                      {message.track && onAddComment && (
                        <button
                          type="button"
                          onClick={() => {
                            if (replyingCommentId === message.comment.id) {
                              setReplyingCommentId(null);
                            } else {
                              setReplyingCommentId(message.comment.id);
                              setQuickReplyText(`@${displayAuthorName} `);
                            }
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-[11px] flex items-center gap-1"
                        >
                          <Reply className="w-3 h-3" />
                          回覆
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => dismissMention(message.comment.id)}
                        className="px-2.5 py-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-[11px]"
                      >
                        略過
                      </button>
                    </div>

                    {replyingCommentId === message.comment.id && message.track && onAddComment && (
                      <div className="mt-2 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 space-y-1.5">
                        <textarea
                          value={quickReplyText}
                          onChange={event => setQuickReplyText(event.target.value)}
                          rows={2}
                          placeholder={`回覆 ${displayAuthorName}`}
                          className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 outline-hidden resize-none"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button type="button" onClick={() => setReplyingCommentId(null)} className="px-2.5 py-1 text-xs text-slate-500">取消</button>
                          <button
                            type="button"
                            disabled={isQuickReplying || !quickReplyText.trim()}
                            onClick={async () => {
                              if (!quickReplyText.trim()) return;
                              setIsQuickReplying(true);
                              try {
                                await onAddComment(message.track!.id, quickReplyText.trim(), message.comment.id, displayAuthorName);
                                dismissMention(message.comment.id);
                                setReplyingCommentId(null);
                                setQuickReplyText('');
                              } finally {
                                setIsQuickReplying(false);
                              }
                            }}
                            className="px-3 py-1 rounded-lg text-white font-bold text-xs disabled:opacity-50"
                            style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                          >
                            {isQuickReplying ? '送出中…' : '送出'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {activeTab === 'pending' && canSeePending && (
        <div className="space-y-2">
          {pendingUsers.length === 0 ? (
            <div className="py-10 px-4 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-400 text-xs">
              <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
              <p className="font-bold text-slate-500 dark:text-slate-300">目前沒有未審合會員</p>
            </div>
          ) : pendingUsers.map(user => (
            <div key={user.id} className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-amber-200/80 dark:border-amber-900/70 shadow-2xs">
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => onViewMember?.(user)}
                  className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center">👤</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100">{user.name}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold">未審合</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-x-2 gap-y-1 flex-wrap">
                    <span>會場：{user.center || '未填'}</span>
                    <span>申請獎銜：<strong>{user.rank || '無'}</strong></span>
                    <span className="text-slate-400">{user.rankUpdatedAt || user.registerDate || '近期'}</span>
                  </div>

                  {canAudit && (
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {editingUserId === user.id ? (
                        <>
                          <ThemedSelect
                            value={modifiedRank}
                            onChange={event => setModifiedRank(event.target.value as AmwayRank)}
                            className="text-xs px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700"
                          >
                            {RANK_ORDER.map(rank => <option key={rank} value={rank}>{rank}</option>)}
                          </ThemedSelect>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleModifyAndApprove(user.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> 儲存並通過
                          </button>
                          <button type="button" onClick={() => setEditingUserId(null)} className="p-1 text-slate-400"><X className="w-3.5 h-3.5" /></button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleQuickApprove(user.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1"
                          >
                            <CheckCircle className="w-3 h-3" /> 通過
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingUserId(user.id);
                              setModifiedRank(user.rank || '無');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold flex items-center gap-1"
                          >
                            <Edit3 className="w-3 h-3" /> 修改獎銜
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'new-members' && (
        <div className="space-y-2">
          {newMembers.length === 0 ? (
            <div className="py-10 px-4 text-center bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-400 text-xs">
              <Bell className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-bold text-slate-500 dark:text-slate-300">目前沒有新會員資料</p>
            </div>
          ) : newMembers.map(user => {
            const displayRank = effectiveMemberRank(user, user.rank || '無');
            return (
              <div key={user.id} className="p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => onViewMember?.(user)}
                    className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                    title={`查看 ${user.name}`}
                  >
                    {user.avatar ? <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" /> : <span className="w-full h-full flex items-center justify-center">👤</span>}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 truncate">{user.name}</span>
                      {displayRank && displayRank !== '無' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">{displayRank}</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span>{user.center || '未填會場'}</span>
                      <span>·</span>
                      <Clock className="w-3 h-3" />
                      <span>{shortDate(user.registerDate || user.auditedAt)}</span>
                    </div>
                  </div>
                  {onViewMember && (
                    <button
                      type="button"
                      onClick={() => onViewMember(user)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold shrink-0"
                    >
                      查看
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
'''
Path('src/components/NotificationsView.tsx').write_text(notifications + '\n')

app_path = Path('src/App.tsx')
app = app_path.read_text()
app = replace_once(
    app,
    "  const isAdmin = isSuperAdmin;\n  const canUpload = isSuperAdmin || currentUser?.isContributor === true;\n",
    "  const isAdmin = isSuperAdmin;\n  const canUpload = isSuperAdmin || currentUser?.isContributor === true;\n  const notificationRank = effectiveMemberRank(currentUser, '');\n  const notificationRankIndex = (RANK_ORDER as readonly string[]).indexOf(notificationRank);\n  const notificationPlatinumIndex = (RANK_ORDER as readonly string[]).indexOf('白金');\n  const canSeePendingAuditNotifications =\n    isSuperAdmin ||\n    currentUser?.role === '獎銜審核員' ||\n    (notificationPlatinumIndex >= 0 && notificationRankIndex >= notificationPlatinumIndex);\n",
    'add pending audit visibility policy'
)
app = replace_once(
    app,
    "  const pendingAuditCount = allUsers.filter(u => u.rankAuditStatus === 'pending' || u.rankApproved === false).length;\n",
    "  const pendingAuditCount = canSeePendingAuditNotifications\n    ? allUsers.filter(u => u.rankAuditStatus === 'pending' || u.rankApproved === false).length\n    : 0;\n",
    'hide audit badge count from unauthorized users'
)
app = replace_once(
    app,
    "    return auditCount + mentionCount + Number(stickerSummary?.unreadNotifications || 0);\n  }, [allUsers, comments, allComments, currentUser, stickerSummary?.unreadNotifications]);\n",
    "    return (canSeePendingAuditNotifications ? auditCount : 0) + mentionCount;\n  }, [allUsers, comments, allComments, currentUser, canSeePendingAuditNotifications]);\n",
    'remove sticker unread count and protect audit count'
)
app_path.write_text(app)

Path('tests/v116NotificationTabs.test.ts').write_text(r'''import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const notifications = readFileSync(new URL('../src/components/NotificationsView.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('notification tabs match the personal-center underline navigation and sticker tab is removed', () => {
  assert.equal(notifications.includes('我的訊息'), true);
  assert.equal(notifications.includes('未審合'), true);
  assert.equal(notifications.includes('新會員'), true);
  assert.equal(notifications.includes('貼紙通知'), false);
  assert.equal(notifications.includes('/api/stickers/notifications'), false);
  assert.equal(notifications.includes('ChevronLeft'), true);
  assert.equal(notifications.includes('ChevronRight'), true);
  assert.equal(notifications.includes('border-b-2'), true);
});

test('pending review tab is visible only to reviewers, platinum-and-above, or super admin', () => {
  assert.equal(notifications.includes("currentUser?.role === '獎銜審核員'"), true);
  assert.equal(notifications.includes("indexOf('白金')"), true);
  assert.equal(notifications.includes('canSeePending && ('), true);
  assert.equal(app.includes('canSeePendingAuditNotifications'), true);
  assert.equal(app.includes('const pendingAuditCount = canSeePendingAuditNotifications'), true);
});

test('bell badge no longer counts sticker notifications', () => {
  assert.equal(app.includes('return (canSeePendingAuditNotifications ? auditCount : 0) + mentionCount;'), true);
  assert.equal(app.includes('auditCount + mentionCount + Number(stickerSummary?.unreadNotifications || 0)'), false);
});
''')
