import { ThemedSelect } from './ThemedSelect';
import React, { useState, useMemo } from 'react';
import {
  Bell,
  CheckCircle,
  Clock,
  Sparkles,
  ShieldCheck,
  Building,
  Award,
  ChevronRight,
  Filter,
  Check,
  Edit3,
  X,
  AtSign,
  MessageSquare,
  Radio,
  Play,
  Reply,
  Gift
} from 'lucide-react';
import { UserProfile, AmwayRank, RANK_ORDER, Track, Comment } from '../types';

interface NotificationsViewProps {
  users: UserProfile[];
  currentUser: UserProfile | null;
  isAdmin: boolean; // Super admin
  isAdministrator?: boolean; // Regular admin
  onApproveRank: (userId: string, rank?: AmwayRank) => Promise<void>;
  onViewMember?: (user: UserProfile) => void;
  comments?: Comment[];
  tracks?: Track[];
  onSelectTrack?: (track: Track, commentId?: string) => void;
  onAddComment?: (trackId: string, content: string, replyToId?: string, replyToAuthor?: string) => Promise<void>;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({
  users,
  currentUser,
  isAdmin,
  isAdministrator,
  onApproveRank,
  onViewMember,
  comments = [],
  tracks = [],
  onSelectTrack,
  onAddComment
}) => {
  const canAudit = isAdmin || isAdministrator || currentUser?.email === 'yukidu@gmail.com' || currentUser?.isAdminUser === true;
  // Requirement 1: 不要讓訪客看見「通知頁」的審核人員的名字
  const isVisitor = !currentUser || (currentUser as any).isVisitor || !currentUser.email;

  // Quick reply state (Requirement 6: 可以快速回覆或點選跳轉到該心得)
  const [replyingCommentId, setReplyingCommentId] = useState<string | null>(null);
  const [quickReplyText, setQuickReplyText] = useState('');
  const [isQuickReplying, setIsQuickReplying] = useState(false);
  const [quickReplySuccessId, setQuickReplySuccessId] = useState<string | null>(null);

  // Requirement 6 (v2.6): 用戶已按「快速回覆」或已按「跳轉心得」的按鈕之後，則該通知會從通知頁自動消失
  const [dismissedMentionIds, setDismissedMentionIds] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('sq_dismissed_mentions');
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [];
  });

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
    setInternalComments(prev => prev.filter(c => c.id !== commentId));
  };

  // Requirement 6 (v2.4): 本地即時 comments 狀態，確保首頁快速心得與全站心得即時出現在通知中
  const [internalComments, setInternalComments] = useState<Comment[]>(comments);

  const fetchLatestComments = async () => {
    try {
      const res = await fetch('/api/comments');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInternalComments(data);
        }
      }
    } catch {}
  };

  React.useEffect(() => {
    fetchLatestComments();
  }, []);

  React.useEffect(() => {
    if (comments && comments.length > 0) {
      setInternalComments(comments);
    }
  }, [comments]);

  // Requirement 3 & 4 (v2.2) & Requirement 5 & 6 (v2.4): 置頂主選單「通知」頁面，「被標記的心得」置頂排第一位
  // 修復首頁快速心得被 @ 或 ＠ 標記時未出現在通知的問題
  const mentionNotifications = useMemo(() => {
    const list = internalComments && internalComments.length > 0 ? internalComments : comments;
    if (!list || list.length === 0) return [];
    const myName = currentUser?.name?.trim().toLowerCase();

    return list
      .filter(c => {
        if (!c.content) return false;
        // Requirement 6 (v2.6 & v2.7): 已按快速回覆或跳轉心得則自動消失
        if (dismissedMentionIds.includes(c.id)) return false;

        // Exclude own comments so user's quick reply doesn't appear as a notification for themselves!
        const isSelf =
          (c.authorEmail && currentUser?.email && c.authorEmail.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
          (c.authorName && currentUser?.name && c.authorName.toLowerCase().trim() === currentUser.name.toLowerCase().trim());
        if (isSelf) return false;

        // 包含半形 @ 或全形 ＠ 標記之心得
        return c.content.includes('@') || c.content.includes('＠');
      })
      .map(c => {
        const track = tracks.find(t => t.id === c.trackId);
        const authorUser = users.find(
          u =>
            (c.authorEmail && u.email && u.email.toLowerCase().trim() === c.authorEmail.toLowerCase().trim()) ||
            (u.name && u.name === c.authorName)
        );
        const lower = c.content.toLowerCase();
        const isDirectMention = myName
          ? (lower.includes(`@${myName}`) || lower.includes(`＠${myName}`) || (c.replyToAuthor && c.replyToAuthor.toLowerCase().trim() === myName))
          : false;

        return {
          id: `mention-${c.id}`,
          comment: c,
          track,
          authorUser,
          isDirectMention,
          timestamp: c.timestamp || '近期',
          createdAt: c.createdAt || 0
        };
      })
      .sort((a, b) => {
        if (a.isDirectMention !== b.isDirectMention) {
          return a.isDirectMention ? -1 : 1;
        }
        return (b.createdAt || 0) - (a.createdAt || 0);
      })
      .slice(0, 100); // Requirement 3: 保留前100則心得
  }, [internalComments, comments, currentUser, tracks, users, dismissedMentionIds]);

  const [stickerNotifications, setStickerNotifications] = useState<any[]>([]);
  const loadStickerNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/stickers/notifications');
      if (!res.ok) return;
      const data = await res.json();
      setStickerNotifications(Array.isArray(data.notifications) ? data.notifications : []);
    } catch {}
  };
  React.useEffect(() => { void loadStickerNotifications(); }, [currentUser?.id]);
  const openStickerNotifications = async () => {
    setFilterType('stickers');
    if (!currentUser) return;
    try {
      await fetch('/api/stickers/notifications/read', { method: 'POST' });
      await loadStickerNotifications();
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
    } catch {}
  };

  // Requirement 5 (v2.4): 刪除「所有通知」，預設為「被標記的心得」('mentions')
  const [filterType, setFilterType] = useState<'mentions' | 'stickers' | 'pending' | 'approved'>('mentions');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [modifiedRank, setModifiedRank] = useState<AmwayRank>('3%');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Group notifications into pending (unlimited) and approved (limit 50, at the end)
  const pendingUsers = users.filter(u => u.rankAuditStatus === 'pending' || u.rankApproved === false);
  const approvedUsers = users.filter(u => u.rankAuditStatus === 'approved' || (u.rankApproved === true && u.email !== 'yukidu@gmail.com'));

  // Sort approved users by auditedAt or rankUpdatedAt or registerDate desc
  const sortedApproved = [...approvedUsers].sort((a, b) => {
    const tA = new Date(a.auditedAt || a.rankUpdatedAt || a.registerDate || 0).getTime();
    const tB = new Date(b.auditedAt || b.rankUpdatedAt || b.registerDate || 0).getTime();
    return tB - tA;
  }).slice(0, 50); // limit 50

  // Combine: All pending first, then up to 50 approved
  const combinedList = [...pendingUsers, ...sortedApproved];

  const displayUserList = combinedList.filter(u => {
    if (filterType === 'pending') {
      return u.rankAuditStatus === 'pending' || u.rankApproved === false;
    }
    if (filterType === 'approved') {
      return u.rankAuditStatus === 'approved' || u.rankApproved === true;
    }
    if (filterType === 'mentions' || filterType === 'stickers') {
      return false; // special notification tabs render independently
    }
    return true;
  });

  const handleQuickApprove = async (userId: string) => {
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

  return (
    <div className="space-y-4 max-w-2xl mx-auto pb-24">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-3xl bg-gradient-to-r from-rose-50/90 via-white to-amber-50/90 dark:from-slate-800/90 dark:via-slate-900/90 dark:to-slate-800/90 border border-rose-100 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-xs"
              style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
            >
              <Bell className="w-5 h-5 animate-bounce-subtle" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>繁星動態通知與獎銜審核</span>
                {pendingUsers.length > 0 && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold animate-pulse">
                    {pendingUsers.length} 位待審核
                  </span>
                )}
              </h2>
            </div>
          </div>
        </div>

        {/* Filter Tabs - Requirement 5 (v2.4): 把「@被標記的心得」分頁移到第一位，刪除「所有通知」分頁，整排選項左右更緊密排列，窄螢幕自動縮小字體 */}
        <div className="grid grid-cols-4 gap-1 sm:gap-1.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 w-full text-[9px] sm:text-xs">
          <button
            type="button"
            onClick={() => setFilterType('mentions')}
            className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 tracking-tight truncate cursor-pointer ${
              filterType === 'mentions'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-rose-600 dark:text-rose-400 border border-rose-200/70 dark:border-slate-700 hover:bg-rose-50/50'
            }`}
          >
            <AtSign className="w-3 h-3 shrink-0 stroke-[2.5]" />
            <span className="truncate">@被標記心得</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] shrink-0 font-bold ${
              filterType === 'mentions' ? 'bg-white text-rose-600' : 'bg-rose-500 text-white'
            }`}>
              {mentionNotifications.length}
            </span>
          </button>

          <button
            type="button"
            onClick={openStickerNotifications}
            className={`w-full py-1.5 sm:py-2 px-1 rounded-xl font-bold transition-all flex items-center justify-center gap-1 truncate cursor-pointer ${
              filterType === 'stickers'
                ? 'bg-violet-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-300 border border-violet-200/70 dark:border-slate-700'
            }`}
          >
            <Gift className="w-3 h-3 shrink-0" />
            <span className="truncate">貼紙通知</span>
            <span className="px-1 rounded-full text-[9px] bg-violet-100 text-violet-700">{stickerNotifications.filter(n => !n.readAt).length}</span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('pending')}
            className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 tracking-tight truncate cursor-pointer ${
              filterType === 'pending'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-amber-600 dark:text-amber-400 border border-amber-200/70 dark:border-slate-700 hover:bg-amber-50/50'
            }`}
          >
            <span className="truncate">待審核名冊</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] shrink-0 font-bold ${
              filterType === 'pending' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
            }`}>
              {pendingUsers.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setFilterType('approved')}
            className={`w-full py-1.5 sm:py-2 px-1 sm:px-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1 sm:gap-1.5 tracking-tight truncate cursor-pointer ${
              filterType === 'approved'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/70 dark:border-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className="truncate">已通過核准</span>
            <span className={`px-1.5 py-0.2 rounded-full text-[9px] sm:text-[10px] shrink-0 font-bold ${
              filterType === 'approved' ? 'bg-white text-emerald-600' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}>
              {sortedApproved.length}
            </span>
          </button>
        </div>
      </div>

      {/* Permission note for admin */}
      {canAudit && (
        <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
          <span>您具備【獎銜審核員 / 超級管理員】權限，可在此直接審核或修改會員獎銜。</span>
        </div>
      )}

      {/* Notification List */}
      <div className="space-y-2">
        {filterType === 'stickers' && stickerNotifications.length === 0 && (
          <div className="p-6 text-center text-sm text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800">目前沒有貼紙通知</div>
        )}
        {filterType === 'stickers' && stickerNotifications.map(notification => (
          <div key={notification.id} className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-violet-200/70 dark:border-slate-800 shadow-2xs">
            <div className="flex items-start gap-2">
              <Gift className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-black text-sm text-slate-900 dark:text-slate-100">{notification.title}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 break-words">{notification.message}</p>
                <p className="text-[10px] text-slate-400 mt-1">{new Date(notification.createdAt).toLocaleString('zh-TW')}</p>
              </div>
            </div>
          </div>
        ))}

        {/* TAB 1: 被標記的心得 - Requirement 6 (v2.5): 緊密排版，刪除左上角重複出現的「＠標記了你」標題 */}
        {filterType === 'mentions' &&
          mentionNotifications.map(m => {
            const displayAuthorName = m.authorUser?.name || m.comment.authorName;
            const displayAvatar = m.authorUser?.avatar || m.comment.authorAvatar;
            const displayBadge = m.authorUser
              ? m.authorUser.role === '超級管理員'
                ? '管理員'
                : m.authorUser.isContributor
                ? '貢獻者'
                : m.authorUser.rank || m.comment.authorBadge
              : m.comment.authorBadge;

            return (
              <div
                key={m.id}
                className="p-3 sm:p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-rose-200/70 dark:border-slate-800 hover:border-rose-300 dark:hover:border-slate-700 shadow-2xs transition-all space-y-2"
              >
                {/* Header Row: Author info, track badge & timestamp (No repeating "@ 標記了你" badge) */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      onClick={() => m.authorUser && onViewMember && onViewMember(m.authorUser)}
                      className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 ${
                        m.authorUser ? 'cursor-pointer hover:ring-2 hover:ring-rose-400' : ''
                      }`}
                      title={m.authorUser ? `查看【${displayAuthorName}】會員檔案` : undefined}
                    >
                      {displayAvatar && (displayAvatar.startsWith('http') || displayAvatar.startsWith('data:')) ? (
                        <img src={displayAvatar} alt={displayAuthorName} className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-sm">{displayAvatar || '💬'}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                      <button
                        type="button"
                        onClick={() => m.authorUser && onViewMember && onViewMember(m.authorUser)}
                        className={`font-bold text-xs text-slate-900 dark:text-slate-100 truncate ${
                          m.authorUser ? 'hover:text-rose-600 underline decoration-dotted' : ''
                        }`}
                      >
                        {displayAuthorName}
                      </button>

                      {displayBadge && displayBadge !== '無' && displayBadge !== '訪客稱號' && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-medium border border-rose-100 dark:border-rose-900/60 shrink-0">
                          {displayBadge}
                        </span>
                      )}

                      <span className="text-[11px] text-slate-500 dark:text-slate-400 shrink-0">
                        {m.isDirectMention ? '標記了你' : '提及了相關關鍵字'}
                      </span>

                      {/* Track name inline */}
                      {m.track && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold truncate">
                          <Radio className="w-3 h-3 shrink-0" />
                          <span className="truncate">《{m.track.title}》</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono shrink-0">
                    {m.timestamp}
                  </span>
                </div>

                {/* Comment speech bubble with quote */}
                <div className="p-2 sm:p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 text-xs text-slate-700 dark:text-slate-200 leading-relaxed relative">
                  <p className="break-words">
                    {m.comment.content}
                  </p>
                </div>

                {/* Bottom Action buttons */}
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {m.track && onSelectTrack && (
                    <button
                      type="button"
                      onClick={() => {
                        dismissMention(m.comment.id);
                        onSelectTrack(m.track!, m.comment.id);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold text-[11px] flex items-center gap-1 shadow-2xs hover:brightness-105 active:scale-95 transition-all cursor-pointer"
                      title="跳轉到該錄音檔與心得位置，並從通知頁移除"
                    >
                      <Play className="w-2.5 h-2.5 fill-white" />
                      <span>跳轉心得</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (replyingCommentId === m.comment.id) {
                        setReplyingCommentId(null);
                      } else {
                        setReplyingCommentId(m.comment.id);
                        setQuickReplyText(`@${displayAuthorName} `);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/70 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer border border-rose-200/60 dark:border-rose-900/60"
                    title="在通知頁面直接快速回覆該心得"
                  >
                    <Reply className="w-2.5 h-2.5" />
                    <span>快速回覆</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => dismissMention(m.comment.id)}
                    className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium text-[11px] hover:bg-slate-200 transition-colors cursor-pointer"
                    title="已處理，將此通知移除"
                  >
                    略過通知
                  </button>
                </div>

                    {/* Inline Quick Reply Box */}
                    {replyingCommentId === m.comment.id && (
                      <div className="mt-2.5 p-2.5 rounded-2xl bg-white/95 dark:bg-slate-800/90 border border-rose-200 dark:border-rose-900/60 shadow-xs space-y-2 animate-in fade-in">
                        <textarea
                          value={quickReplyText}
                          onChange={e => setQuickReplyText(e.target.value)}
                          placeholder={`回覆 @${displayAuthorName}...`}
                          rows={2}
                          className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-hidden resize-none focus:ring-1 focus:ring-rose-400"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] text-slate-400">
                            發送後將自動寫入該音檔的心得收穫區並從通知移除
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setReplyingCommentId(null)}
                              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 cursor-pointer"
                            >
                              取消
                            </button>
                            <button
                              type="button"
                              disabled={isQuickReplying || !quickReplyText.trim()}
                              onClick={async () => {
                                if (!onAddComment || !m.track || !quickReplyText.trim()) return;
                                setIsQuickReplying(true);
                                try {
                                  await onAddComment(m.track.id, quickReplyText.trim(), m.comment.id, displayAuthorName);
                                  dismissMention(m.comment.id);
                                  setReplyingCommentId(null);
                                  setQuickReplyText('');
                                  setQuickReplySuccessId(m.comment.id);
                                  setTimeout(() => setQuickReplySuccessId(null), 3500);
                                } finally {
                                  setIsQuickReplying(false);
                                }
                              }}
                              className="px-3 py-1 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                            >
                              {isQuickReplying ? '送出中...' : '送出回覆'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {quickReplySuccessId === m.comment.id && (
                      <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-1 animate-in fade-in">
                        <Check className="w-3.5 h-3.5" /> 已成功送出回覆！已同步至該音檔的心得收穫區。
                      </div>
                    )}
              </div>
            );
          })}

        {filterType === 'mentions' ? (
          mentionNotifications.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-400 text-xs space-y-1">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p>目前尚無被 @ 或 ＠ 標記的心得紀錄</p>
            </div>
          )
        ) : displayUserList.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 text-slate-400 text-xs space-y-1">
            <Bell className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p>目前無符合此分類的通知項目</p>
          </div>
        ) : (
          displayUserList.map((user, idx) => {
            const isPending = user.rankAuditStatus === 'pending' || user.rankApproved === false;
            const isNewRegister = user.rankAuditType === 'new_register' || !user.approvedRank || user.approvedRank === '無';
            const displayTime = user.rankUpdatedAt || user.registerDate || '剛剛';

            return (
              <div
                key={user.id || idx}
                className={`p-4 rounded-3xl bg-white dark:bg-slate-900 border transition-all shadow-xs ${
                  isPending
                    ? 'border-amber-300/80 dark:border-amber-800/80 ring-2 ring-amber-100 dark:ring-amber-950/40'
                    : 'border-slate-100 dark:border-slate-800/80 hover:border-slate-200'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  {/* Left: User Avatar & Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => onViewMember && onViewMember(user)}
                      className="relative w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-rose-400 transition-all cursor-pointer"
                      title="點擊查看成員完整檔案"
                    >
                      {user.avatar ? (
                        <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="w-full h-full flex items-center justify-center text-lg">👤</span>
                      )}
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Member type tag: 新註冊會員 或 修改獎銜 */}
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                            isNewRegister
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                              : 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900'
                          }`}
                        >
                          {isNewRegister ? '✨ 新註冊會員' : '📈 修改獎銜'}
                        </span>

                        {/* Status Badge: 待審核 / 已審核通過 */}
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            isPending
                              ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          }`}
                        >
                          {isPending ? (
                            <>
                              <Clock className="w-3 h-3 text-amber-500 animate-spin-slow" />
                              <span>待審核中 (未生效)</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle className="w-3 h-3 text-emerald-500" />
                              <span>已審核通過 (正式生效)</span>
                            </>
                          )}
                        </span>
                      </div>

                      {/* Name + Center + Rank + Uplines (Requirement 6) */}
                      <div className="flex items-center gap-2 flex-wrap text-sm">
                        <button
                          type="button"
                          onClick={() => onViewMember && onViewMember(user)}
                          className="font-extrabold text-slate-900 dark:text-slate-100 hover:text-rose-600 transition-colors"
                        >
                          {user.name}
                        </button>

                        <span className="text-slate-300 dark:text-slate-700">·</span>

                        <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>會場：{user.center || '無'}</span>
                        </span>

                        <span className="text-slate-300 dark:text-slate-700">·</span>

                        <span className="text-xs font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" />
                          <span>申請獎銜：{user.rank || '無'}</span>
                        </span>

                        {/* 上手白金 (若無填寫則隱藏) */}
                        {!!(user.platinumUpline || (user as any).uplinePlatinum) && (
                          <>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              上手白金：<strong className="text-slate-800 dark:text-slate-200">{user.platinumUpline || (user as any).uplinePlatinum}</strong>
                            </span>
                          </>
                        )}

                        {/* 上手鑽石 (若無填寫則隱藏) */}
                        {!!(user.diamondUpline || (user as any).uplineDiamond) && (
                          <>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span className="text-xs text-slate-600 dark:text-slate-400">
                              上手鑽石：<strong className="text-slate-800 dark:text-slate-200">{user.diamondUpline || (user as any).uplineDiamond}</strong>
                            </span>
                          </>
                        )}
                      </div>

                      {/* Time stamp */}
                      <p className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>註冊/更新時間：{displayTime}</span>
                        {!isPending && (
                          isVisitor ? (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                              (已於 {user.auditedAt || '稍早'} 完成審核)
                            </span>
                          ) : user.auditedBy ? (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                              (由 {user.auditedBy} 於 {user.auditedAt || '稍早'} 審核)
                            </span>
                          ) : (
                            <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                              (已於 {user.auditedAt || '稍早'} 審核)
                            </span>
                          )
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Right: Actions for Super Admin / Admin */}
                  {canAudit && (
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                      {isPending ? (
                        editingUserId === user.id ? (
                          <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <ThemedSelect
                              value={modifiedRank}
                              onChange={e => setModifiedRank(e.target.value as AmwayRank)}
                              className="text-xs px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-hidden font-bold"
                            >
                              {RANK_ORDER.map(r => (
                                <option key={r} value={r}>
                                  {r}
                                </option>
                              ))}
                            </ThemedSelect>
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleModifyAndApprove(user.id)}
                              className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>確認儲存並通過</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingUserId(null)}
                              className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={isSubmitting}
                              onClick={() => handleQuickApprove(user.id)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50"
                              title="審核通過此獎銜"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>通過審核</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(user.id);
                                setModifiedRank(user.rank || '無');
                              }}
                              className="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1 transition-all"
                              title="修改獎銜並通過"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                              <span>修改獎銜</span>
                            </button>
                          </div>
                        )
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {editingUserId === user.id ? (
                            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                              <ThemedSelect
                                value={modifiedRank}
                                onChange={e => setModifiedRank(e.target.value as AmwayRank)}
                                className="text-xs px-2 py-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-hidden font-bold"
                              >
                                {RANK_ORDER.map(r => (
                                  <option key={r} value={r}>
                                    {r}
                                  </option>
                                ))}
                              </ThemedSelect>
                              <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={() => handleModifyAndApprove(user.id)}
                                className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>變更</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingUserId(null)}
                                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingUserId(user.id);
                                setModifiedRank(user.rank || '無');
                              }}
                              className="px-2.5 py-1 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-1 transition-all"
                              title="重設/調整獎銜"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>修改獎銜</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
