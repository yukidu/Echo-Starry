import { effectiveMemberRank } from '../utils/ranks';
import { SpeakerNameLink } from './SpeakerNameLink';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Trophy,
  Heart,
  MessageSquare,
  Eye,
  CheckCircle2,
  Clock,
  Building,
  Award,
  Users,
  Compass,
  Sparkles,
  MapPin,
  Flame,
  Star,
  Play,
  Headphones,
  TrendingUp,
  Calendar,
  Tag,
  Hash,
  BarChart2,
  Radio,
  Layers
} from 'lucide-react';
import {
  Track,
  UserProfile,
  Comment,
  RANK_ORDER,
  JOIN_REASONS,
  RESIDENCE_OPTIONS,
  CENTER_OPTIONS
} from '../types';
import { calculateNumerology } from '../utils/numerology';
import { StickerLeaderboardTab } from './StickerLeaderboardTab';

interface StatisticsViewProps {
  tracks: Track[];
  users: UserProfile[];
  comments?: Comment[];
  onSelectTrack?: (track: Track) => void;
  onViewMember?: (user: UserProfile) => void;
}

interface LeaderboardData {
  recentlyUpdated: Array<{ user: UserProfile; value: string }>;
  topLikes: Array<{ user: UserProfile; count: number }>;
  topComments: Array<{ user: UserProfile; count: number }>;
  topClicks: Array<{ user: UserProfile; count: number }>;
  topFinished: Array<{ user: UserProfile; count: number }>;
}

export type LeaderboardSubTab = 'model' | 'hot-tracks' | 'members' | 'stickers' | 'hot-keywords';

const ZODIAC_LIST = [
  '牡羊座', '金牛座', '雙子座', '巨蟹座',
  '獅子座', '處女座', '天秤座', '天蠍座',
  '射手座', '摩羯座', '水瓶座', '雙魚座'
];

// Helper to reliably parse relative time strings for sorting (Requirement 9)
function parseRelativeTimeScore(text?: string | null): number {
  if (!text) return -Infinity;
  const s = text.trim();
  const now = Date.now();
  if (s === '剛才' || s === '剛剛' || s === '在線') return now;

  const minMatch = s.match(/^(\d+)\s*分鐘前$/);
  if (minMatch) return now - parseInt(minMatch[1], 10) * 60 * 1000;

  const hrMatch = s.match(/^(\d+)\s*小時前$/);
  if (hrMatch) return now - parseInt(hrMatch[1], 10) * 3600 * 1000;

  if (s === '昨天' || s.startsWith('昨天')) return now - 24 * 3600 * 1000;
  if (s === '前天') return now - 48 * 3600 * 1000;

  const dayMatch = s.match(/^(\d+)\s*天前$/);
  if (dayMatch) return now - parseInt(dayMatch[1], 10) * 86400 * 1000;

  const weekMatch = s.match(/^(\d+)\s*(週|星期)前$/);
  if (weekMatch) return now - parseInt(weekMatch[1], 10) * 7 * 86400 * 1000;

  const parsed = new Date(s.replace(/\//g, '-')).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;

  return 0;
}

export const StatisticsView: React.FC<StatisticsViewProps> = ({
  tracks,
  users,
  comments = [],
  onSelectTrack,
  onViewMember
}) => {
  // Requirement 2: 三個子分頁（模範生排行榜、熱門音檔排行榜、會員排行榜）
  const [activeTab, setActiveTab] = useState<LeaderboardSubTab>('model');
  const [serverLeaderboard, setServerLeaderboard] = useState<LeaderboardData | null>(null);

  // Fetch server-calculated leaderboard
  useEffect(() => {
    fetch('/api/leaderboard')
      .then(res => res.json())
      .then(data => {
        if (data && data.recentlyUpdated) {
          setServerLeaderboard(data);
        }
      })
      .catch(err => {
        console.error('Failed to load server leaderboard:', err);
      });
  }, []);

  // Requirement 12: 訪客不列入模範生的統計排行榜
  const isRegisteredMember = (u?: UserProfile | null) => {
    if (!u) return false;
    if (u.id === 'guest' || u.id.startsWith('guest-')) return false;
    if (u.name.startsWith('訪客') || u.role === '訪客') return false;
    if (!u.email || u.email === 'guest') return false;
    return true;
  };

  const registeredUsers = useMemo(() => {
    return users.filter(isRegisteredMember);
  }, [users]);

  // Requirement 4: 排行榜的顯示會員名稱，要跟會員基本資料設定的名稱同步。
  const resolveLatestUser = (u: UserProfile): UserProfile => {
    return users.find(x => x.id === u.id || (x.email && x.email.toLowerCase() === u.email?.toLowerCase())) || u;
  };

  // 1. 模範生排行榜數據
  const recentlyUpdated = useMemo(() => {
    let source: Array<{ user: UserProfile; value: string }> = [];
    if (serverLeaderboard?.recentlyUpdated?.length) {
      source = serverLeaderboard.recentlyUpdated
        .filter(item => isRegisteredMember(item.user))
        .map(item => ({ ...item, user: resolveLatestUser(item.user) }));
    } else {
      source = [...registeredUsers]
        .map(u => ({ user: u, value: u.lastActive || '近期' }));
    }
    return source
      .sort((a, b) => parseRelativeTimeScore(b.value || b.user.lastActive) - parseRelativeTimeScore(a.value || a.user.lastActive))
      .slice(0, 5);
  }, [registeredUsers, serverLeaderboard, users]);

  const topLikes = useMemo(() => {
    if (serverLeaderboard?.topLikes?.length) {
      return serverLeaderboard.topLikes
        .filter(item => isRegisteredMember(item.user) && (item.count || 0) > 0)
        .map(item => ({ ...item, user: resolveLatestUser(item.user) }));
    }
    return [...registeredUsers]
      .map(u => {
        let count = 0;
        tracks.forEach(t => {
          if (t.likedBy?.includes(u.id) || (u.email && t.likedBy?.includes(u.email))) {
            count++;
          }
        });
        return { user: u, count };
      })
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [registeredUsers, tracks, serverLeaderboard, users]);

  const topComments = useMemo(() => {
    if (serverLeaderboard?.topComments?.length) {
      return serverLeaderboard.topComments
        .filter(item => isRegisteredMember(item.user) && (item.count || 0) > 0)
        .map(item => ({ ...item, user: resolveLatestUser(item.user) }));
    }
    return [...registeredUsers]
      .map(u => {
        const count = comments.filter(c =>
          c.authorEmail === u.email || c.authorName === u.name
        ).length;
        return { user: u, count };
      })
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [registeredUsers, comments, serverLeaderboard, users]);

  const topClicks = useMemo(() => {
    if (serverLeaderboard?.topClicks?.length) {
      return serverLeaderboard.topClicks
        .filter(item => isRegisteredMember(item.user) && (item.count || 0) > 0)
        .map(item => ({ ...item, user: resolveLatestUser(item.user) }));
    }
    return [...registeredUsers]
      .map(u => ({ user: u, count: u.playCount || 0 }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [registeredUsers, serverLeaderboard, users]);

  const topFinished = useMemo(() => {
    if (serverLeaderboard?.topFinished?.length) {
      return serverLeaderboard.topFinished
        .filter(item => isRegisteredMember(item.user) && (item.count || 0) > 0)
        .map(item => ({ ...item, user: resolveLatestUser(item.user) }));
    }
    return [...registeredUsers]
      .map(u => ({ user: u, count: Math.floor((u.playCount || 0) * 0.4) }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [registeredUsers, serverLeaderboard, users]);

  // 2. 熱門音檔排行榜數據
  // (1) 心得數排行
  const hotTracksByComments = useMemo(() => {
    return [...tracks]
      .map(t => ({
        ...t,
        computedComments: comments.filter(c => c.trackId === t.id).length || t.commentsCount || 0
      }))
      .sort((a, b) => b.computedComments - a.computedComments)
      .slice(0, 10);
  }, [tracks, comments]);

  // (2) 評價排行 (以平均星級排序，若星級相同則比較評分人數)
  const hotTracksByRating = useMemo(() => {
    return [...tracks]
      .sort((a, b) => {
        const rDiff = (b.rating || 0) - (a.rating || 0);
        if (Math.abs(rDiff) > 0.05) return rDiff;
        return (b.ratingCount || 0) - (a.ratingCount || 0);
      })
      .slice(0, 10);
  }, [tracks]);

  // (3) 點擊播放次數排行
  const hotTracksByPlayCount = useMemo(() => {
    return [...tracks]
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
      .slice(0, 10);
  }, [tracks]);

  // 2.1 講師獎銜分佈統計 (含 GAR全球獎銜指標)
  const speakerRankStats = useMemo(() => {
    const map: Record<string, { count: number; totalPlays: number; totalRating: number; ratedCount: number; isGar: boolean }> = {};
    (tracks || []).forEach(t => {
      const r = (t.speakerRank || '無').trim() || '無';
      if (!map[r]) {
        map[r] = {
          count: 0,
          totalPlays: 0,
          totalRating: 0,
          ratedCount: 0,
          isGar: r.startsWith('GAR')
        };
      }
      map[r].count += 1;
      map[r].totalPlays += (t.playCount || 0);
      if (t.rating) {
        map[r].totalRating += t.rating;
        map[r].ratedCount += 1;
      }
    });

    return Object.entries(map)
      .map(([rank, data]) => ({
        rank,
        count: data.count,
        totalPlays: data.totalPlays,
        avgRating: data.ratedCount > 0 ? (data.totalRating / data.ratedCount).toFixed(1) : '5.0',
        isGar: data.isGar
      }))
      .sort((a, b) => b.count - a.count);
  }, [tracks]);

  const maxSpeakerRankCount = useMemo(() => {
    return Math.max(1, ...speakerRankStats.map(s => s.count));
  }, [speakerRankStats]);

  const garTracksCount = useMemo(() => {
    return (tracks || []).filter(t => (t.speakerRank || '').startsWith('GAR')).length;
  }, [tracks]);

  // 3. 會員排行榜數據（個別統計，只顯示有數據的子選項）
  const totalUserCount = users.length;

  // (1) 初次如何認識安麗？ (僅顯示已有數據的選項)
  const memberJoinReasonStats = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach(u => {
      const reason = u.joinReason || '未填寫';
      map[reason] = (map[reason] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [users]);

  // (1.1) 什麼原因留在安麗？ (Requirement 1: 僅顯示已有數據的選項)
  const memberStayReasonStats = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach(u => {
      const reason = (u as any).stayReason || '未填寫';
      map[reason] = (map[reason] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [users]);

  // (2) 居住地 (僅顯示已有數據的選項)
  const memberResidenceStats = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach(u => {
      const r = u.residence || '未填寫';
      map[r] = (map[r] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [users]);

  // (3) 直銷商中心 (僅顯示已有數據的選項)
  const memberCenterStats = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach(u => {
      const c = u.center || '無會場';
      map[c] = (map[c] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [users]);

  // (4) 最高獎銜 (高階在前面，僅顯示已有數據的選項)
  const memberRankStats = useMemo(() => {
    const reversedRanks = [...RANK_ORDER].reverse();
    const map: Record<string, number> = {};
    users.forEach(u => {
      const r = effectiveMemberRank(u);
      map[r] = (map[r] || 0) + 1;
    });
    return reversedRanks
      .map(name => ({ name, count: map[name] || 0 }))
      .filter(item => item.count > 0);
  }, [users]);

  // (5) 星座 (僅顯示已有數據的選項)
  const memberZodiacStats = useMemo(() => {
    const map: Record<string, number> = {};
    users.forEach(u => {
      const z = u.zodiac || '未填寫';
      map[z] = (map[z] || 0) + 1;
    });
    return Object.entries(map)
      .filter(([_, count]) => count > 0)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [users]);

  // (6) 生命靈數（統計 1-9 命數總人數，僅顯示已有數據的命數）
  const memberLifeNumberStats = useMemo(() => {
    const counts: Record<number, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0
    };
    users.forEach(u => {
      const calc = calculateNumerology(u.birthday || '');
      const num = u.lifeNumber || calc?.lifeNumber;
      if (num && num >= 1 && num <= 9) {
        counts[num] = (counts[num] || 0) + 1;
      }
    });
    return [1, 2, 3, 4, 5, 6, 7, 8, 9]
      .map(num => ({ num, count: counts[num] || 0 }))
      .filter(item => item.count > 0);
  }, [users]);

  // 4. 熱門關鍵字統計數據 - Requirement 4 (v2.5): 排行榜新增「熱門關鍵字」各項統計
  const keywordStats = useMemo(() => {
    const map = new Map<string, { count: number; tracks: Track[]; totalPlays: number }>();
    tracks.forEach(t => {
      if (Array.isArray(t.keywords)) {
        t.keywords.forEach(kw => {
          const trimmed = kw.trim();
          if (!trimmed) return;
          const entry = map.get(trimmed) || { count: 0, tracks: [], totalPlays: 0 };
          entry.count += 1;
          entry.tracks.push(t);
          entry.totalPlays += t.playCount || 0;
          map.set(trimmed, entry);
        });
      }
    });

    return Array.from(map.entries())
      .map(([keyword, data]) => ({
        keyword,
        count: data.count,
        tracks: data.tracks,
        totalPlays: data.totalPlays,
        avgPlays: data.count > 0 ? Math.round(data.totalPlays / data.count) : 0
      }))
      .sort((a, b) => b.count - a.count || b.totalPlays - a.totalPlays || a.keyword.localeCompare(b.keyword));
  }, [tracks]);

  // Keyword Overview Metrics
  const totalUniqueKeywords = keywordStats.length;
  const totalTaggedCount = keywordStats.reduce((acc, curr) => acc + curr.count, 0);
  const tracksWithKeywords = tracks.filter(t => Array.isArray(t.keywords) && t.keywords.length > 0).length;
  const keywordCoveragePct = tracks.length > 0 ? Math.round((tracksWithKeywords / tracks.length) * 100) : 0;
  const top1Keyword = keywordStats[0]?.keyword || '暫無';

  // Selected keyword detail to expand its associated tracks
  const [selectedKeywordDetail, setSelectedKeywordDetail] = useState<string | null>(null);

  // Top tracks with most keywords
  const topTracksByKeywordRichness = useMemo(() => {
    return [...tracks]
      .filter(t => Array.isArray(t.keywords) && t.keywords.length > 0)
      .sort((a, b) => (b.keywords?.length || 0) - (a.keywords?.length || 0))
      .slice(0, 5);
  }, [tracks]);

  // Helper for rank badge
  const renderRankBadge = (idx: number) => {
    if (idx === 0) {
      return (
        <span className="w-6 h-6 rounded-full bg-amber-400 text-amber-950 font-black text-xs flex items-center justify-center shadow-xs shrink-0 font-mono">
          1
        </span>
      );
    }
    if (idx === 1) {
      return (
        <span className="w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center shadow-xs shrink-0 font-mono">
          2
        </span>
      );
    }
    if (idx === 2) {
      return (
        <span className="w-6 h-6 rounded-full bg-amber-700 text-white font-bold text-xs flex items-center justify-center shadow-xs shrink-0 font-mono">
          3
        </span>
      );
    }
    return (
      <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center shrink-0 font-mono">
        {idx + 1}
      </span>
    );
  };

  /**
   * Helper to render a member row with format:
   * 「照片＋繁星會場＋名字＋獎銜」
   */
  const renderMemberRow = (user: UserProfile, idx: number, extraValue: React.ReactNode) => {
    const venue = user.center || '無會場';
    return (
      <div
        key={user.id}
        onClick={() => onViewMember && onViewMember(user)}
        className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 hover:border-rose-300 dark:hover:border-rose-900 transition-all cursor-pointer group"
        title="點擊查看會員完整學習檔案"
      >
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          {renderRankBadge(idx)}

          {/* 照片 (Avatar) */}
          <div className="w-9 h-9 rounded-full overflow-hidden shrink-0 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs">
            <img
              src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80'}
              alt={user.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </div>

          {/* 會員資訊：繁星會場＋名字＋獎銜 */}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* 繁星會場 */}
              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-medium border border-slate-200/70 dark:border-slate-600 shrink-0">
                {venue}
              </span>

              {/* 名字 */}
              <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 group-hover:text-rose-600 transition-colors truncate">
                {user.name}
              </span>

              {/* 獎銜 */}
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium shrink-0">
                {effectiveMemberRank(user)}
              </span>
            </div>
          </div>
        </div>

        {/* Metric value badge */}
        <div className="shrink-0 text-right">
          {extraValue}
        </div>
      </div>
    );
  };

  /**
   * Helper to render 5 ranking slots (Requirement 10: 如果該項統計數據0，或者是統計人數未滿5人，那可以該名次可以空著)
   */
  const renderRankingSlots = (
    items: Array<{ user: UserProfile; value?: string; count?: number }>,
    renderExtra: (item: any) => React.ReactNode,
    twoCols: boolean = false
  ) => {
    return (
      <div className={twoCols ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "space-y-2"}>
        {Array.from({ length: 5 }).map((_, idx) => {
          const item = items[idx];
          const hasValid = item && item.user && (item.count !== undefined ? item.count > 0 : true);
          if (hasValid) {
            return renderMemberRow(item.user, idx, renderExtra(item));
          }
          return (
            <div
              key={`empty-slot-${idx}`}
              className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/50 dark:bg-slate-800/30 border border-dashed border-slate-200 dark:border-slate-800 text-slate-400 select-none"
            >
              <div className="flex items-center gap-2.5">
                {renderRankBadge(idx)}
                <span className="text-xs text-slate-400 dark:text-slate-500 italic">
                  第 {idx + 1} 名 從缺（尚無數據）
                </span>
              </div>
              <span className="text-xs text-slate-300 dark:text-slate-600 font-mono">-</span>
            </div>
          );
        })}
      </div>
    );
  };

  /**
   * Helper to render breakdown bar for Member statistics
   */
  const renderStatBreakdownList = (
    title: string,
    icon: React.ReactNode,
    items: Array<{ label: string; count: number }>,
    accentClass: string = 'text-rose-500'
  ) => {
    return (
      <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <span className={accentClass}>{icon}</span>
            <span>{title}</span>
          </h3>
          <span className="text-[10px] text-slate-400">
            共 {items.length} 個已有數據子項
          </span>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">目前尚無已填寫數據</div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => {
              const pct = totalUserCount > 0 ? ((item.count / totalUserCount) * 100).toFixed(1) : '0';
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      {item.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                        {item.count} 人
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono w-10 text-right">
                        {pct}%
                      </span>
                    </div>
                  </div>
                  {/* Visual progress bar */}
                  <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.min(100, Math.max(4, parseFloat(pct)))}%`,
                        backgroundColor: 'var(--color-primary, #c06c84)'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Banner - Requirement 3: 名稱修改為「排行榜」 */}
      <div className="bg-white/80 dark:bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-rose-100/60 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>排行榜</span>
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-xs text-slate-400">登錄夥伴</span>
            <p className="text-base sm:text-lg font-black font-mono text-[var(--color-primary,#c06c84)]">
              {totalUserCount} <span className="text-xs font-normal text-slate-500">位</span>
            </p>
          </div>
          <div className="text-right border-l border-slate-200 dark:border-slate-700 pl-3">
            <span className="text-xs text-slate-400">培訓音檔</span>
            <p className="text-base sm:text-lg font-black font-mono text-amber-600 dark:text-amber-400">
              {tracks.length} <span className="text-xs font-normal text-slate-500">部</span>
            </p>
          </div>
        </div>
      </div>

      {/* Requirement 2 & 4 (v2.5): 4 個子分頁導覽按鈕（新增「熱門關鍵字」分頁） */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 bg-slate-100/90 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-700/80">
        <button
          type="button"
          onClick={() => setActiveTab('model')}
          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'model'
              ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>模範生排行榜</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hot-tracks')}
          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'hot-tracks'
              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>熱門音檔排行榜</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('members')}
          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'members'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>會員排行榜</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stickers')}
          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'stickers'
              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          <span>貼紙排位賽</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hot-keywords')}
          className={`py-2 px-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            activeTab === 'hot-keywords'
              ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          <span>熱門關鍵字</span>
        </button>
      </div>

      {/* SUB-TAB 1: 模範生排行榜 */}
      {activeTab === 'model' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* 1. 基本資料最近更新前 5 名 */}
          <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-emerald-500" />
                <span>基本資料最近更新前 5 名</span>
              </h3>
              <span className="text-[10px] text-slate-400">依更新時間</span>
            </div>

            {renderRankingSlots(
              recentlyUpdated,
              item => (
                <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  {item.value ? item.value.replace('T', ' ').slice(0, 16) : '近期'}
                </span>
              )
            )}
          </div>

          {/* 2. 按讚前 5 名 */}
          <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-500" />
                <span>按讚前 5 名</span>
              </h3>
              <span className="text-[10px] text-slate-400">給讚次數</span>
            </div>

            {renderRankingSlots(
              topLikes,
              item => (
                <span className="text-xs font-bold text-rose-600 dark:text-rose-400 font-mono">
                  {item.count} 個讚
                </span>
              )
            )}
          </div>

          {/* 3. 心得數前 5 名 */}
          <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <MessageSquare className="w-4 h-4 text-blue-500" />
                <span>心得數前 5 名</span>
              </h3>
              <span className="text-[10px] text-slate-400">心得回饋數</span>
            </div>

            {renderRankingSlots(
              topComments,
              item => (
                <span className="text-xs font-bold text-blue-600 dark:text-blue-400 font-mono">
                  {item.count} 則
                </span>
              )
            )}
          </div>

          {/* 4. 點閱率前 5 名 */}
          <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-amber-500" />
                <span>點閱率前 5 名</span>
              </h3>
              <span className="text-[10px] text-slate-400">播放次數</span>
            </div>

            {renderRankingSlots(
              topClicks,
              item => (
                <span className="text-xs font-bold text-amber-600 dark:text-amber-400 font-mono">
                  {item.count} 次
                </span>
              )
            )}
          </div>

          {/* 5. 100% 聽完前 5 名 */}
          <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3 md:col-span-2">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-purple-500" />
                <span>100% 聽完前 5 名</span>
              </h3>
              <span className="text-[10px] text-slate-400">完整聽畢次數</span>
            </div>

            {renderRankingSlots(
              topFinished,
              item => (
                <span className="text-xs font-bold text-purple-600 dark:text-purple-400 font-mono">
                  {item.count} 次聽完
                </span>
              ),
              true
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: 熱門音檔排行榜 */}
      {activeTab === 'hot-tracks' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. 心得數排行 */}
            <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <span>心得數排行</span>
                </h3>
                <span className="text-[10px] text-slate-400">心得最熱絡</span>
              </div>

              <div className="space-y-2">
                {hotTracksByComments.map((t, idx) => (
                  <div
                    key={t.id}
                    onClick={() => onSelectTrack && onSelectTrack(t)}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 hover:border-blue-300 dark:hover:border-blue-800 transition-all cursor-pointer flex items-center justify-between gap-2 group"
                    title="點擊展開音檔學習"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {renderRankBadge(idx)}
                      <img
                        src={t.speakerAvatar}
                        alt={t.speaker}
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate group-hover:text-blue-600 transition-colors">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          <SpeakerNameLink name={t.speaker}/>{t.speakerRank ? ` · ${t.speakerRank}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 shrink-0">
                      {t.computedComments} 則
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. 評價排行 */}
            <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>評價滿意度排行</span>
                </h3>
                <span className="text-[10px] text-slate-400">平均星級最高</span>
              </div>

              <div className="space-y-2">
                {hotTracksByRating.map((t, idx) => (
                  <div
                    key={t.id}
                    onClick={() => onSelectTrack && onSelectTrack(t)}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-800 transition-all cursor-pointer flex items-center justify-between gap-2 group"
                    title="點擊展開音檔學習"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {renderRankBadge(idx)}
                      <img
                        src={t.speakerAvatar}
                        alt={t.speaker}
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate group-hover:text-amber-600 transition-colors">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          <SpeakerNameLink name={t.speaker}/>{t.speakerRank ? ` · ${t.speakerRank}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 justify-end">
                        <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                        {(t.rating || 5.0).toFixed(1)}
                      </span>
                      <span className="text-[9px] text-slate-400">
                        ({t.ratingCount || 1} 人評)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. 點擊播放次數排行 */}
            <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <Headphones className="w-4 h-4 text-rose-500" />
                  <span>點擊播放次數排行</span>
                </h3>
                <span className="text-[10px] text-slate-400">總播次最多</span>
              </div>

              <div className="space-y-2">
                {hotTracksByPlayCount.map((t, idx) => (
                  <div
                    key={t.id}
                    onClick={() => onSelectTrack && onSelectTrack(t)}
                    className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 hover:border-rose-300 dark:hover:border-rose-800 transition-all cursor-pointer flex items-center justify-between gap-2 group"
                    title="點擊展開音檔學習"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {renderRankBadge(idx)}
                      <img
                        src={t.speakerAvatar}
                        alt={t.speaker}
                        className="w-8 h-8 rounded-lg object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate group-hover:text-rose-600 transition-colors">
                          {t.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          <SpeakerNameLink name={t.speaker}/>{t.speakerRank ? ` · ${t.speakerRank}` : ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">
                      {t.playCount || 0} 次
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 4. 講師獎銜分佈統計指標 (含 GAR全球獎銜統計) */}
          <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-5 border border-rose-100/60 dark:border-slate-800 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      講師獎銜指標分佈統計
                    </h3>
                    {garTracksCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-100 to-rose-100 dark:from-amber-950 dark:to-rose-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-2xs">
                        ★ GAR 全球獎銜：{garTracksCount} 首
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    各階級講師收錄曲目量、累計收聽播放次數與平均滿意星等
                  </p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-500 self-end sm:self-auto">
                共 {speakerRankStats.length} 種講師獎銜
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {speakerRankStats.map(stat => (
                <div
                  key={stat.rank}
                  className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between gap-2 ${
                    stat.isGar
                      ? 'bg-gradient-to-br from-amber-50/70 to-rose-50/50 dark:from-amber-950/30 dark:to-rose-950/20 border-amber-200 dark:border-amber-800/60'
                      : 'bg-slate-50/90 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/80 hover:border-rose-200 dark:hover:border-rose-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-black truncate ${stat.isGar ? 'text-amber-800 dark:text-amber-300' : 'text-slate-800 dark:text-slate-100'}`}>
                      {stat.rank}
                    </span>
                    {stat.isGar && (
                      <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500 text-white shrink-0">
                        GAR
                      </span>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                      <span>{stat.count} 首錄音</span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                        {stat.totalPlays} 次播
                      </span>
                    </div>

                    <div className="w-full bg-slate-200/80 dark:bg-slate-700/80 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${stat.isGar ? 'bg-amber-500' : 'bg-rose-500'}`}
                        style={{ width: `${Math.max(8, Math.min(100, Math.round((stat.count / maxSpeakerRankCount) * 100)))}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 dark:border-slate-700/50 text-[10px] text-slate-400">
                    <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-bold font-mono">
                      ★ {stat.avgRating}
                    </span>
                    <span>均評</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: 會員排行榜（個別統計，僅顯示已有數據的子選項） */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Top 6 Demographic Breakdowns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. 初次如何認識安麗？ */}
            {renderStatBreakdownList(
              '初次如何認識安麗？',
              <Compass className="w-4 h-4" />,
              memberJoinReasonStats.map(s => ({ label: s.name, count: s.count })),
              'text-rose-500'
            )}

            {/* 1.1 什麼原因留在安麗？ (Requirement 1) */}
            {renderStatBreakdownList(
              '什麼原因留在安麗？',
              <Heart className="w-4 h-4" />,
              memberStayReasonStats.map(s => ({ label: s.name, count: s.count })),
              'text-pink-500'
            )}

            {/* 2. 居住地 */}
            {renderStatBreakdownList(
              '居住地分佈',
              <MapPin className="w-4 h-4" />,
              memberResidenceStats.map(s => ({ label: s.name, count: s.count })),
              'text-blue-500'
            )}

            {/* 3. 直銷商中心 */}
            {renderStatBreakdownList(
              '直銷商中心歸屬',
              <Building className="w-4 h-4" />,
              memberCenterStats.map(s => ({ label: s.name, count: s.count })),
              'text-emerald-500'
            )}

            {/* 4. 最高獎銜（高階在前） */}
            {renderStatBreakdownList(
              '最高獎銜階層（高階優先）',
              <Award className="w-4 h-4" />,
              memberRankStats.map(s => ({ label: s.name, count: s.count })),
              'text-amber-500'
            )}

            {/* 5. 星座 */}
            {renderStatBreakdownList(
              '星座分佈',
              <Sparkles className="w-4 h-4" />,
              memberZodiacStats.map(s => ({ label: s.name, count: s.count })),
              'text-purple-500'
            )}

            {/* 6. 生命靈數（1-9命數總人數，不用九宮格圖） */}
            {renderStatBreakdownList(
              '生命靈數（1-9 命數人數）',
              <TrendingUp className="w-4 h-4" />,
              memberLifeNumberStats.map(s => ({ label: `${s.num} 號人`, count: s.count })),
              'text-indigo-500'
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 4: 貼紙排位賽 */}
      {activeTab === 'stickers' && (
        <StickerLeaderboardTab users={users} onViewMember={onViewMember} />
      )}

      {/* SUB-TAB 5: 熱門關鍵字統計 - Requirement 4 (v2.5) */}
      {activeTab === 'hot-keywords' && (
        <div className="space-y-4">
          {/* Overview Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white/90 dark:bg-slate-900/80 rounded-2xl p-3.5 border border-teal-100/80 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-teal-500" />
                <span>不重複關鍵字</span>
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black font-mono text-slate-800 dark:text-slate-100">
                {totalUniqueKeywords} <span className="text-xs font-normal text-slate-400">個</span>
              </p>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 rounded-2xl p-3.5 border border-teal-100/80 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                <span>音檔標記覆蓋率</span>
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                {keywordCoveragePct}% <span className="text-xs font-normal text-slate-400">({tracksWithKeywords}/{tracks.length})</span>
              </p>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 rounded-2xl p-3.5 border border-teal-100/80 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5 text-amber-500" />
                <span>累計標記次數</span>
              </span>
              <p className="mt-1 text-lg sm:text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                {totalTaggedCount} <span className="text-xs font-normal text-slate-400">次</span>
              </p>
            </div>

            <div className="bg-white/90 dark:bg-slate-900/80 rounded-2xl p-3.5 border border-teal-100/80 dark:border-slate-800 shadow-2xs">
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-rose-500" />
                <span>榜首熱門詞</span>
              </span>
              <p className="mt-1 text-sm sm:text-base font-black text-rose-600 dark:text-rose-400 truncate" title={top1Keyword}>
                {top1Keyword}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Left 2 Cols: Top 10 Keywords with expansion */}
            <div className="lg:col-span-2 bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-teal-100/80 dark:border-slate-800 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-teal-500" />
                  <span>熱門網友關鍵字排行榜 (Top 10)</span>
                </h3>
                <span className="text-[11px] text-slate-400">依關聯音檔數與播放熱度排序</span>
              </div>

              {keywordStats.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-400">目前尚無關鍵字數據</div>
              ) : (
                <div className="space-y-2.5">
                  {keywordStats.slice(0, 10).map((item, idx) => {
                    const isExpanded = selectedKeywordDetail === item.keyword;
                    const maxCount = keywordStats[0]?.count || 1;
                    const pct = Math.round((item.count / maxCount) * 100);

                    return (
                      <div
                        key={item.keyword}
                        className="p-3 rounded-2xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 hover:border-teal-200 dark:hover:border-teal-900 transition-all space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 min-w-0">
                            {renderRankBadge(idx)}
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                                #{item.keyword}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                              <Headphones className="w-3.5 h-3.5 text-teal-500" />
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                {item.totalPlays} 次收聽
                              </span>
                            </div>

                            <span className="text-xs px-2 py-0.5 rounded-full bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-bold border border-teal-200/60 dark:border-teal-800/60">
                              {item.count} 首音檔
                            </span>

                            <button
                              type="button"
                              onClick={() => setSelectedKeywordDetail(isExpanded ? null : item.keyword)}
                              className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-semibold cursor-pointer"
                            >
                              {isExpanded ? '收合音檔' : '查看音檔'}
                            </button>
                          </div>
                        </div>

                        {/* Visual bar */}
                        <div className="h-1.5 w-full bg-slate-200/70 dark:bg-slate-700/70 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-300 bg-gradient-to-r from-teal-500 to-emerald-400"
                            style={{ width: `${Math.max(6, pct)}%` }}
                          />
                        </div>

                        {/* Associated Tracks accordion */}
                        {isExpanded && (
                          <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 space-y-1.5">
                            <p className="text-[10px] text-slate-400 font-medium">標記「{item.keyword}」的錄音檔：</p>
                            <div className="space-y-1">
                              {item.tracks.map(t => (
                                <div
                                  key={t.id}
                                  className="flex items-center justify-between p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs"
                                >
                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                    <Radio className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{t.title}</span>
                                    <span className="text-[11px] text-slate-400 shrink-0">· <SpeakerNameLink name={t.speaker}/></span>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] text-slate-400 font-mono">{t.playCount || 0} 次點播</span>
                                    {onSelectTrack && (
                                      <button
                                        type="button"
                                        onClick={() => onSelectTrack(t)}
                                        className="p-1 px-2 rounded-lg bg-teal-500 hover:bg-teal-600 text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                                        title="播放此音檔"
                                      >
                                        <Play className="w-2.5 h-2.5 fill-white" />
                                        <span>播放</span>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Keyword Richness Tracks & Tag Cloud */}
            <div className="space-y-4">
              {/* Top Tracks with Most Keywords */}
              <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-teal-100/80 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>標籤最豐富音檔 Top 5</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">關鍵字最多</span>
                </div>

                <div className="space-y-2">
                  {topTracksByKeywordRichness.map((t, idx) => (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/60 hover:border-amber-200 dark:hover:border-amber-900 transition-all space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {renderRankBadge(idx)}
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate">
                            {t.title}
                          </span>
                        </div>
                        {onSelectTrack && (
                          <button
                            type="button"
                            onClick={() => onSelectTrack(t)}
                            className="p-1 text-slate-400 hover:text-amber-600 rounded-md hover:bg-amber-50 dark:hover:bg-slate-700 cursor-pointer"
                            title="播放音檔"
                          >
                            <Play className="w-3 h-3 fill-current" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1 flex-wrap pl-8">
                        <span className="text-[10px] text-slate-400 mr-1">講師: <SpeakerNameLink name={t.speaker}/></span>
                        {(t.keywords || []).slice(0, 4).map(kw => (
                          <span
                            key={kw}
                            className="text-[9px] px-1.5 py-0.2 rounded bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 font-medium"
                          >
                            #{kw}
                          </span>
                        ))}
                        {(t.keywords?.length || 0) > 4 && (
                          <span className="text-[9px] text-slate-400 font-mono">
                            +{(t.keywords?.length || 0) - 4}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tag Cloud / Heat Distribution */}
              <div className="bg-white/90 dark:bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-teal-100/80 dark:border-slate-800 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                    <Tag className="w-4 h-4 text-teal-500" />
                    <span>網友關鍵字熱度分佈雲</span>
                  </h3>
                  <span className="text-[10px] text-slate-400">點擊探索</span>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {keywordStats.map((item) => {
                    const isSelected = selectedKeywordDetail === item.keyword;
                    const isHot = item.count >= 2;
                    return (
                      <button
                        key={item.keyword}
                        type="button"
                        onClick={() => setSelectedKeywordDetail(isSelected ? null : item.keyword)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-2xs active:scale-95 ${
                          isSelected
                            ? 'bg-teal-600 text-white shadow-xs'
                            : isHot
                            ? 'bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800 hover:bg-teal-100'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <span>#{item.keyword}</span>
                        <span className="text-[10px] opacity-75 font-mono">
                          {item.count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
