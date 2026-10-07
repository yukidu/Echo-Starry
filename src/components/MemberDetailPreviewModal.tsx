import { effectiveMemberRank } from '../utils/ranks';
import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Calendar,
  Award,
  MapPin,
  Building,
  User,
  Heart,
  Headphones,
  CheckCircle2,
  Clock,
  MessageSquare,
  Star,
  Download
} from 'lucide-react';
import { UserProfile, Track, Comment } from '../types';
import { calculateNumerology } from '../utils/numerology';
import { NumerologyGrid } from './NumerologyGrid';

export interface UserTrackListeningDetail {
  track: Track;
  firstListenedDate: string;
  lastListenedDate: string;
  completedDate: string | null;
  progressPercent: number;
  clickCount: number;
  userComment: string | null;
  userRating: number | null;
}

interface MemberDetailPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile | null;
  tracks: Track[];
  comments: Comment[];
  currentUser?: UserProfile | null;
  isAdmin: boolean;
}

export const MemberDetailPreviewModal: React.FC<MemberDetailPreviewModalProps> = ({
  isOpen,
  onClose,
  user,
  tracks,
  comments,
  isAdmin
}) => {
  const [activeTab, setActiveTab] = useState<'basic' | 'upline' | 'numerology' | 'listened'>('basic');
  const [isExporting, setIsExporting] = useState(false);

  const [records,setRecords] = useState<Record<string,any>>({});
  useEffect(()=>{
    if(!isOpen || !user)return;
    const controller = new AbortController();
    setRecords({});
    fetch('/api/playback/history/'+encodeURIComponent(user.email||user.id),{signal:controller.signal}).then(r=>r.ok?r.json():{}).then(data=>setRecords(data)).catch(()=>{});
    return()=>controller.abort();
  },[isOpen,user?.id,user?.email]);
  if (!isOpen || !user) return null;

  const numResult = calculateNumerology(user.birthday || '');

  // Build listening details for the user
  const listenedDetails: UserTrackListeningDetail[] = tracks.map((track, idx) => {
    const userRatingVal = (track.ratings && (track.ratings[user.email] || track.ratings[user.id])) || null;
    const userCommentObj = comments.find(c => (c.authorEmail === user.email || c.authorName === user.name) && c.trackId === track.id);
    const userComment = userCommentObj ? userCommentObj.content : null;

    const record=records[track.id] || Object.values(records).find(r=>r.trackId===track.id);
    const clickCount=record?.clickCount||0;
    const progressPercent=record?.progressPercent||0;
    const isCompleted=Boolean(record?.completed);
    const firstListenedDate=record?.firstListenDate||'-';
    const lastListenedDate=record?.lastListenDate||'-';
    const completedDate=record?.finishDate||null;

    return {
      track,
      firstListenedDate,
      lastListenedDate,
      completedDate,
      progressPercent,
      clickCount,
      userComment,
      userRating: userRatingVal
    };
  }).filter(d => d.clickCount > 0 || d.progressPercent > 0 || d.userComment || d.userRating);

  // Requirement 6: 黑白圖檔 jpeg 匯出（只包含基本資料和已聆聽音檔清單），合併成一個 jpeg 圖檔，並呼叫原生行動裝置分享選單
  const handleExportJpeg = async () => {
    setIsExporting(true);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 850;
      const padding = 45;
      const headerHeight = 280;
      const itemHeight = 110;
      const listHeight = Math.max(1, listenedDetails.length) * itemHeight;
      const footerHeight = 100;
      const totalHeight = headerHeight + listHeight + footerHeight;

      canvas.width = width;
      canvas.height = totalHeight;

      // 1. Black & White high-contrast background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, totalHeight);

      // Border outline
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(15, 15, width - 30, totalHeight - 30);

      // Header top bar
      ctx.fillStyle = '#000000';
      ctx.fillRect(30, 30, width - 60, 5);

      // Header title
      ctx.font = 'bold 30px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText('學 員 履 歷 與 聽 讀 紀 錄 表', padding, 75);

      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#666666';
      ctx.fillText('ECHO AUDIO KNOWLEDGE REPOSITORY • MEMBER PROFILE & LISTENING DOSSIER', padding, 98);

      // Basic Information Grid in Black and White
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.moveTo(padding, 115);
      ctx.lineTo(width - padding, 115);
      ctx.stroke();

      ctx.font = 'bold 18px "PingFang TC", sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText(`姓名：${user.name}  [${effectiveMemberRank(user, '一般會員')}]`, padding, 145);

      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#222222';
      // Requirement 4 (v2.8): 匯出個人圖卡時，不顯示生日和手機（這二項是個資）
      ctx.fillText(`安麗編號：${user.amwayId || '-'}  •  居住地：${user.residence || '-'}`, padding, 175);
      ctx.fillText(`直銷商中心：${user.center || '-'}  •  上手白金：${user.platinumUpline || '-'}  •  上手鑽石：${user.diamondUpline || '-'}`, padding, 202);
      ctx.fillText(`初次認識：${user.joinReason || '-'}  •  留在安麗：${(user as any).stayReason || '-'}  •  命數：${user.lifeNumber || '-'}`, padding, 229);

      // Section divider for tracks
      ctx.beginPath();
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.moveTo(padding, 255);
      ctx.lineTo(width - padding, 255);
      ctx.stroke();

      ctx.font = 'bold 16px "PingFang TC", sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText(`已聆聽音檔清單（共 ${listenedDetails.length} 首）：`, padding, 278);

      // Track records list
      let y = headerHeight + 25;
      if (listenedDetails.length === 0) {
        ctx.font = 'italic 14px sans-serif';
        ctx.fillStyle = '#666666';
        ctx.fillText('尚無音檔聆聽與評價紀錄', padding, y + 25);
      } else {
        listenedDetails.forEach((item, index) => {
          // Number & Title
          ctx.font = 'bold 16px "PingFang TC", sans-serif';
          ctx.fillStyle = '#000000';
          const titleShort = item.track.title.length > 24 ? item.track.title.substring(0, 24) + '...' : item.track.title;
          ctx.fillText(`${index + 1}. 《${titleShort}》 （${item.track.speaker}${item.track.speakerRank || ''}）`, padding, y + 20);

          // Metadata row 1: Dates & Progress
          ctx.font = '13px sans-serif';
          ctx.fillStyle = '#333333';
          const completeStr = item.completedDate ? `聽完日期：${item.completedDate}` : '未完聽';
          ctx.fillText(
            `進度：${item.progressPercent}%  |  點播次數：${item.clickCount}次  |  首聽：${item.firstListenedDate}  |  近聽：${item.lastListenedDate}  |  ${completeStr}`,
            padding + 18,
            y + 44
          );

          // Metadata row 2: Rating & Comment
          ctx.font = '12px sans-serif';
          ctx.fillStyle = '#555555';
          const starStr = item.userRating ? `★ ${item.userRating}分` : '無評分';
          const commentStr = item.userComment ? `心得：「${item.userComment}」` : '尚無心得';
          ctx.fillText(`用戶評價：${starStr}  •  ${commentStr}`, padding + 18, y + 68);

          // Bottom divider line
          ctx.beginPath();
          ctx.strokeStyle = '#e0e0e0';
          ctx.lineWidth = 1;
          ctx.moveTo(padding, y + 85);
          ctx.lineTo(width - padding, y + 85);
          ctx.stroke();

          y += itemHeight;
        });
      }

      // Footer
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#777777';
      ctx.fillText(`製表日期：${new Date().toLocaleDateString('zh-TW')} • 繁星回聲 團隊學習知識管理系統`, padding, totalHeight - 40);

      // Convert to JPEG Blob
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const filename = `學員履歷_${user.name}_聽讀紀錄.jpeg`;

        if (navigator.share && navigator.canShare) {
          const file = new File([blob], filename, { type: 'image/jpeg' });
          if (navigator.canShare({ files: [file] })) {
            try {
              await navigator.share({
                title: `學員履歷與聽讀紀錄_${user.name}`,
                files: [file]
              });
              return;
            } catch (err) {
              console.log('Native share canceled or failed:', err);
            }
          }
        }

        // Fallback: direct download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 'image/jpeg', 0.95);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/65 backdrop-blur-xs cursor-pointer animate-in fade-in"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl border border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 flex flex-col max-h-[88vh] cursor-default text-xs"
      >
        {/* Header - Ultra compact */}
        <div className="p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img
              src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'}
              alt={user.name}
              className="w-9 h-9 rounded-xl object-cover shrink-0 ring-1 ring-rose-200"
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 truncate">
                  {user.name}
                </h3>
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] dark:bg-slate-800 dark:text-slate-300 font-bold">
                  {effectiveMemberRank(user, '一般會員')}
                </span>
                {user.isContributor && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-bold">
                    貢獻者
                  </span>
                )}
              </div>
              <p className="text-[10px] text-slate-400 truncate">
                {user.email} • 編號: {user.amwayId || '-'} • 中心: {user.center || '無'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Requirement 6: 匯出按鈕（黑白 JPEG 圖檔） */}
            <button
              onClick={handleExportJpeg}
              disabled={isExporting}
              title="匯出基本資料與已聆聽清單成黑白 JPEG 圖檔並呼叫分享"
              className="px-2.5 py-1 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-bold flex items-center gap-1 text-[11px] shadow-xs hover:opacity-90 active:scale-95 transition-all"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{isExporting ? '匯出中...' : '匯出黑白JPEG'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Tab Navigation - Same category classification as ProfileModal */}
        <div className="flex border-b border-slate-100 dark:border-slate-800 px-3 pt-2 gap-1 overflow-x-auto scrollbar-none text-[11px]">
          <button
            onClick={() => setActiveTab('basic')}
            className={`pb-2 px-2.5 font-bold border-b-2 shrink-0 transition-colors ${
              activeTab === 'basic'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            基本資料
          </button>
          <button
            onClick={() => setActiveTab('upline')}
            className={`pb-2 px-2.5 font-bold border-b-2 shrink-0 transition-colors ${
              activeTab === 'upline'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            推薦與體系
          </button>
          <button
            onClick={() => setActiveTab('numerology')}
            className={`pb-2 px-2.5 font-bold border-b-2 shrink-0 transition-colors ${
              activeTab === 'numerology'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            生命靈數
          </button>
          <button
            onClick={() => setActiveTab('listened')}
            className={`pb-2 px-2.5 font-bold border-b-2 shrink-0 transition-colors ${
              activeTab === 'listened'
                ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            已聆聽音檔 ({listenedDetails.length})
          </button>
        </div>

        {/* Tab Content - Ultra compact layout so maximum data fits in one screen */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 space-y-3">
          {/* TAB 1: Basic Info */}
          {activeTab === 'basic' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">姓名或暱稱</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.name}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">安麗編號</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.amwayId || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">手機號碼</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.phone || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">居住地</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.residence || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">所屬直銷商中心</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.center || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">最高獎銜</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{effectiveMemberRank(user, '-')}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">初次如何認識安麗？</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.joinReason || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">什麼原因留在安麗？</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{(user as any).stayReason || '-'}</span>
              </div>
            </div>
          )}

          {/* TAB 2: Upline & System */}
          {activeTab === 'upline' && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">推薦人</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.sponsor || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">上手白金</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.platinumUpline || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 col-span-2">
                <span className="text-[10px] text-slate-400 block">上手鑽石</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.diamondUpline || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">西元生日</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.birthday || '-'}</span>
              </div>
              <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 block">星座</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">{user.zodiac || '-'}</span>
              </div>
            </div>
          )}

          {/* TAB 3: Numerology Grid */}
          {activeTab === 'numerology' && (
            <div className="space-y-2">
              <NumerologyGrid birthday={user.birthday || ''} />
            </div>
          )}

          {/* TAB 4: Listened Tracks (Requirement 5) */}
          {activeTab === 'listened' && (
            <div className="space-y-2">
              {listenedDetails.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">
                  該學員目前尚無已聆聽的音檔紀錄
                </div>
              ) : (
                listenedDetails.map((item, idx) => (
                  <div
                    key={item.track.id}
                    className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 dark:text-slate-100 truncate">
                          {idx + 1}. 《{item.track.title}》
                        </p>
                        <p className="text-[10px] text-slate-400">
                          主講：{item.track.speaker} · {item.track.speakerRank}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${
                          item.progressPercent >= 95
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                          {item.progressPercent >= 95 ? '[已聽完]' : `[已聽 ${item.progressPercent}%]`}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-rose-500 h-full rounded-full transition-all"
                        style={{ width: `${Math.min(100, item.progressPercent)}%` }}
                      />
                    </div>

                    {/* Listening Metrics Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 text-[10px] text-slate-500 dark:text-slate-400 pt-0.5">
                      <div>
                        <span className="text-slate-400">首次聆聽：</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{item.firstListenedDate}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">最近聆聽：</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{item.lastListenedDate}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">聽完日期：</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{item.completedDate || '未完聽'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">點擊次數：</span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">{item.clickCount} 次</span>
                      </div>
                    </div>

                    {/* Rating & Comment */}
                    <div className="pt-1 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between text-[10px] flex-wrap gap-1">
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">用戶評分：</span>
                        {item.userRating ? (
                          <span className="font-bold text-amber-500 flex items-center">
                            ★ {item.userRating} 分
                          </span>
                        ) : (
                          <span className="text-slate-400">未評分</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300 truncate max-w-xs">
                        <MessageSquare className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="truncate">{item.userComment ? `心得：「${item.userComment}」` : '尚未心得'}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
