import { effectiveMemberRank } from '../utils/ranks';
import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  Star,
  MessageSquare,
  Headphones,
  Download,
  Share2,
  Calendar,
  Award,
  Sparkles,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2
} from 'lucide-react';
import { UserProfile, Track, Comment, UserListeningRecord } from '../types';
import { NumerologyGrid } from './NumerologyGrid';
import { CollapsibleCommentText } from './CollapsibleCommentText';
import { calculateNumerology } from '../utils/numerology';
import {
  exportMemberProfileAndListeningImage,
  shareOrDownloadImage
} from '../utils/canvasExport';

interface MemberPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  tracks: Track[];
  comments: Comment[];
  allUsers?: UserProfile[];
  currentUser?: UserProfile | null;
}

export const MemberPreviewModal: React.FC<MemberPreviewModalProps> = ({
  isOpen,
  onClose,
  user,
  tracks,
  comments,
  allUsers = [],
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'ratings' | 'comments' | 'listening'>('profile');
  const [listeningRecords, setListeningRecords] = useState<Record<string, UserListeningRecord>>({});
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // Requirement 7: 個人基本資料設定的內容（包括生命靈數九宮格圖），跟點選用戶名稱時顯示的資訊卡，內容修正為完全一致
  const liveUser = (() => {
    if (!user) return null;
    if (
      currentUser &&
      ((user.id && user.id === currentUser.id) ||
       (user.email && currentUser.email && user.email.toLowerCase().trim() === currentUser.email.toLowerCase().trim()) ||
       (user.name && user.name === currentUser.name))
    ) {
      return currentUser;
    }
    if (allUsers && allUsers.length > 0) {
      const found = allUsers.find(u =>
        (user.id && u.id === user.id) ||
        (user.email && u.email && u.email.toLowerCase().trim() === user.email.toLowerCase().trim()) ||
        (user.name && u.name === user.name)
      );
      if (found) return found;
    }
    return user;
  })();

  useEffect(() => {
    if (!isOpen || !liveUser) return;
    setIsLoadingRecords(true);

    const idParam = liveUser.email || liveUser.id;
    fetch(`/api/playback/history/${encodeURIComponent(idParam)}`)
      .then(res => res.json())
      .then(data => {
        setListeningRecords(data || {});
        setIsLoadingRecords(false);
      })
      .catch(() => {
        setIsLoadingRecords(false);
      });
  }, [isOpen, liveUser?.id, liveUser?.email]);

  if (!isOpen || !liveUser) return null;

  // Calculate numerology
  const numerology = calculateNumerology(liveUser.birthday || '');

  // User rated tracks
  const userRatedTracks = tracks
    .map(t => {
      const rating = (t.ratings && (t.ratings[liveUser.email] || t.ratings[liveUser.id])) || 0;
      return { track: t, rating };
    })
    .filter(x => x.rating > 0);

  // User comments
  const userComments = comments.filter(c =>
    c.authorEmail === liveUser.email || c.authorName === liveUser.name
  );

  // Merged listening tracks
  const userListenedItems = Object.values(listeningRecords).map(rec => {
    const foundTrack = tracks.find(t => t.id === rec.trackId);
    const isDeleted = !foundTrack || rec.isDeleted === true;
    const track: Track = foundTrack || {
      id: rec.trackId,
      title: rec.trackTitle || '演講錄音檔',
      speaker: rec.trackSpeaker || '繁星講師',
      speakerRank: rec.trackSpeakerRank || '無',
      speakerAvatar: '',
      categories: ['未分類'],
      series: '',
      seriesOrder: '第 1 集',
      speechDate: '',
      description: '',
      durationSeconds: rec.duration || 600,
      rating: rec.rating || 0,
      ratingCount: 0,
      commentsCount: 0,
      likes: 0,
      duration: '約 10 分鐘',
      requiredRank: '無',
      uploadDate: '',
      audioUrl: '',
      uploaderEmail: '',
      externalVideos: [],
      externalPpts: [],
      externalFiles: [],
      likedBy: [],
      ratings: {}
    };
    // Requirement 7: 確保學習檔案包含音檔學習進度、給予評價、心得內容
    const effectiveRating = foundTrack ? (foundTrack.ratings?.[liveUser.email] || foundTrack.ratings?.[liveUser.id] || 0) : (rec.rating || 0);
    const userCommentObj = userComments.find(c => c.trackId === rec.trackId);
    const effectiveComment = foundTrack ? (userCommentObj?.content || '') : (rec.comment || '');

    const enrichedRecord: UserListeningRecord = {
      ...rec,
      rating: effectiveRating,
      comment: effectiveComment
    };

    return { track, record: enrichedRecord, isDeleted };
  });

  // Handle Export JPEG (Requirement 2)
  const handleExportJpeg = async () => {
    if (!liveUser || isExporting) return;
    setIsExporting(true);
    try {
      const blob = await exportMemberProfileAndListeningImage(liveUser, userListenedItems);
      const filename = `繁星回聲_${liveUser.name}_學習檔案.jpg`;
      await shareOrDownloadImage(blob, filename, `${liveUser.name} 的學習與聆聽檔案`);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      {/* Modal Dialog Content (stopPropagation so only backdrop click closes it) */}
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
      >
        {/* Ultra-compact Header */}
        <div
          className="px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between text-white"
          style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <img
              src={liveUser.avatar}
              alt={liveUser.name}
              className="w-9 h-9 rounded-xl object-cover ring-2 ring-white/60 shrink-0"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-sm sm:text-base truncate">{liveUser.name}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/20 text-white font-bold">
                  {effectiveMemberRank(liveUser)}
                </span>
                {liveUser.isContributor && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-400 text-slate-900 font-extrabold">
                    貢獻者
                  </span>
                )}
              </div>
              <p className="text-[11px] text-white/80 truncate">
                {liveUser.email} • 中心: {liveUser.center || '無'} • 編號: {liveUser.amwayId || '-'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Export Button (Requirement 2 & 7) */}
            <button
              onClick={handleExportJpeg}
              disabled={isExporting}
              title="匯出學習卡並呼叫手機分享"
              className="px-2.5 py-1 rounded-xl bg-white text-[var(--color-primary,#c06c84)] hover:bg-white/90 font-bold text-xs flex items-center gap-1 shadow-xs active:scale-95 transition-all"
            >
              {isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
              <span>匯出學習卡</span>
            </button>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/20 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 4 Tabs: Matching ProfileModal (Requirement 2) */}
        <div className="flex items-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 text-xs px-2 pt-1 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('profile')}
            className={`px-3 py-2 font-bold border-b-2 flex items-center gap-1 whitespace-nowrap transition-colors ${
              activeTab === 'profile'
                ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>基本資料</span>
          </button>

          <button
            onClick={() => setActiveTab('ratings')}
            className={`px-3 py-2 font-bold border-b-2 flex items-center gap-1 whitespace-nowrap transition-colors ${
              activeTab === 'ratings'
                ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Star className="w-3.5 h-3.5" />
            <span>評價紀錄 ({userRatedTracks.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('comments')}
            className={`px-3 py-2 font-bold border-b-2 flex items-center gap-1 whitespace-nowrap transition-colors ${
              activeTab === 'comments'
                ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>心得紀錄 ({userComments.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('listening')}
            className={`px-3 py-2 font-bold border-b-2 flex items-center gap-1 whitespace-nowrap transition-colors ${
              activeTab === 'listening'
                ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>學習進度 ({userListenedItems.length})</span>
          </button>
        </div>

        {/* Tab Body (Ultra-compact layout: 盡量一個畫面能顯示所有資料) */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-2.5 text-xs text-slate-800 dark:text-slate-100">
          {/* TAB 1: 基本資料 & 生命靈數 */}
          {activeTab === 'profile' && (
            <div className="space-y-2.5">
              {/* Ultra-compact Info Grid - Requirement 7: 與個人基本資料設定內容完全一致 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700">
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">推薦人</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{liveUser.sponsor || '未填寫'}</span>
                </div>
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">上手白金 / 鑽石</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                    {liveUser.platinumUpline || '-'} / {liveUser.diamondUpline || '-'}
                  </span>
                </div>
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">初次如何認識安麗？</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{liveUser.joinReason || '事業'}</span>
                </div>
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">什麼原因留在安麗？</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{liveUser.stayReason || '打造自己的事業與團隊'}</span>
                </div>
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">活動中心 / 居住地</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100 truncate block">
                    {liveUser.center || '無'} / {liveUser.residence || '臺北'}
                  </span>
                </div>
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">星座</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">{numerology?.zodiac || liveUser.zodiac || '-'}</span>
                </div>
                <div className="p-1">
                  <span className="text-[10px] text-slate-400 block font-semibold">天賦數 · 命數</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                    {numerology?.talentNumber || liveUser.talentNumber || '-'} · 命數{numerology?.lifeNumber || liveUser.lifeNumber || '-'}
                  </span>
                </div>
              </div>

              {/* Numerology 3x3 Grid */}
              <div className="p-2.5 rounded-2xl bg-white dark:bg-slate-800/90 border border-slate-200/60 dark:border-slate-700">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    九宮格生命靈數連線圖
                  </span>
                </div>
                <NumerologyGrid birthday={liveUser.birthday || ''} />
              </div>
            </div>
          )}

          {/* TAB 2: 評價紀錄 */}
          {activeTab === 'ratings' && (
            <div className="space-y-1.5">
              {userRatedTracks.length === 0 ? (
                <div className="text-center py-8 text-slate-400">該會員尚未評價任何音檔</div>
              ) : (
                userRatedTracks.map(({ track, rating }) => (
                  <div
                    key={track.id}
                    className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate text-slate-900 dark:text-slate-100">
                        {track.title}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        主講：{track.speaker}{track.speakerRank ? `·${track.speakerRank}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 text-amber-400 shrink-0">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        />
                      ))}
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 ml-1">
                        {rating}星
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: 心得紀錄 */}
          {activeTab === 'comments' && (
            <div className="space-y-2">
              {userComments.length === 0 ? (
                <div className="text-center py-8 text-slate-400">該會員尚無心得紀錄</div>
              ) : (
                userComments.map(c => {
                  const track = tracks.find(t => t.id === c.trackId);
                  return (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 space-y-1"
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-bold text-slate-700 dark:text-slate-300 truncate">
                          針對《{track?.title || '演講音檔'}》：
                        </span>
                        <span className="font-mono text-[10px]">{c.timestamp}</span>
                      </div>
                      <CollapsibleCommentText
                        className="text-xs text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap pl-2 border-l-2 border-[var(--color-primary,#c06c84)]"
                        resetKey={`${c.id}:${c.content}`}
                      >
                        {c.content}
                      </CollapsibleCommentText>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 4: 已聆聽音檔清單 (Requirement 1: 首次聆聽、最近聆聽、聽完日期>95%、進度%、點擊次數、用戶心得、評價) */}
          {activeTab === 'listening' && (
            <div className="space-y-2">
              {isLoadingRecords ? (
                <div className="text-center py-8 text-slate-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary,#c06c84)]" />
                  <span>載入聆聽紀錄中...</span>
                </div>
              ) : userListenedItems.length === 0 ? (
                <div className="text-center py-8 text-slate-400">該會員尚無已記錄的聆聽音檔</div>
              ) : (
                userListenedItems.map(({ track, record }) => {
                  const isCompleted = record.progressPercent > 95 || record.completed;
                  return (
                    <div
                      key={track.id}
                      className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 space-y-1.5"
                    >
                      {/* Row 1: Title & Finished Status */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                            {track.title}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            主講：{track.speaker}{track.speakerRank ? `·${track.speakerRank}` : ''}
                          </p>
                        </div>
                        {isCompleted ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>已聽完 ({record.finishDate || record.lastListenDate})</span>
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold shrink-0">
                            進度 {record.progressPercent}%
                          </span>
                        )}
                      </div>

                      {/* Row 2: Metrics (首次、最近、點擊次數) */}
                      <div className="grid grid-cols-3 gap-1 p-1.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-700/60 text-[10px]">
                        <div>
                          <span className="text-slate-400 block">首次聆聽</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {record.firstListenDate || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">最近聆聽</span>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {record.lastListenDate || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">點擊次數</span>
                          <span className="font-bold text-slate-900 dark:text-slate-100">
                            {record.clickCount || 1} 次
                          </span>
                        </div>
                      </div>

                      {/* Row 3: User Rating & User Comment (if any) */}
                      {(record.rating !== undefined || record.comment) && (
                        <div className="pt-1 border-t border-slate-200/60 dark:border-slate-700 flex flex-col gap-1 text-[11px]">
                          {record.rating !== undefined && record.rating > 0 && (
                            <div className="flex items-center gap-1 text-amber-500">
                              <span className="text-slate-400 text-[10px]">給予評分：</span>
                              {[1, 2, 3, 4, 5].map(s => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${
                                    s <= (record.rating || 0)
                                      ? 'fill-amber-400 text-amber-400'
                                      : 'text-slate-300 dark:text-slate-600'
                                  }`}
                                />
                              ))}
                              <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 ml-0.5">
                                {record.rating}分
                              </span>
                            </div>
                          )}

                          {record.comment && (
                            <div className="text-slate-700 dark:text-slate-300 text-[11px] leading-relaxed bg-white/70 dark:bg-slate-900/40 p-1.5 rounded-lg">
                              <span className="font-bold text-slate-500 text-[10px]">心得：</span>
                              “{record.comment}”
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
