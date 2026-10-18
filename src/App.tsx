import { mergeMemberSession } from './authSessionPolicy';
import { isVisibleOnGuestHome, canGuestPlayPublicShare } from './visitorTrackPolicy';
import { canAppearInHomeForViewer } from './trackVisibilityPolicy';
import { createStickerSummaryClient, STICKER_POLL_MS } from './stickerSummaryClient';
import { sortStickerTracks } from './homePlaylistPolicy';
import { StickerFeedback, showStickerDelta, showStickerNotice, setFeedbackRules, getFeedbackRules } from './components/StickerFeedback';
import { IOSInstallPage } from './components/IOSInstallPage';
import { StickerSpendDialog } from './components/StickerSpendDialog';
import { vipPasswordForTrack } from '../shared/stickers';
import { baseSpeakerRank, effectiveMemberRank } from './utils/ranks';
import { normalizeSpeakerRankForBadge } from './utils/speakerRankBadge';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { apiJson, identityKeys } from './utils/api';
import { keywordRanking } from './utils/keywords';
import { moveTrackIdToSecondSlot, sortDefaultHomeTracks } from './homePlaylistPolicy';
import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import { Search, ChevronDown, Check, X, ShieldAlert, UploadCloud, Mic, ArrowDown, ArrowUp } from 'lucide-react';
import {
  Track,
  Comment,
  UserProfile,
  CategoryType,
  SortField,
  SortDirection,
  RANK_ORDER,
  AmwayRank,
  PlayerDisplayMode,
  SPEAKER_RANK_OPTIONS
} from './types';
import {
  LIGHT_PALETTES,
  DARK_THEME,
  getRandomLightPalette,
  applyThemeToDom
} from './utils/theme';
import { getOrCreateVisitor, VisitorIdentity } from './utils/visitor';
import {
  getStoredPlayback,
  saveStoredPlayback,
  clearStoredPlayback,
  AudioMemory
} from './utils/audio';
import {
  recordOfflineTrack,
  getOfflineAudioUrl,
  handleTrackProgressOffline,
  purgeStaleOfflineTracks,
  requestPersistentOfflineStorage
} from './utils/offlineAudio';

import { Navbar, NavTab } from './components/Navbar';
import { AudioCard } from './components/AudioCard';
import { MiniPlayer } from './components/MiniPlayer';
import { DetailView } from './components/DetailView';
const UploadModal = lazy(() => import('./components/UploadModal').then(module => ({ default: module.UploadModal })));
const AdminModal = lazy(() => import('./components/AdminModal').then(module => ({ default: module.AdminModal })));
const ProfileModal = lazy(() => import('./components/ProfileModal').then(module => ({ default: module.ProfileModal })));
import { ShareModal } from './components/ShareModal';
const BwExportModal = lazy(() => import('./components/BwExportModal').then(module => ({ default: module.BwExportModal })));
import { StatisticsView } from './components/StatisticsView';
import { CommentPreviewModal } from './components/CommentPreviewModal';
const MemberPreviewModal = lazy(() => import('./components/MemberPreviewModal').then(module => ({ default: module.MemberPreviewModal })));
import { NotificationsView } from './components/NotificationsView';
import { TwinklingStars } from './components/TwinklingStars';
import { TutorialSpotlight } from './components/TutorialSpotlight';
const ChangelogModal = lazy(() => import('./components/ChangelogModal').then(module => ({ default: module.ChangelogModal })));
const StickersModal = lazy(() => import('./components/StickersModal').then(module => ({ default: module.StickersModal })));

const DEFAULT_CATEGORIES: string[] = [
  '全部',
  '事業',
  '心態思維',
  '營養',
  '安麗產品',
  '影集',
  '未分類'
];

const HOME_CACHE_KEY = 'echostars_home_cache_v3_3';
const HOME_CACHE_TTL_MS = 5 * 60 * 1000;
const HOME_TUTORIAL_GROUP_NEVER_REMIND_KEY = 'echostars_home_tutorial_group_never_remind_v2';
const LEGACY_HOME_TUTORIAL_NEVER_REMIND_KEY = 'echostars_home_tutorial_never_remind_v1';
const LEGACY_PHOTO_TUTORIAL_NEVER_REMIND_KEY = 'echostars_photo_play_tutorial_never_remind_v1';

type HomeCache = {
  tracks: Track[];
  categories: string[];
  savedAt: number;
};

type AppHistoryState = {
  echostars?: true;
  view?: 'guard' | 'home' | 'detail' | 'tab';
  trackId?: string;
  tab?: 'stats' | 'notifications' | 'profile' | 'stickers' | 'install' | 'upload';
};

function shouldProtectBrowserBack() {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  return isIOS || isAndroid || isStandalone;
}

function readHomeCache(): HomeCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(HOME_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.tracks) || !Array.isArray(parsed.categories)) return null;
    return {
      tracks: parsed.tracks,
      categories: parsed.categories,
      savedAt: Number(parsed.savedAt) || 0
    };
  } catch {
    return null;
  }
}

function writeHomeCache(tracks: Track[], categories: string[], savedAt = Date.now()) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(HOME_CACHE_KEY, JSON.stringify({
      tracks,
      categories,
      savedAt
    }));
  } catch {
    // localStorage quota/full is non-fatal.
  }
}


function trackMatchesHomeKeyword(track: Track, rawKeyword: string) {
  const clean = rawKeyword.toLowerCase().trim();
  if (!clean) return true;
  const allKeywords = [...(track.keywords || []), ...(track.tags || [])].map(keyword => keyword.toLowerCase().trim());
  return (
    allKeywords.some(keyword => keyword.includes(clean)) ||
    track.title.toLowerCase().includes(clean) ||
    (track.speaker || '').toLowerCase().includes(clean) ||
    (track.description || '').toLowerCase().includes(clean) ||
    (track.series || '').toLowerCase().includes(clean)
  );
}

function trackMatchesHomeSearch(track: Track, rawQuery: string) {
  const tokens = rawQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const allKeywords = [...(track.keywords || []), ...(track.tags || [])].map(keyword => keyword.toLowerCase());
  return tokens.every(token => (
    track.title.toLowerCase().includes(token) ||
    (track.speaker || '').toLowerCase().includes(token) ||
    (track.speakerRank || '').toLowerCase().includes(token) ||
    (track.series || '').toLowerCase().includes(token) ||
    (track.description || '').toLowerCase().includes(token) ||
    (track.remarks || '').toLowerCase().includes(token) ||
    (track.category || '').toLowerCase().includes(token) ||
    (track.categories || []).some(category => category.toLowerCase().includes(token)) ||
    [
      track.speechDate,
      track.uploadDate,
      track.seriesOrder,
      track.requiredRank,
      track.uploaderName,
      track.uploaderEmail,
      track.audioUrl,
      track.duration,
      ...(track.externalFiles || []).flatMap(file => [file.name, file.url]),
      ...(track.externalVideos || []).flatMap(file => [file.name, file.url]),
      ...(track.externalPpts || []).flatMap(file => [file.name, file.url]),
      ...(track.socialLinks || []).flatMap(link => [link.platform, link.name, link.url])
    ].some(value => value?.toLowerCase().includes(token)) ||
    allKeywords.some(keyword => keyword.includes(token))
  ));
}

function trackMatchesHomeBaseFilters(
  track: Track,
  selectedCategory: string,
  selectedSpeakerRank: string,
  searchQuery: string
) {
  if (selectedCategory !== '全部') {
    const matchPrimary = track.category === selectedCategory;
    const matchMultiple = Boolean(track.categories?.includes(selectedCategory));
    if (!matchPrimary && !matchMultiple) return false;
  }
  if (selectedSpeakerRank !== '全部' && baseSpeakerRank(track.speakerRank || '') !== selectedSpeakerRank) return false;
  return trackMatchesHomeSearch(track, searchQuery);
}

export default function App() {
  // Navigation & View States
  const [currentTab, setCurrentTab] = useState<NavTab>('home');

  // Dynamic Categories (Requirement 5: 後台修改或刪除分類標籤後，首頁下拉選單同步更新)
  const [categoryOptions, setCategoryOptions] = useState<string[]>(() => {
    const cached = readHomeCache();
    return cached?.categories?.length ? cached.categories : DEFAULT_CATEGORIES;
  });

  // Requirement 11 (v2.7): 記憶已解鎖的私秘VIP音檔，支援經由專屬連結永久解鎖
  const [unlockedVipTracks, setUnlockedVipTracks] = useState<string[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('sq_unlocked_vip_tracks');
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [];
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const vipToken = params.get('vipToken');
      const trackId = params.get('trackId');
      if (vipToken && trackId) {
        setUnlockedVipTracks(prev => {
          if (prev.includes(trackId)) return prev;
          const next = [...prev, trackId];
          localStorage.setItem('sq_unlocked_vip_tracks', JSON.stringify(next));
          return next;
        });
      }
    }
  }, []);

  // Requirement 14: 記憶播放器狀態，如果是浮動播放器就一直維持浮動狀態
  const [savedPreferredMode, setSavedPreferredMode] = useState<PlayerDisplayMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sq_player_display_mode');
      if (stored === 'bubble') return stored;
    }
    return 'bubble';
  });

  const [playerMode, setPlayerModeState] = useState<PlayerDisplayMode>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sq_player_display_mode');
      if (stored === 'bubble') return stored;
    }
    return 'bubble';
  });

  const setPlayerMode = (mode: PlayerDisplayMode) => {
    setPlayerModeState(mode);
    if (mode === 'bubble') {
      setSavedPreferredMode(mode);
      if (typeof window !== 'undefined') {
        localStorage.setItem('sq_player_display_mode', mode);
      }
    }
  };

  // Theme States: Dynamic Light Theme & Fixed Dark Theme (Requirement 20: keep primary color)
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('sq_theme_dark') === 'true';
    }
    return false;
  });
  const [currentLightPalette, setCurrentLightPalette] = useState(() =>
    getRandomLightPalette()
  );

  useEffect(() => {
    applyThemeToDom(currentLightPalette, isDark);
  }, [isDark, currentLightPalette]);

  const handleToggleTheme = () => {
    const nextDark = !isDark;
    setIsDark(nextDark);
    localStorage.setItem('sq_theme_dark', String(nextDark));
  };

  const handleRandomPalette = () => {
    const nextPalette = getRandomLightPalette(currentLightPalette.id);
    setCurrentLightPalette(nextPalette);
  };

  // Visitor & User Authentication
  const [visitor, setVisitor] = useState<VisitorIdentity>(() => getOrCreateVisitor());
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sq_current_user_v1');
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          // ignore
        }
      }
    }
    return null;
  });

  // Helper: Super Admin Check (Only yukidu@gmail.com)
  const isSuperAdminEmail = (email?: string | null) => {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return clean === 'yukidu@gmail.com';
  };

  // Requirement 5, 10, 11 & 3: 超級管理員 (yukidu@gmail.com) 與 獎銜審核員
  const isSuperAdmin = isSuperAdminEmail(currentUser?.email) || currentUser?.role === '超級管理員' || currentUser?.id === 'u-admin';
  const isAdministrator =
    isSuperAdmin ||
    currentUser?.isAdminUser === true ||
    currentUser?.role === '獎銜審核員' ||
    currentUser?.role === '管理員';
  const isAdmin = isSuperAdmin;
  const canUpload = isSuperAdmin || currentUser?.isContributor === true;
  const notificationRank = effectiveMemberRank(currentUser, '');
  const notificationRankIndex = (RANK_ORDER as readonly string[]).indexOf(notificationRank);
  const notificationPlatinumIndex = (RANK_ORDER as readonly string[]).indexOf('白金');
  const canSeePendingAuditNotifications =
    isSuperAdmin ||
    currentUser?.role === '獎銜審核員' ||
    (notificationPlatinumIndex >= 0 && notificationRankIndex >= notificationPlatinumIndex);

  // Tracks, Comments, Users from Backend API
  const [tracks, setTracks] = useState<Track[]>(() => readHomeCache()?.tracks || []);
  const tracksHistoryRef = useRef<Track[]>(tracks);
  const locallyChangedTrackIds = useRef(new Set<string>());
  useEffect(() => {
    tracksHistoryRef.current = tracks;
  }, [tracks]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [allComments, setAllComments] = useState<Comment[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [stickerSummary, setStickerSummary] = useState<{ cursor:number; balance: number; unlockedTrackIds: string[]; commentRewardTrackIds: string[]; unreadNotifications: number; canGrant: boolean; isSuperAdmin: boolean } | null>(null);
  const [isStickersOpen, setIsStickersOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(() => (readHomeCache()?.tracks || []).length === 0);
  const homeCacheValidatedAtRef = useRef(readHomeCache()?.savedAt || 0);
  const hasFetchedAllCommentsRef = useRef(false);
  const hasFetchedAllUsersRef = useRef(false);

  // Heavy community datasets are loaded only when a view actually needs them.
  const fetchAllComments = async (force = false) => {
    if (hasFetchedAllCommentsRef.current && !force) return;
    try {
      const res = await fetch('/api/comments');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setAllComments(data);
          hasFetchedAllCommentsRef.current = true;
        }
      }
    } catch (e) {
      console.error('Failed to fetch all comments:', e);
    }
  };

  const fetchAllUsers = async (force = false) => {
    if (!currentUser) return;
    if (hasFetchedAllUsersRef.current && !force) return;
    try {
      const res = await fetch('/api/users');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setAllUsers(data);
        hasFetchedAllUsersRef.current = true;
      }
    } catch (e) {
      console.error('Failed to fetch users:', e);
    }
  };

  const [stickerSummaryClient] = useState(()=>createStickerSummaryClient(apiJson));
  const stickerSummaryRequest = useRef(0);
  const stickerCursor = useRef<{userId:string;value:number}>({userId:'',value:0});
  const seenStickerChanges=useRef(new Set<string>());
  const refreshStickerSummary = useCallback(async () => {
    const requestId = ++stickerSummaryRequest.current;
    if (!currentUser) {
      setStickerSummary(null);
      return;
    }
    try {
      const after=stickerCursor.current.userId===currentUser.id?stickerCursor.current.value:0;
      const data = await stickerSummaryClient.read(currentUser.id, after);
      if (requestId !== stickerSummaryRequest.current) return;
      for(const change of data.changes || []) if(!seenStickerChanges.current.has(change.id)){seenStickerChanges.current.add(change.id);showStickerDelta(change.delta);}
      stickerSummaryClient.acknowledge(currentUser.id,Number(data.cursor));
      stickerCursor.current={userId:currentUser.id,value:data.cursor};
      if (data.unchanged && data.balance === undefined) {
        setStickerSummary(prev => prev ? {...prev,unreadNotifications:Number(data.unreadNotifications || 0),canGrant:Boolean(data.canGrant),isSuperAdmin:Boolean(data.isSuperAdmin)} : prev);
        return;
      }
      setStickerSummary({
        cursor:Number(data.cursor || 0),
        balance: Number(data.balance || 0),
        unlockedTrackIds: Array.isArray(data.unlockedTrackIds) ? data.unlockedTrackIds : [],
        commentRewardTrackIds: Array.isArray(data.commentRewardTrackIds) ? data.commentRewardTrackIds : [],
        unreadNotifications: Number(data.unreadNotifications || 0),
        canGrant: Boolean(data.canGrant),
        isSuperAdmin: Boolean(data.isSuperAdmin)
      });
    } catch (error) {
      console.warn('Failed to load sticker balance:', error);
    }
  }, [currentUser?.id]);

  useEffect(() => {
    void apiJson('/api/stickers/public-settings').then(data=>setFeedbackRules(data.settings)).catch(()=>{});
  }, []);
  useEffect(() => {
    stickerSummaryClient.reset();
    seenStickerChanges.current.clear();
    stickerCursor.current={userId:'',value:0};
    setStickerSummary(null);
    void refreshStickerSummary();
    if (!currentUser) return;
    const refreshVisible=()=>{if(document.visibilityState==='visible')void refreshStickerSummary();};
    const timer=window.setInterval(refreshVisible,STICKER_POLL_MS);
    document.addEventListener('visibilitychange',refreshVisible);
    window.addEventListener('focus',refreshVisible);
    return()=>{
      stickerSummaryRequest.current += 1;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange',refreshVisible);
      window.removeEventListener('focus',refreshVisible);
    };
  }, [refreshStickerSummary]);
  useEffect(() => {
    let timer:number;
    const refresh = () => {
      if(!currentUser)return;
      stickerSummaryClient.invalidate(currentUser.id);
      window.clearTimeout(timer);
      timer=window.setTimeout(()=>void refreshStickerSummary(),200);
    };
    window.addEventListener('echostars:sticker-changed', refresh);
    return () => {window.clearTimeout(timer);window.removeEventListener('echostars:sticker-changed', refresh);};
  }, [refreshStickerSummary]);

  // Requirement 9, 10 & 12: 未審核通過名單總數 + 被 @ 標記提醒總數（用於通知鈴鐺徽章提醒）
  const pendingAuditCount = canSeePendingAuditNotifications
    ? allUsers.filter(u => u.rankAuditStatus === 'pending' || u.rankApproved === false).length
    : 0;
  const [stickerSpend, setStickerSpend] = useState<{title:string;cost:number} | null>(null);
  const stickerSpendResolver = useRef<((value:boolean)=>void) | null>(null);
  const resolveStickerSpend = (value:boolean) => { const resolve=stickerSpendResolver.current; stickerSpendResolver.current=null; setStickerSpend(null); resolve?.(value); };
  useEffect(() => { resolveStickerSpend(false); }, [currentUser?.id]);
  const pendingNotificationsCount = useMemo(() => {
    const userList = Array.isArray(allUsers) ? allUsers : [];
    const auditCount = userList.filter(u => u.rankAuditStatus === 'pending' || u.rankApproved === false).length;
    const myName = currentUser?.name?.trim().toLowerCase();
    const myEmail = currentUser?.email?.toLowerCase().trim();
    const activeCommentPool = Array.isArray(allComments) && allComments.length > 0 
      ? allComments 
      : (Array.isArray(comments) ? comments : []);
    let dismissed: string[] = [];
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('sq_dismissed_mentions');
        if (stored) dismissed = JSON.parse(stored);
      } catch {}
    }
    const mentionCount = (currentUser && myName)
      ? activeCommentPool.filter(c => {
          if (!c.content) return false;
          if (dismissed.includes(c.id)) return false;
          const lower = c.content.toLowerCase();
          const hasDirect = lower.includes(`@${myName}`) || lower.includes(`＠${myName}`);
          const isReply = c.replyToAuthor && c.replyToAuthor.toLowerCase().trim() === myName;
          const isSelf = (c.authorEmail && c.authorEmail.toLowerCase().trim() === myEmail) || (c.authorName && c.authorName.toLowerCase().trim() === myName);
          return (hasDirect || isReply) && !isSelf;
        }).length
      : 0;
    return (canSeePendingAuditNotifications ? auditCount : 0) + mentionCount;
  }, [allUsers, comments, allComments, currentUser, canSeePendingAuditNotifications]);

  // Filter & Search & Sort states (Requirement 18 & 19)
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [selectedSpeakerRank, setSelectedSpeakerRank] = useState<string>('全部');
  const [selectedBadgeSpeakerRank, setSelectedBadgeSpeakerRank] = useState<string>('');
  const [isSpeakerRankDropdownOpen, setIsSpeakerRankDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

  // Display base ranks only; founder and GAR variants belong to the same base rank.
  const speakerRankFilterOptions = useMemo(() => {
    const ranks = [...SPEAKER_RANK_OPTIONS, ...tracks.map(t => t.speakerRank || '')]
      .map(baseSpeakerRank)
      .filter(rank => rank && rank !== '無' && rank !== '全球獎銜');
    return ['全部', ...new Set(ranks)];
  }, [tracks]);

  // Requirement 6 (v2.8): 多組網友關鍵字交叉複合搜尋 (Selected Keywords Chips)
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [showKeywordsDrawer, setShowKeywordsDrawer] = useState(false);

  const [showHomeTutorial, setShowHomeTutorial] = useState(() => {
    if (typeof window === 'undefined') return true;
    return !(
      localStorage.getItem(HOME_TUTORIAL_GROUP_NEVER_REMIND_KEY) === '1' ||
      localStorage.getItem(LEGACY_HOME_TUTORIAL_NEVER_REMIND_KEY) === '1' ||
      localStorage.getItem(LEGACY_PHOTO_TUTORIAL_NEVER_REMIND_KEY) === '1'
    );
  });
  const [neverRemindHomeTutorial, setNeverRemindHomeTutorial] = useState(false);
  const handleHomeTutorialNeverRemind = (checked: boolean) => {
    setNeverRemindHomeTutorial(checked);
    if (typeof window === 'undefined') return;
    const keys = [
      HOME_TUTORIAL_GROUP_NEVER_REMIND_KEY,
      LEGACY_HOME_TUTORIAL_NEVER_REMIND_KEY,
      LEGACY_PHOTO_TUTORIAL_NEVER_REMIND_KEY
    ];
    keys.forEach(key => {
      if (checked) localStorage.setItem(key, '1');
      else localStorage.removeItem(key);
    });
  };

  // Collect all unique keywords across all tracks
  const allAvailableKeywords = useMemo(() => keywordRanking(tracks), [tracks]);

  // Requirement 8: 自動顯示相關的關鍵詞（包括：分類標籤、網友關鍵字、音檔詳細資料）
  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { categories: [], keywords: [] };

    // 1. 分類標籤
    const matchedCategories = categoryOptions
      .filter(cat => cat !== '全部' && (!q || cat.toLowerCase().includes(q)))
      .slice(0, 4);

    // 2. 網友關鍵字 (從所有音檔收集 keywords)
    const kwSet = new Set<string>();
    tracks.forEach(t => {
      (t.keywords || []).forEach((k: string) => { if (k && k.trim()) kwSet.add(k.trim()); });
      (t.tags || []).forEach((k: string) => { if (k && k.trim()) kwSet.add(k.trim()); });
    });
    tracks.forEach(t => [t.title, t.speaker, t.speakerRank, t.series, t.seriesOrder, t.speechDate, t.uploadDate, t.description, t.remarks, t.uploaderName, t.requiredRank, ...(t.externalFiles||[]).map(f=>f.name), ...(t.externalVideos||[]).map(f=>f.name), ...(t.externalPpts||[]).map(f=>f.name)].forEach(value => { if (value) kwSet.add(value); }));
    const matchedKeywords = Array.from(kwSet)
      .filter(kw => !q || kw.toLowerCase().includes(q))
      .slice(0, 10);

    return {
      categories: matchedCategories,
      keywords: matchedKeywords
    };
  }, [categoryOptions, searchQuery, tracks]);

  // Requirement 11 (v2.7): 判定私秘VIP音檔是否已獲得授權解鎖
  const isTrackVipUnlocked = (track: Track): boolean => {
    if (!track.isPrivateVip) return true;
    if (isSuperAdmin) return true;
    if (currentUser && track.uploadedBy && (currentUser.email === track.uploadedBy || currentUser.name === track.uploadedBy)) return true;
    if (currentUser && track.uploaderEmail && currentUser.email === track.uploaderEmail) return true;
    return unlockedVipTracks.includes(track.id);
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [sortField, setSortField] = useState<SortField>('權限');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [useDefaultHomeOrder, setUseDefaultHomeOrder] = useState(true);
  const [homeShuffleSeed, setHomeShuffleSeed] = useState(() =>
    ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0)
  );
  const [luckyPhase, setLuckyPhase] = useState<'idle' | 'spin' | 'win'>('idle');
  const [luckyOrderIds, setLuckyOrderIds] = useState<string[] | null>(null);
  const [luckyWinnerId, setLuckyWinnerId] = useState<string | null>(null);
  const [luckyAnswerText, setLuckyAnswerText] = useState<string | null>(null);
  const luckyTimersRef = useRef<number[]>([]);
  const luckyAudioContextRef = useRef<AudioContext | null>(null);
  const luckyRequestPending = useRef(false);
  const luckyDrawGenerationRef = useRef(0);

  const clearLuckyTimers = useCallback(() => {
    luckyTimersRef.current.forEach(timer => window.clearTimeout(timer));
    luckyTimersRef.current = [];
  }, []);

  const resetLuckyDrawState = useCallback(() => {
    luckyDrawGenerationRef.current += 1;
    luckyRequestPending.current = false;
    clearLuckyTimers();
    setLuckyPhase('idle');
    setLuckyOrderIds(null);
    setLuckyWinnerId(null);
    setLuckyAnswerText(null);
  }, [clearLuckyTimers]);

  useEffect(() => {
    if (luckyPhase !== 'win') return;

    const dismissLuckyWinnerOnBlank = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('button, a, input, select, textarea, [role="button"], [data-track-card-id]')) return;
      resetLuckyDrawState();
    };

    document.addEventListener('pointerdown', dismissLuckyWinnerOnBlank, { passive: true });
    return () => document.removeEventListener('pointerdown', dismissLuckyWinnerOnBlank);
  }, [luckyPhase, resetLuckyDrawState]);

  useEffect(() => {
    if (!luckyAnswerText) return;
    const dismissLuckyAnswer = () => setLuckyAnswerText(null);
    document.addEventListener('pointerdown', dismissLuckyAnswer, { passive: true });
    return () => document.removeEventListener('pointerdown', dismissLuckyAnswer);
  }, [luckyAnswerText]);

  useEffect(() => () => {
    clearLuckyTimers();
    const context = luckyAudioContextRef.current;
    luckyAudioContextRef.current = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }, [clearLuckyTimers]);

  const [trackToEdit, setTrackToEdit] = useState<Track | null>(null);

  // Audio Playback Engine
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Prevent HTMLAudioElement "timeupdate" from sending duplicate progress requests
  // multiple times during the same 15-second checkpoint.
  const lastPlaybackSyncRef = useRef<{ trackId: string; second: number; completed?: boolean }>({
    trackId: '',
    second: -1
  });
  const durationRepairStartedRef = useRef(false);
  const [playingTrackSnapshot, setCurrentTrack] = useState<Track | null>(null);
  const currentTrack = tracks.find(t => t.id === playingTrackSnapshot?.id) || playingTrackSnapshot;
  const [detailTrackSnapshot, setSelectedDetailTrack] = useState<Track | null>(null);
  const selectedDetailTrack = tracks.find(t => t.id === detailTrackSnapshot?.id) || detailTrackSnapshot;
  const activeCommentsTrackIdRef = useRef<string | null>(null);
  activeCommentsTrackIdRef.current = selectedDetailTrack?.id || currentTrack?.id || null;
  const [detailNavigation, setDetailNavigation] = useState({ sequence: 0, target: 'audio-timeline' });
  const [commentsTrackId, setCommentsTrackId] = useState<string | null>(null);
  const openTrackDetail = (track: Track, commentId?: string) => {
    setIsProfileOpen(false);setIsStickersOpen(false);
    setSelectedDetailTrack(track);
    setCurrentTab('home');
    setPlayerMode('expanded');
    setDetailNavigation(prev => ({ sequence: prev.sequence + 1, target: commentId ? `comment-${commentId}` : 'audio-timeline' }));
  };
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [playbackMemories, setPlaybackMemories] = useState<Record<string, AudioMemory>>({});

  // Fullscreen loading is reserved for the initial source load only.
  // Short buffering caused by dragging/seeking must never keep covering the page.
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const audioInitialLoadRef = useRef(false);
  const audioLoadingTimerRef = useRef<number | null>(null);

  const clearAudioLoadingTimer = useCallback(() => {
    if (audioLoadingTimerRef.current !== null) {
      window.clearTimeout(audioLoadingTimerRef.current);
      audioLoadingTimerRef.current = null;
    }
  }, []);

  const beginInitialAudioLoad = useCallback(() => {
    clearAudioLoadingTimer();
    audioInitialLoadRef.current = true;
    audioLoadingTimerRef.current = window.setTimeout(() => {
      audioLoadingTimerRef.current = null;
      if (audioInitialLoadRef.current) setIsLoadingAudio(true);
    }, 350);
  }, [clearAudioLoadingTimer]);

  const finishInitialAudioLoad = useCallback(() => {
    clearAudioLoadingTimer();
    audioInitialLoadRef.current = false;
    setIsLoadingAudio(false);
  }, [clearAudioLoadingTimer]);

  // Requirement 15: Floating comment preview popup modal & member preview modal
  const [commentPreviewSnapshot, setCommentPreviewTrack] = useState<Track | null>(null);
  const commentPreviewTrack = tracks.find(t => t.id === commentPreviewSnapshot?.id) || commentPreviewSnapshot;
  const [previewMember, setPreviewMember] = useState<UserProfile | null>(null);

  // Modals
  const visitorShareTrackId = useRef<string | null>(null);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [profileEditRequested,setProfileEditRequested] = useState(false);
  const uplineInviteHandledRef = useRef('');
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [isBwExportOpen, setIsBwExportOpen] = useState(false);
  const [bwExportMode, setBwExportMode] = useState<'comments' | 'rated'>('comments');
  const [isChangelogOpen, setIsChangelogOpen] = useState(false);
  const [permissionAlert, setPermissionAlert] = useState<string | null>(null);
  const [permissionAlertPosition, setPermissionAlertPosition] = useState<{ left: number; top: number } | null>(null);

  // Browser back/forward integration for the SPA.
  // Desktop gets normal in-app history; mobile/PWA gets one same-page guard entry
  // so the first Back action can never immediately close the app/tab.
  const historyReadyRef = useRef(false);
  const historyApplyingPopRef = useRef(false);
  const savedPreferredModeHistoryRef = useRef(savedPreferredMode);

  useEffect(() => {
    savedPreferredModeHistoryRef.current = savedPreferredMode;
  }, [savedPreferredMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const previousScrollRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    const protectBack = shouldProtectBrowserBack();
    const homeState: AppHistoryState = { echostars: true, view: 'home' };
    const existing = window.history.state as AppHistoryState | null;

    if (protectBack) {
      if (!existing?.echostars) {
        window.history.replaceState(
          { echostars: true, view: 'guard' } satisfies AppHistoryState,
          '',
          window.location.href
        );
        window.history.pushState(homeState, '', window.location.href);
      } else if (existing.view === 'guard') {
        window.history.pushState(homeState, '', window.location.href);
      } else if (existing.view !== 'home') {
        // A reload should start from a predictable root state. Direct share URLs
        // can still reopen their track through the existing bootstrap logic.
        window.history.replaceState(homeState, '', window.location.href);
      }
    } else {
      window.history.replaceState(homeState, '', window.location.href);
    }

    historyReadyRef.current = true;

    const closeTransientUi = () => {
      setIsShareOpen(false);
      setIsBwExportOpen(false);
      setIsUploadOpen(false);
      setIsAdminOpen(false);
      setIsProfileOpen(false);
      setIsStickersOpen(false);
      setIsChangelogOpen(false);
      setCommentPreviewTrack(null);
      setPreviewMember(null);
      setTrackToEdit(null);
    };

    const showHomeFromHistory = () => {
      clearLuckyTimers();
      setLuckyPhase('idle');
      setLuckyOrderIds(null);
      setLuckyWinnerId(null);
      setUseDefaultHomeOrder(true);
      setSortField('權限');
      setSortDirection('asc');
      setHomeShuffleSeed(((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
      setCurrentTab('home');
      setSelectedDetailTrack(null);
      setPlayerModeState(savedPreferredModeHistoryRef.current);
      window.scrollTo({ top: 0, behavior: 'auto' });
    };

    const handlePopState = (event: PopStateEvent) => {
      historyApplyingPopRef.current = true;
      closeTransientUi();

      const state = event.state as AppHistoryState | null;
      setIsProfileOpen(state?.tab === 'profile');
      setIsStickersOpen(state?.tab === 'stickers');

      if (state?.echostars && state.view === 'detail' && state.trackId) {
        const track = tracksHistoryRef.current.find(item => item.id === state.trackId);
        if (track) {
          setCurrentTab('home');
          setSelectedDetailTrack(track);
          setPlayerModeState('expanded');
          setDetailNavigation(prev => ({ sequence: prev.sequence + 1, target: 'audio-timeline' }));
        } else {
          showHomeFromHistory();
        }
      } else if (
        state?.echostars &&
        state.view === 'tab' &&
        (['stats','notifications','profile','stickers','install','upload'].includes(state.tab || ''))
      ) {
        setSelectedDetailTrack(null);
        setPlayerModeState(savedPreferredModeHistoryRef.current);
        setCurrentTab(state.tab!);
        if (state.tab === 'upload') setIsUploadOpen(true);
      } else {
        showHomeFromHistory();
      }

      window.requestAnimationFrame(() => {
        historyApplyingPopRef.current = false;

        // Mobile browsers and standalone PWAs must keep one in-app entry behind
        // the root page. Back at root therefore returns to home instead of
        // closing the PWA or leaving/closing the current tab.
        if (
          protectBack &&
          (!state?.echostars || state.view === 'guard')
        ) {
          window.history.pushState(homeState, '', window.location.href);
        }
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.history.scrollRestoration = previousScrollRestoration;
    };
  }, []);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !historyReadyRef.current ||
      historyApplyingPopRef.current
    ) {
      return;
    }

    const detailTrack =
      selectedDetailTrack ||
      (currentTrack && playerMode === 'expanded' ? currentTrack : null);

    let nextState: AppHistoryState;
    if (isUploadOpen) {
      nextState={echostars:true,view:'tab',tab:'upload'};
    } else if (isProfileOpen || isStickersOpen) {
      nextState={echostars:true,view:'tab',tab:isProfileOpen?'profile':'stickers'};
    } else if (detailTrack) {
      nextState = { echostars: true, view: 'detail', trackId: detailTrack.id };
    } else if (currentTab === 'stats' || currentTab === 'notifications' || currentTab === 'install') {
      nextState = { echostars: true, view: 'tab', tab: currentTab };
    } else {
      nextState = { echostars: true, view: 'home' };
    }

    const currentState = window.history.state as AppHistoryState | null;
    const isSame =
      currentState?.echostars === true &&
      currentState.view === nextState.view &&
      currentState.trackId === nextState.trackId &&
      currentState.tab === nextState.tab;

    if (!isSame) {
      window.history.pushState(nextState, '', window.location.href);
    }
  }, [
    currentTab,
    isUploadOpen,
    isProfileOpen,
    isStickersOpen,
    selectedDetailTrack?.id,
    currentTrack?.id,
    playerMode
  ]);

  const showPermissionAlert = useCallback((message: string, anchor?: HTMLElement | null) => {
    setPermissionAlert(message);
    if (!anchor || typeof window === 'undefined') {
      setPermissionAlertPosition(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    const maxWidth = Math.min(384, window.innerWidth - 16);
    const left = Math.max(8, Math.min(window.innerWidth - maxWidth - 8, rect.left + rect.width / 2 - maxWidth / 2));
    const estimatedHeight = 150;
    const top = rect.bottom + estimatedHeight + 12 <= window.innerHeight
      ? rect.bottom + 8
      : Math.max(8, rect.top - estimatedHeight - 8);
    setPermissionAlertPosition({ left, top });
  }, []);

  useEffect(()=>{
    if(typeof window==='undefined')return;
    const match=window.location.pathname.match(/^\/upline\/([^/]+)\/?$/);
    if(!match)return;
    const dealerId=decodeURIComponent(match[1] || '').trim();
    if(!dealerId)return;
    if(!currentUser){setIsProfileOpen(true);return;}
    const operationKey=`${currentUser.id}:${dealerId}`;
    if(uplineInviteHandledRef.current===operationKey)return;
    uplineInviteHandledRef.current=operationKey;
    void apiJson('/api/organization/invite-accept',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealerId})}).then(data=>{
      if(data.user){const updated={...currentUser,...data.user};const retained = mergeMemberSession(currentUser, updated);setCurrentUser(retained);localStorage.setItem('sq_current_user_v1',JSON.stringify(retained));setAllUsers(prev=>[...prev.filter(user=>user.id!==updated.id),updated]);}
      showStickerNotice(data.message || `已完成下線綁定：${data.displayName || ''}`,2);
      setIsProfileOpen(false);setIsStickersOpen(false);setCurrentTab('home');
      window.history.replaceState({echostars:true,view:'home'},'',window.location.origin + '/');
    }).catch(error=>{showPermissionAlert(error instanceof Error?error.message:'下線綁定失敗，請重新開啟邀請連結');});
  },[currentUser?.id,showPermissionAlert]);

  // Requirement 5: 分類標籤同步函數 (後台增刪改後首頁下拉選單同步更新)
  const fetchCategories = async (providedCategories?: string[], change?: { oldName: string; newName?: string }) => {
    if (change) {
      tracks.filter(t => t.categories?.includes(change.oldName)).forEach(track => {
        updateTrackCopies(track.id, current => {
          const categories = [...new Set((current.categories || []).flatMap(name => name === change.oldName ? (change.newName ? [change.newName] : []) : [name]))];
          return { ...current, categories: categories.length ? categories : ['未分類'] };
        });
      });
    }
    try {
      const cData = Array.isArray(providedCategories)
        ? providedCategories
        : await (async () => {
            const cRes = await fetch('/api/categories');
            return cRes.ok ? await cRes.json() : null;
          })();
      if (Array.isArray(cData)) {
        const list = Array.from(new Set(['全部', ...cData]));
        setCategoryOptions(list);
        setSelectedCategory(prev => (list.includes(prev) ? prev : '全部'));

      }
    } catch (e) {
      console.error('Failed to sync categories:', e);
    }
  };

  // 任何情況下，只要按主選單的logo或網站名稱，就會返回到首頁播放清單的「全部分類」，清空搜尋條件
  const handleReturnToHomePlaylist = useCallback(() => {
    resetLuckyDrawState();
    setUseDefaultHomeOrder(true);
    setSortField('權限');
    setSortDirection('asc');
    setHomeShuffleSeed(((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0));
    setCurrentTab('home');
    setSelectedDetailTrack(null);
    setSelectedCategory('全部');
    setSelectedSpeakerRank('全部');
    setSelectedBadgeSpeakerRank('');
    setIsSpeakerRankDropdownOpen(false);
    setSearchQuery('');
    setSelectedKeywords([]);
    setIsCategoryDropdownOpen(false);
    setIsSearchFocused(false);
    setShowKeywordsDrawer(false);
    setIsUploadOpen(false);
    setIsAdminOpen(false);
    setIsProfileOpen(false);
    setIsStickersOpen(false);
    setIsChangelogOpen(false);
    setIsShareOpen(false);
    setIsBwExportOpen(false);
    setCommentPreviewTrack(null);
    setPreviewMember(null);
    if (playerMode === 'expanded') {
      setPlayerMode(savedPreferredMode);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [playerMode, savedPreferredMode, setPlayerMode, resetLuckyDrawState]);

  // 1. Fast home bootstrap: show local cache immediately, then refresh only when stale.
  useEffect(() => {
    purgeStaleOfflineTracks();

    const cached = readHomeCache();
    const cacheFresh = Boolean(
      cached?.tracks?.length &&
      Date.now() - cached.savedAt < HOME_CACHE_TTL_MS
    );
    const urlParams = new URLSearchParams(window.location.search);
    const requestedTrackId =
      urlParams.get('track') ||
      (window.location.pathname.startsWith('/share/')
        ? decodeURIComponent(window.location.pathname.slice(7))
        : null);

    if (cached?.tracks?.length) {
      const memories: Record<string, AudioMemory> = {};
      cached.tracks.forEach((t: Track) => {
        const m = getStoredPlayback(t.id);
        if (m) memories[t.id] = m;
      });
      setPlaybackMemories(memories);
      setIsLoading(false);
    }

    async function refreshHomeData() {
      // Fresh cache avoids a Worker request + full D1 track scan on quick revisits.
      // A direct/shared track URL always revalidates so a newly uploaded track can open.
      if (cacheFresh && !requestedTrackId) return;

      try {
        const [tracksRes, catRes] = await Promise.all([
          fetch('/api/tracks'),
          fetch('/api/categories')
        ]);

        let nextCategories = cached?.categories?.length ? cached.categories : DEFAULT_CATEGORIES;
        if (catRes.ok) {
          const cData = await catRes.json();
          if (Array.isArray(cData)) {
            nextCategories = Array.from(new Set(['全部', ...cData]));
            setCategoryOptions(nextCategories);
          }
        }

        if (tracksRes.ok) {
          const tData = await tracksRes.json();
          if (Array.isArray(tData)) {
            homeCacheValidatedAtRef.current = Date.now();
            setTracks(previous => {
              const changed = locallyChangedTrackIds.current;
              const incoming = tData.filter((t: Track) => !changed.has(t.id));
              return [...incoming, ...previous.filter(t => changed.has(t.id))];
            });

            const memories: Record<string, AudioMemory> = {};
            tData.forEach((t: Track) => {
              const m = getStoredPlayback(t.id);
              if (m) memories[t.id] = m;
            });
            setPlaybackMemories(prev => ({ ...memories, ...prev }));

            if (requestedTrackId) {
              const found = tData.find((t: Track) => t.id === requestedTrackId);
              if (found && canAppearInHomeForViewer(found, Boolean(currentUser), checkCanAccess(found))) {
                visitorShareTrackId.current = found.id;
                openTrackDetail(found);
                void handlePlayTrack(found, 'expanded', null, true);
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to refresh home data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    void refreshHomeData();

    // Non-critical personalized data loads after first paint and never blocks home.
    const backgroundTimer = window.setTimeout(async () => {
      if (currentUser?.email) {
        try {
          const profileCheckKey = 'echostars_profile_checked_at_v3_3';
          const lastProfileCheck = Number(localStorage.getItem(profileCheckKey) || 0);
          if (Date.now() - lastProfileCheck > 10 * 60 * 1000) {
            const profileRes = await fetch(`/api/users/profile?email=${encodeURIComponent(currentUser.email)}`);
            if (profileRes.ok) {
              const profileData = await profileRes.json();
              const matched = profileData?.user;
              if (matched) {
                const isOwner = isSuperAdminEmail(matched.email);
                const synced: UserProfile = {
                  ...currentUser,
                  ...matched,
                  role: isOwner ? '超級管理員' : matched.role,
                  isAdminUser: isOwner ? true : Boolean(matched.isAdminUser),
                  isContributor: isOwner ? true : Boolean(matched.isContributor),
                  canUpload: isOwner ? true : Boolean(matched.canUpload || matched.isContributor),
                  rankApproved: isOwner ? true : Boolean(matched.rankApproved),
                  rankAuditStatus: isOwner ? 'approved' : matched.rankAuditStatus
                };
                setCurrentUser(synced);
                localStorage.setItem('sq_current_user_v1', JSON.stringify(synced));
                localStorage.setItem(profileCheckKey, String(Date.now()));
              }
            }
          }
        } catch (e) {
          console.warn('Failed to refresh current user profile:', e);
        }

        // Logged-in members get cross-device playback sync. Visitors rely on
        // localStorage and therefore cost zero D1 reads for playback history.
        try {
          const histRes = await fetch(`/api/playback/history/${encodeURIComponent(currentUser.email)}`);
          if (histRes.ok) {
            const histData = await histRes.json();
            if (histData && typeof histData === 'object') {
              setPlaybackMemories(prev => ({ ...prev, ...histData }));
            }
          }
        } catch (e) {
          console.warn('Failed to load playback memories:', e);
        }
      }
    }, 0);

    return () => window.clearTimeout(backgroundTimer);
  }, []);

  // Load large users/comments datasets only for screens that use them.
  useEffect(() => {
    const needsCommunityData =
      currentTab === 'stats' ||
      isAdminOpen ||
      isProfileOpen ||
      isStickersOpen ||
      Boolean(commentPreviewTrack) ||
      Boolean(selectedDetailTrack);

    if (!needsCommunityData) return;
    void fetchAllUsers();
    if (
      currentTab === 'stats' ||
      isProfileOpen ||
      Boolean(commentPreviewTrack)
    ) {
      void fetchAllComments();
    }
  }, [currentTab, isAdminOpen, isProfileOpen, isStickersOpen, commentPreviewTrack, selectedDetailTrack]);

  useEffect(() => {
    if (!isLoading) {
      writeHomeCache(
        tracks,
        categoryOptions,
        homeCacheValidatedAtRef.current || readHomeCache()?.savedAt || Date.now()
      );
    }
  }, [tracks, categoryOptions, isLoading]);

  useEffect(() => {
    const trackId = (selectedDetailTrack || currentTrack)?.id;
    setComments([]);
    setCommentsTrackId(null);
    if (!trackId) return;
    const controller = new AbortController();
    apiJson(`/api/tracks/${encodeURIComponent(trackId)}/comments`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) { setComments(Array.isArray(data) ? data : []); setCommentsTrackId(trackId); } })
      .catch(error => { if (!controller.signal.aborted) { console.error('Failed to load comments:', error); setCommentsTrackId(trackId); } });
    return () => controller.abort();
  }, [selectedDetailTrack?.id || currentTrack?.id]);

  // Requirement 10, 11, 12: 權限判定 (超級管理員全通、管理員鑽石級權限、未審核通過前僅能看公開)
  const checkCanAccess = (track: Track): boolean => {
    if (isSuperAdmin) {
      return true;
    }
    const req = track.requiredRank || '無';
    if (req === '無' || req === '公開') return true;
    if (!currentUser) return false;

    // Requirement 11: 管理員具備「鑽石」瀏覽權限
    if (isAdministrator) {
      return true;
    }

    // Requirement 12: 必須通過「超級管理員或管理員」審核通過獎銜，才會正式生效。
    // 在「獎銜」尚未被審核之前，一律只能瀏覽「公開」的音檔。
    if (!currentUser.rankApproved) {
      return false;
    }

    const effectiveRank = currentUser.approvedRank || currentUser.rank || '無';
    const ranks = RANK_ORDER as readonly string[];
    const reqIdx = ranks.indexOf(req);
    let userIdx = ranks.indexOf(effectiveRank);

    if (effectiveRank.includes('鑽石') || effectiveRank.includes('皇冠') || effectiveRank.includes('大使')) {
      userIdx = 999;
    }
    if (userIdx === -1) return false;
    return userIdx >= reqIdx;
  };



  const isTrackStickerUnlocked = (track: Track) => {
    const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
    if (cost <= 0 || isSuperAdmin) return true;
    return Boolean(currentUser && stickerSummary?.unlockedTrackIds?.includes(track.id));
  };

  const ensureStickerUnlock = async (track: Track, anchor?: HTMLElement | null) => {
    const cost = Math.max(0, Number(track.stickerUnlockCost || 0));
    if (cost <= 0 || isTrackStickerUnlocked(track)) return true;
    if (!currentUser) {
      showPermissionAlert(`此錄音需要貼紙${cost}張解鎖；貼紙為會員專屬，請先登入。`, anchor);
      return false;
    }
    if (stickerSpendResolver.current) return false;
    const confirmed = await new Promise<boolean>(resolve => { stickerSpendResolver.current=resolve; setStickerSpend({title:track.title,cost}); });
    if (!confirmed) return false;
    try {
      await apiJson(`/api/stickers/unlock/${encodeURIComponent(track.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vipPassword: vipPasswordForTrack(track.id) })
      });
      await refreshStickerSummary();
      return true;
    } catch (error) {
      showPermissionAlert(error instanceof Error ? error.message : '貼紙解鎖失敗', anchor);
      return false;
    }
  };

  // 2. Play / Select Track with Memory Resume & Fullscreen Loading
  const handlePlayTrack = async (track: Track, targetMode?: PlayerDisplayMode, permissionAnchor?: HTMLElement | null, sharedDetail = false) => {
    if (!currentUser && !canGuestPlayPublicShare(track, true, true) && sharedDetail) {
      showPermissionAlert('請先登入會員，再依音檔權限與貼紙條件播放。', permissionAnchor);
      return;
    }
    // Requirement 11 (v2.7): 私秘VIP音檔播放守護
    if (track.isPrivateVip && !isTrackVipUnlocked(track)) {
      showPermissionAlert('此錄音檔為【私密VIP】專屬內容，請向上傳者取得專屬授權連結後再播放。', permissionAnchor);
      return;
    }

    if (!checkCanAccess(track)) {
      showPermissionAlert(
        `此錄音檔權限為【${track.requiredRank === '無' ? '公開' : track.requiredRank} 級別以上】。請先登入綁定 Google 帳號或向管理員提升職級！`,
        permissionAnchor
      );
      return;
    }

    if (!canGuestPlayPublicShare(track, !currentUser, sharedDetail) && !await ensureStickerUnlock(track, permissionAnchor)) return;

    // Preserve user preferred player mode (Requirement 14)
    const effectiveMode = targetMode || (playerMode === 'expanded' ? savedPreferredMode : playerMode);

    if (effectiveMode === 'expanded') openTrackDetail(track);

    if (currentTrack?.id === track.id) {
      setPlayerMode(effectiveMode);
      return;
    }

    if (currentTrack && currentTrack.id !== track.id) {
      syncPlaybackToCloud(true);
    }

    setCurrentTrack(track);
    setPlayerMode(effectiveMode);

    // Requirement 3: 立即更新點擊播放次數並回傳後端記錄
    setTracks(prev =>
      prev.map(t => (t.id === track.id ? { ...t, playCount: (t.playCount || 0) + 1 } : t))
    );
    fetch(`/api/tracks/${track.id}/play`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userIdOrDeviceId: currentUser?.email || null
      })
    }).catch(() => {});

    // Real offline storage stays enabled. Ask the browser for persistent storage
    // when possible, then schedule the full-file Cache Storage write in background.
    void requestPersistentOfflineStorage();
    recordOfflineTrack(track.id, track.audioUrl);

    // Only a genuinely slow initial source load may show the blocking overlay.
    // Seek-time buffering after playback has started stays non-blocking.
    beginInitialAudioLoad();

    const saved = getStoredPlayback(track.id);
    const resumeTime = saved && !saved.completed ? saved.currentTime : 0;

    if (audioRef.current) {
      const cachedUrl = !navigator.onLine ? await getOfflineAudioUrl(track.audioUrl) : null;
      if (audioRef.current.src.startsWith('blob:')) URL.revokeObjectURL(audioRef.current.src);
      audioRef.current.src = cachedUrl || track.audioUrl;
      audioRef.current.currentTime = resumeTime;
      audioRef.current.playbackRate = playbackRate;
      audioRef.current
        .play()
        .then(() => {
          setIsPlaying(true);
          finishInitialAudioLoad();
        })
        .catch(() => {
          setIsPlaying(true);
          finishInitialAudioLoad();
        });
    }
  };

  const syncPlaybackToCloud = async (force = false) => {
    // Visitors already have instant localStorage progress; only logged-in members
    // need D1 for cross-device resume. This avoids needless writes for anonymous use.
    if (!currentUser?.email || !currentTrack || !audioRef.current) return;

    const cur = audioRef.current.currentTime || 0;
    const dur = audioRef.current.duration || currentTrack.durationSeconds || 0;
    if (!dur || !Number.isFinite(dur)) return;

    const wholeSecond = Math.floor(cur);
    const lastSync = lastPlaybackSyncRef.current;
    const sameTrack = lastSync.trackId === currentTrack.id;
    const secondsSinceLast = sameTrack ? wholeSecond - lastSync.second : Number.POSITIVE_INFINITY;

    const completed = cur / dur >= 0.95;
    const newlyCompleted = completed && (!sameTrack || !lastSync.completed);
    if (!force && !newlyCompleted) {
      if (wholeSecond < 1) return;
      if (sameTrack && secondsSinceLast < 60) return;
    } else if (!newlyCompleted && sameTrack && Math.abs(secondsSinceLast) < 10) {
      return;
    }

    lastPlaybackSyncRef.current = { trackId: currentTrack.id, second: wholeSecond, completed };
    await fetch('/api/playback/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: force,
      body: JSON.stringify({
        trackId: currentTrack.id,
        userIdOrDeviceId: currentUser.email,
        currentTime: cur,
        duration: dur,
        vipPassword: vipPasswordForTrack(currentTrack.id)
      })
    }).then(response => { if (!response.ok) throw new Error('進度同步失敗'); if (completed) window.dispatchEvent(new CustomEvent('echostars:sticker-changed')); }).catch(() => { lastPlaybackSyncRef.current = {trackId:'',second:-1}; });
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current || !currentTrack) return;
    const realDuration = audioRef.current.duration;
    if (!Number.isFinite(realDuration) || realDuration <= 0) return;

    const seconds = Math.round(realDuration);
    const label = `約 ${Math.max(1, Math.round(seconds / 60))} 分鐘`;
    setDuration(realDuration);

    if (
      Math.abs((currentTrack.durationSeconds || 0) - seconds) > 5 ||
      currentTrack.duration === '約 10 分鐘'
    ) {
      updateTrackCopies(currentTrack.id, t => ({
        ...t,
        durationSeconds: seconds,
        duration: label
      }));

      // Persist duration repair only for the super admin. New uploads already
      // store the correct value locally before reaching Cloudflare.
      if (isSuperAdmin) {
        fetch(`/api/tracks/${encodeURIComponent(currentTrack.id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            durationSeconds: seconds,
            duration: label,
            userEmail: currentUser?.email
          })
        }).catch(() => {});
      }
    }
  };

  // Toggle Play / Pause
  const handleTogglePlay = async () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      syncPlaybackToCloud(true);
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      if (currentTrack && (!checkCanAccess(currentTrack) || !isTrackVipUnlocked(currentTrack) || !await ensureStickerUnlock(currentTrack))) return;
      audioRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(true));
    }
  };

  // Seek
  const handleSeek = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      setCurrentTime(seconds);
    }
  };

  // Seek on audio card in list view (Requirement 25)
  const handleSeekCard = (track: Track, seconds: number) => {
    if (currentTrack?.id === track.id) {
      handleSeek(seconds);
    } else {
      const safeDuration = track.durationSeconds || 600;
      saveStoredPlayback(track.id, seconds, safeDuration);
      setPlaybackMemories(prev => ({
        ...prev,
        [track.id]: {
          currentTime: seconds,
          duration: safeDuration,
          completed: seconds >= safeDuration * 0.95,
          listenedOver2Min: seconds >= 120,
          percentage: Math.min(100, Math.round((seconds / safeDuration) * 100))
        }
      }));
    }
  };

  // Skip (-30, -10, +10, +30)
  const handleSkip = (seconds: number) => {
    if (audioRef.current) {
      const safeDuration = duration > 0 ? duration : (currentTrack?.durationSeconds || 600);
      const nextTime = Math.max(0, Math.min(safeDuration, audioRef.current.currentTime + seconds));
      audioRef.current.currentTime = nextTime;
      setCurrentTime(nextTime);
    }
  };

  // Change Playback Speed
  const handleChangeSpeed = (speed: number) => {
    setPlaybackRate(speed);
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  };

  // Audio Time Update Listener & Offline progress management
  const handleTimeUpdate = () => {
    if (!audioRef.current || !currentTrack) return;
    const cur = audioRef.current.currentTime;
    const dur = audioRef.current.duration || currentTrack.durationSeconds || 600;
    setCurrentTime(cur);
    setDuration(dur);

    // Save memory to LocalStorage & local state
    saveStoredPlayback(currentTrack.id, cur, dur);
    const mem = getStoredPlayback(currentTrack.id);
    if (mem) {
      setPlaybackMemories(prev => ({ ...prev, [currentTrack.id]: mem }));
    }

    // Offline space management: auto purge if >95% completed
    handleTrackProgressOffline(currentTrack.id, cur, dur);

    // Cloud sync is intentionally low-frequency to preserve the D1 free tier.
    // Local progress remains instant on every timeupdate.
    syncPlaybackToCloud(false);
  };

  const pendingInteractions = useRef(new Set<string>());
  const updateTrackCopies = (trackId: string, change: (track: Track) => Track) => {
    locallyChangedTrackIds.current.add(trackId);
    setTracks(prev => prev.map(t => t.id === trackId ? change(t) : t));
    setCurrentTrack(prev => prev?.id === trackId ? change(prev) : prev);
    setSelectedDetailTrack(prev => prev?.id === trackId ? change(prev) : prev);
    setCommentPreviewTrack(prev => prev?.id === trackId ? change(prev) : prev);
  };

  // One-time v3.3 repair for legacy tracks that were all stored as 10 minutes.
  // Runs only for the super admin, sequentially and after home data exists.
  useEffect(() => {
    if (!isSuperAdmin || durationRepairStartedRef.current || tracks.length === 0) return;

    const candidates = tracks.filter(t =>
      Boolean(t.audioUrl) &&
      ((Number(t.durationSeconds) === 600) || t.duration === '約 10 分鐘')
    );
    if (candidates.length === 0) return;

    durationRepairStartedRef.current = true;
    let cancelled = false;

    const readRemoteDuration = (url: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const probe = document.createElement('audio');
        const timer = window.setTimeout(() => {
          probe.removeAttribute('src');
          reject(new Error('duration metadata timeout'));
        }, 12000);
        probe.preload = 'metadata';
        probe.onloadedmetadata = () => {
          window.clearTimeout(timer);
          const seconds = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0;
          probe.removeAttribute('src');
          seconds > 0 ? resolve(seconds) : reject(new Error('invalid duration'));
        };
        probe.onerror = () => {
          window.clearTimeout(timer);
          probe.removeAttribute('src');
          reject(new Error('duration metadata failed'));
        };
        probe.src = url;
      });

    void (async () => {
      for (const track of candidates) {
        if (cancelled) break;
        try {
          const seconds = await readRemoteDuration(track.audioUrl);
          if (cancelled) break;
          const label = `約 ${Math.max(1, Math.round(seconds / 60))} 分鐘`;

          const res = await fetch(`/api/tracks/${encodeURIComponent(track.id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              durationSeconds: seconds,
              duration: label,
              userEmail: currentUser?.email
            })
          });
          if (res.ok) {
            updateTrackCopies(track.id, t => ({
              ...t,
              durationSeconds: seconds,
              duration: label
            }));
          }
        } catch {
          // A single unsupported/corrupt audio file must not stop the repair queue.
        }
        await new Promise(resolve => window.setTimeout(resolve, 150));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSuperAdmin, tracks.length]);

  const handleTrackInteraction = async (trackId: string, action: 'like' | 'rate', score?: number) => {
    // Rating is intentionally 1~5 only. Zero used to mean "cancel", which could
    // drop a single-rating track to 0.0; ignore invalid/legacy zero submissions.
    if (action === 'rate' && (!Number.isInteger(score) || (score as number) < 1 || (score as number) > 5)) return;
    const pendingKey = trackId;
    if (pendingInteractions.current.has(pendingKey)) return;
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    const keys = identityKeys(currentUser, visitor.deviceId);
    const identifier = keys[0];
    const snapshot = { likes: track.likes, likedBy: track.likedBy, rating: track.rating, ratingCount: track.ratingCount, ratings: track.ratings };
    const ratings = { ...(track.ratings || {}) };
    const hasLiked = !keys.some(k => (track.likedBy || []).includes(k));
    const likedBy = (track.likedBy || []).filter(k => !keys.includes(k));
    if (hasLiked) likedBy.push(identifier);
    keys.forEach(k => delete ratings[k]);
    if (score) ratings[identifier] = score;
    const scores = Object.values(ratings)
      .map(value => Number(value))
      .filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
    const optimistic = action === 'like'
      ? { likedBy, likes: Math.max(0, (track.likes || 0) + (hasLiked ? 1 : -1)) }
      : { ratings, ratingCount: scores.length, rating: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 10) / 10 : track.rating };
    pendingInteractions.current.add(pendingKey);
    updateTrackCopies(trackId, t => ({ ...t, ...optimistic }));
    try {
      const data = await apiJson(`/api/tracks/${encodeURIComponent(trackId)}/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, score, userId: currentUser?.id, userEmail: currentUser?.email, deviceId: visitor.deviceId, vipPassword: vipPasswordForTrack(trackId) })
      });
      const confirmed = action === 'like'
        ? { likes: data.likes, likedBy: data.likedBy || (data.hasLiked ?? data.liked ? likedBy : likedBy.filter(k => k !== identifier)) }
        : { rating: data.rating, ratingCount: data.ratingCount, ratings: data.ratings || ratings };
      updateTrackCopies(trackId, t => ({ ...t, ...confirmed }));
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
    } catch (error) {
      updateTrackCopies(trackId, t => ({ ...t, ...snapshot }));
      alert(error instanceof Error ? error.message : '操作失敗，請再試一次。');
    } finally {
      pendingInteractions.current.delete(pendingKey);
    }
  };
  const handleRateTrack = async (trackId: string, score: number) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    if (track.isPrivateVip && !isTrackVipUnlocked(track)) {
      showPermissionAlert('此錄音檔為【私密VIP】專屬內容，未解鎖前無法評價。');
      return;
    }
    if (!checkCanAccess(track)) {
      showPermissionAlert(
        `此錄音檔權限為【${track.requiredRank === '無' ? '公開' : track.requiredRank} 級別以上】。沒有閱讀權限時無法評價。`
      );
      return;
    }
    if (!await ensureStickerUnlock(track)) return;
    await handleTrackInteraction(trackId, 'rate', score);
  };
  const handleToggleLike = async (trackId: string) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;
    if (track.isPrivateVip && !isTrackVipUnlocked(track)) {
      showPermissionAlert('此錄音檔為【私密VIP】專屬內容，未解鎖前無法按讚。');
      return;
    }
    if (!checkCanAccess(track)) {
      showPermissionAlert('目前會員獎銜未達此錄音的互動權限。');
      return;
    }
    if (!await ensureStickerUnlock(track)) return;
    await handleTrackInteraction(trackId, 'like');
  };

  // Add Comment (Requirement 3 & 6: 支持最大化視窗與通知頁直接快速回覆留言)
  const handleAddComment = async (content: string, replyToId?: string, replyToAuthor?: string, trackIdOverride?: string, qaMode?: 'current' | 'all' | 'off') => {
    const targetTrackId = trackIdOverride || (selectedDetailTrack || currentTrack)?.id;
    if (!targetTrackId) return;
    if (currentTrack?.id === targetTrackId) await syncPlaybackToCloud(true);

    const authorBadge = isSuperAdmin
      ? '超級管理員'
      : isAdministrator
      ? '管理員'
      : currentUser?.isContributor
      ? '貢獻者'
      : effectiveMemberRank(currentUser, '訪客稱號');

    const payload = {
      authorName: currentUser ? currentUser.name : visitor.fullName,
      authorAvatar: currentUser ? (currentUser.avatar || '👤') : visitor.emoji,
      authorBadge,
      authorEmail: currentUser?.email,
      deviceId: visitor.deviceId,
      isAdmin: isSuperAdmin,
      content,
      replyToId,
      replyToAuthor,
      vipPassword: vipPasswordForTrack(targetTrackId),
      qaMode: qaMode && qaMode !== 'off' ? qaMode : undefined
    };

    const res = await fetch(`/api/tracks/${targetTrackId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || '心得發送失敗');
    }

    const commentData = await res.json();
    const newComment = commentData.comment || commentData;
    window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
    if (activeCommentsTrackIdRef.current === targetTrackId) setComments(prev => [newComment, ...prev]);
    setAllComments(prev => [newComment, ...prev]);
    // Background reply may finish after the original comment POST.
    // Refresh only this active discussion twice, not the whole comment database.
    if (qaMode && qaMode !== 'off') {
      for (const wait of [6500, 16000]) {
        window.setTimeout(() => {
          if (activeCommentsTrackIdRef.current !== targetTrackId) return;
          void apiJson('/api/tracks/' + encodeURIComponent(targetTrackId) + '/comments')
            .then(list => { if (Array.isArray(list)) setComments(list); }).catch(() => {});
        }, wait);
      }
    }

    setTracks(prev =>
      prev.map(t =>
        t.id === targetTrackId ? { ...t, commentsCount: (t.commentsCount || 0) + 1 } : t
      )
    );
    if (selectedDetailTrack && selectedDetailTrack.id === targetTrackId) {
      setSelectedDetailTrack(prev => prev ? { ...prev, commentsCount: (prev.commentsCount || 0) + 1 } : null);
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string, explicitTrackId?: string) => {
    const targetTrack =
      (explicitTrackId ? tracks.find(track => track.id === explicitTrackId) : null) ||
      selectedDetailTrack ||
      currentTrack;
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser?.id,
        userEmail: currentUser?.email,
        deviceId: visitor.deviceId
      })
    });
    if (!res.ok) throw new Error('您沒有刪除此心得的權限，或連線暫時失敗。');
    if (res.ok) {
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
      setComments(prev => prev.filter(c => c.id !== commentId));
      setAllComments(prev => prev.filter(c => c.id !== commentId));
      if (targetTrack) {
        setTracks(prev =>
          prev.map(t =>
            t.id === targetTrack.id
              ? { ...t, commentsCount: Math.max(0, (t.commentsCount || 1) - 1) }
              : t
          )
        );
        if (selectedDetailTrack && selectedDetailTrack.id === targetTrack.id) {
          setSelectedDetailTrack(prev => prev ? { ...prev, commentsCount: Math.max(0, (prev.commentsCount || 1) - 1) } : null);
        }
      }
    }
  };

  // Edit Comment
  const handleEditComment = async (commentId: string, newContent: string) => {
    const res = await fetch(`/api/comments/${commentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent, userEmail: currentUser?.email, deviceId: visitor.deviceId })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '心得修改失敗');
    }
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent } : c));
    setAllComments(prev => prev.map(c => c.id === commentId ? { ...c, content: newContent } : c));
  };

  // Requirement 2: 在「最大化視窗」直接修改音檔資訊、備註與相關學習連結
  // persist=false is used when a specialized endpoint (e.g. keyword API) has
  // already saved the change and we only need to synchronize React state.
  const handleUpdateTrack = async (
    trackId: string,
    updates: Partial<Track>,
    options?: { persist?: boolean }
  ) => {
    if (options?.persist === false) {
      updateTrackCopies(trackId, track => ({ ...track, ...updates }));
      return;
    }
    const payload = await apiJson(`/api/tracks/${encodeURIComponent(trackId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updates, userEmail: currentUser?.email })
    });
    const saved = payload.track || payload;
    if (saved.id !== trackId) throw new Error('伺服器未回傳已儲存的音檔，請重試。');
    updateTrackCopies(trackId, track => ({ ...track, ...saved }));
  };

  // Requirement 11: 超級管理員指定或取消「管理員」身分
  const pendingMemberActions = useRef(new Set<string>());
  const updateMemberPermission = async (userId: string, action: 'admin-role'|'block'|'contributor') => {
    if (pendingMemberActions.current.has(userId)) return;
    const user=allUsers.find(u=>u.id===userId);
    if(!user)return;
    pendingMemberActions.current.add(userId);
    try {
      const updated=await apiJson<UserProfile>(`/api/users/${encodeURIComponent(userId)}/${action}`,{
        method:'PUT',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({actorEmail:currentUser?.email,isAdminUser:!user.isAdminUser,isContributor:!user.isContributor,isBlocked:!user.isBlocked})
      });
      setAllUsers(prev=>prev.map(u=>u.id===userId?updated:u));
      if(currentUser?.id===userId){const retained = mergeMemberSession(currentUser, updated);setCurrentUser(retained);localStorage.setItem('sq_current_user_v1',JSON.stringify(retained));}
    } catch(error) { alert(error instanceof Error?error.message:'儲存失敗，請重試'); }
    finally {pendingMemberActions.current.delete(userId);}
  };
  const handleToggleAdminUser = (id: string) => updateMemberPermission(id,'admin-role');

  // Requirement 9, 11, 12, 3: 審核或修改獎銜 (獎銜審核員 / 超級管理員)
  const handleApproveRank = async (userId: string, rank?: AmwayRank) => {
    const auditorName = isSuperAdmin ? '超級管理員 (杜杜龍)' : (currentUser?.name ? `獎銜審核員 (${currentUser.name})` : '獎銜審核員審核');
    try {
      const res = await fetch(`/api/users/${userId}/audit-rank`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: rank ? 'modify_and_approve' : 'approve',
          rank,
          auditedBy: auditorName,
          auditorEmail: currentUser?.email
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '審核儲存失敗');
      }
      if (res.ok) {
        const updated = await res.json();
        setAllUsers(prev => prev.map(u => (u.id === userId ? updated : u)));
        if (currentUser?.id === userId) {
          const retained = mergeMemberSession(currentUser, updated);
          setCurrentUser(retained);
          localStorage.setItem('sq_current_user_v1', JSON.stringify(retained));
        }
      }
    } catch (e) {
      throw e;
    }
  };

  const handleLoginWithGoogle = async (email?: string, name?: string, avatarUrl?: string) => {
    if (!email) throw new Error('無法取得 Google 帳戶，請重新登入。');
    const cleanEmail = email.toLowerCase().trim();
    const data = await apiJson('/api/users/google-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, name, avatar: avatarUrl })
    });
    if (!data.user?.id) throw new Error('無法取得已保存的會員資料。');
    const profile: UserProfile = data.user;
    setCurrentUser(profile);
    localStorage.setItem('sq_current_user_v1', JSON.stringify(profile));
    setAllUsers(prev => [...prev.filter(u => u.email?.toLowerCase().trim() !== cleanEmail && u.id !== profile.id), profile]);

    // Load permanent playback memories from Cloudflare D1
    try {
      const histRes = await fetch(`/api/playback/history/${encodeURIComponent(cleanEmail)}`);
      if (histRes.ok) {
        const histData = await histRes.json();
        if (histData && typeof histData === 'object') {
          setPlaybackMemories(prev => ({ ...prev, ...histData }));
        }
      }
    } catch (e) {
      console.warn('Sync playback memories error:', e);
    }

    setIsProfileOpen(Boolean(data.isNewUser));
  };

  const handleLogout = () => {
    setAllUsers([]);
    hasFetchedAllUsersRef.current = false;
    setCurrentUser(null);
    setStickerSummary(null);
    localStorage.removeItem('sq_current_user_v1');
    setIsProfileOpen(false);
    setIsStickersOpen(false);
  };

  // Requirement 12: 會員初次設定或修改獎銜，自動標記待審核
  const handleUpdateProfile = async (updatedProfile: Partial<UserProfile>) => {
    if (!currentUser) return;

    const requestedDealerId=String(updatedProfile.amwayId ?? currentUser.amwayId ?? '').trim();
    const currentDealerId=String(currentUser.amwayId || '').trim();
    if(requestedDealerId && requestedDealerId !== currentDealerId){
      const candidateResponse=await fetch(`/api/organization/couple-candidate?dealerId=${encodeURIComponent(requestedDealerId)}`);
      const candidateData=await candidateResponse.json().catch(()=>({}));
      if(!candidateResponse.ok) throw new Error(candidateData.error || '無法確認直銷商編號');
      if(candidateData.candidate && !candidateData.linked){
        const partnerName=String(candidateData.candidate.name || '此會員');
        const accepted=window.confirm(`是否要綁定與${partnerName}為夫妻關係嗎？`);
        if(!accepted) throw new Error('此直銷商編號已由其他會員使用。若不是夫妻，請改成正確的直銷商編號後再儲存。');
        await apiJson('/api/organization/couple-bind',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({dealerId:requestedDealerId,partnerUserId:candidateData.candidate.id})});
      }
    }

    const isRankChanged = updatedProfile.rank && updatedProfile.rank !== currentUser.rank;
    const isOwner = isSuperAdminEmail(currentUser.email);

    let rankAuditFields: Partial<UserProfile> = {};
    if (isRankChanged && !isOwner) {
      rankAuditFields = {
        rankAuditStatus: 'pending',
        rankApproved: false,
        rankAuditType: currentUser.rank ? 'rank_change' : 'new_register',
        rankUpdatedAt: new Date().toISOString().replace('T', ' ').substring(0, 16)
      };
    }

    const updated: UserProfile = {
      ...currentUser,
      ...updatedProfile,
      ...rankAuditFields
    };
    if (isOwner) {
      updated.role = '超級管理員';
      updated.isAdminUser = true;
      updated.isContributor = true;
      updated.canUpload = true;
      updated.rankApproved = true;
      updated.rankAuditStatus = 'approved';
    }

    const saved = await apiJson(`/api/users/${encodeURIComponent(updated.id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...updatedProfile, ...rankAuditFields, email: updated.email })
    });
    const completion=saved.profileCompletion;
    if(completion){setFeedbackRules(completion.settings);if(!completion.complete)showStickerNotice(completion.settings.profileHintText.replaceAll('{x}',String(completion.settings.profileReward)),completion.settings.profileHintSeconds);}
    const {profileCompletion,...savedProfile}=saved.user || saved;
    Object.assign(updated, savedProfile);
    setCurrentUser(updated);
    localStorage.setItem('sq_current_user_v1', JSON.stringify(updated));
    setAllUsers(prev => prev.map(u => (u.id === updated.id || (u.email && u.email.toLowerCase().trim() === updated.email?.toLowerCase().trim()) ? updated : u)));

    // Requirement 2: 個人基本資料名稱修改後，留言板即時同步跟著改
    if (updated.name || updated.avatar) {
      setComments(prev => prev.map(c => {
        const matchEmail = updated.email && c.authorEmail && c.authorEmail.toLowerCase().trim() === updated.email.toLowerCase().trim();
        const matchAdmin = c.isAdmin && (isOwner || updated.role === '超級管理員');
        const matchOldName = currentUser.name && c.authorName === currentUser.name;
        if (matchEmail || matchAdmin || matchOldName) {
          return {
            ...c,
            authorName: updated.name || c.authorName,
            authorAvatar: updated.avatar || c.authorAvatar
          };
        }
        return c;
      }));
    }

  };

  const handleClearListeningHistory = async () => {
    if (!currentUser) return;
    const identifier = currentUser.email || currentUser.id;
    const res = await fetch(`/api/playback/history/${encodeURIComponent(identifier)}`, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || '清除學習紀錄失敗');
    }
    clearStoredPlayback();
    setPlaybackMemories({});
    setAllUsers(prev => prev.map(user =>
      user.id === currentUser.id || user.email === currentUser.email
        ? { ...user, playCount: 0 }
        : user
    ));
    setCurrentUser(prev => prev ? { ...prev, playCount: 0 } : prev);
    lastPlaybackSyncRef.current = { trackId: '', second: -1 };
    if (audioRef.current && currentTrack) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
    }
  };

  // Admin Actions
  const handleToggleBlockUser = (id: string) => updateMemberPermission(id,'block');
  const handleToggleContributor = (id: string) => updateMemberPermission(id,'contributor');

  const handleAdminUpdateUser = async (userId: string, profileData: Partial<UserProfile>) => {
    const data = await apiJson(`/api/users/${encodeURIComponent(userId)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profileData)
    });
    const updated = data.user || data;
    setAllUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updated } : u));
    if (currentUser?.id === userId) {
      const next = { ...currentUser, ...updated };
      setCurrentUser(next);
      localStorage.setItem('sq_current_user_v1', JSON.stringify(next));
    }
  };

  // Requirement 24: Batch Update Users
  const handleBatchUpdateUsers = async (userIds: string[], updates: Partial<UserProfile>) => {
    const data = await apiJson('/api/admin/users/batch', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds, updates, actorEmail: currentUser?.email })
    });
    const savedUsers: UserProfile[] = data.users;
    if (!Array.isArray(savedUsers)) throw new Error('未收到已儲存的會員資料');
    setAllUsers(prev => prev.map(u => savedUsers.find(saved => saved.id === u.id) || u));
    const savedCurrent = savedUsers.find(u => u.id === currentUser?.id);
    if (savedCurrent) {
      setCurrentUser(savedCurrent);
      localStorage.setItem('sq_current_user_v1', JSON.stringify(savedCurrent));
    }
  };

  const handleDeleteTrack = async (trackId: string) => {
    const userEmail = currentUser?.email || (isAdmin ? 'yukidu@gmail.com' : '');
    await apiJson(`/api/tracks/${encodeURIComponent(trackId)}?userEmail=${encodeURIComponent(userEmail)}`, { method: 'DELETE' });
    locallyChangedTrackIds.current.add(trackId);
    setTracks(prev => prev.filter(t => t.id !== trackId));
    setSelectedDetailTrack(prev => prev?.id === trackId ? null : prev);
    setCommentPreviewTrack(prev => prev?.id === trackId ? null : prev);
    if (currentTrack?.id === trackId) {
      audioRef.current?.pause();
      setCurrentTrack(null);
      setIsPlaying(false);
    }
  };

  const getUploadTimestamp = (value?: string | null) => {
    const raw = String(value || '').trim();
    if (!raw) return 0;
    const normalized = raw.replace(/[.]/g, '/').replace(/-/g, '/');
    const parts = normalized.match(/\d+/g)?.map(Number) || [];
    if (parts.length >= 3) {
      const [year, month, day, hour = 0, minute = 0, second = 0] = parts;
      const ts = new Date(year, Math.max(0, month - 1), day, hour, minute, second).getTime();
      if (Number.isFinite(ts)) return ts;
    }
    const parsed = Date.parse(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getUploadSequence = (track: Track) => {
    const match = String(track.audioUrl || '').match(/ES(\d{4,})/i);
    return match ? Number(match[1]) || 0 : 0;
  };

  const getRequiredRankSortIndex = (track: Track) => {
    if (track.isPrivateVip) return RANK_ORDER.length + 1;
    const required = String(track.requiredRank || '無').trim();
    if (!required || required === '無' || required === '公開') return 0;
    const index = (RANK_ORDER as readonly string[]).indexOf(required);
    return index >= 0 ? index : 0;
  };

  // Requirement 19: 時間排序固定以「音檔上傳時間」為準。
  const handleSortClick = (field: SortField) => {
    resetLuckyDrawState();
    setUseDefaultHomeOrder(false);
    if (field === '貼紙') {setSortField(field);setSortDirection(sortField==='貼紙' && sortDirection==='asc'?'desc':'asc');return;}
    if (sortField === field) {
      setSortDirection(prev => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      setSortDirection(field === '演講人' ? 'asc' : 'desc');
    }
  };

  // Dynamic keyword result counts: selected keywords are AND conditions.
  // For an unselected keyword, show how many tracks would remain if the user adds it.
  // For a selected keyword, show the current intersection result count.
  const keywordMatchCounts = useMemo(() => {
    const baseTracks = (Array.isArray(tracks) ? tracks : []).filter(track =>
      (!selectedBadgeSpeakerRank || normalizeSpeakerRankForBadge(track.speakerRank || '') === selectedBadgeSpeakerRank) &&
      trackMatchesHomeBaseFilters(track, selectedCategory, selectedSpeakerRank, searchQuery)
    );

    return allAvailableKeywords.reduce<Record<string, number>>((counts, keyword) => {
      const activeKeywords = selectedKeywords.includes(keyword)
        ? selectedKeywords
        : [...selectedKeywords, keyword];
      counts[keyword] = baseTracks.filter(track =>
        activeKeywords.every(activeKeyword => trackMatchesHomeKeyword(track, activeKeyword))
      ).length;
      return counts;
    }, {});
  }, [tracks, allAvailableKeywords, selectedCategory, selectedSpeakerRank, selectedBadgeSpeakerRank, selectedKeywords, searchQuery]);

  // Hide zero-result keyword choices; keep selected chips removable.
  const visibleAvailableKeywords = useMemo(() => allAvailableKeywords.filter(keyword => (keywordMatchCounts[keyword] ?? 0) > 0), [allAvailableKeywords, keywordMatchCounts]);
  const visibleSearchSuggestionKeywords = useMemo(() => searchSuggestions.keywords.filter(keyword => (keywordMatchCounts[keyword] ?? 0) > 0), [searchSuggestions.keywords, keywordMatchCounts]);

  // Filtered & Sorted Tracks List. Entering home uses the personalized three-tier
  // default order; pressing a sort button switches to the requested manual sort.
  const filteredTracks = useMemo(() => {
    const trackList = Array.isArray(tracks) ? tracks : [];
    const filtered = trackList.filter(t => {
      if (!canAppearInHomeForViewer(t, Boolean(currentUser), checkCanAccess(t))) return false;
      if (!currentUser && !isVisibleOnGuestHome(t)) return false;
      if (selectedBadgeSpeakerRank && normalizeSpeakerRankForBadge(t.speakerRank || '') !== selectedBadgeSpeakerRank) return false;
      if (!trackMatchesHomeBaseFilters(t, selectedCategory, selectedSpeakerRank, searchQuery)) return false;
      if (selectedKeywords.length > 0 && !selectedKeywords.every(keyword => trackMatchesHomeKeyword(t, keyword))) return false;
      return true;
    });

    if (useDefaultHomeOrder) {
      return sortDefaultHomeTracks(filtered, {
        canAccess: checkCanAccess,
        getRequiredRankIndex: getRequiredRankSortIndex,
        getUploadTimestamp: track => getUploadTimestamp(track.uploadDate),
        getUploadSequence,
        shuffleSeed: homeShuffleSeed
      }).sort((a,b)=>Number(stickerSummary?.unlockedTrackIds.includes(b.id))-Number(stickerSummary?.unlockedTrackIds.includes(a.id)));
    }

    if(sortField==='貼紙')return sortStickerTracks(filtered,stickerSummary?.unlockedTrackIds || [],sortDirection==='asc'?'cost':'reward');
    return filtered.sort((a, b) => {
      const purchased=Number(stickerSummary?.unlockedTrackIds.includes(b.id))-Number(stickerSummary?.unlockedTrackIds.includes(a.id));
      if(purchased)return purchased;
      let diff = 0;
      switch (sortField) {
        case '時間': {
          diff = getUploadTimestamp(a.uploadDate) - getUploadTimestamp(b.uploadDate);
          if (diff === 0) diff = getUploadSequence(a) - getUploadSequence(b);
          break;
        }
        case '權限': {
          const permissionDiff = getRequiredRankSortIndex(a) - getRequiredRankSortIndex(b);
          if (permissionDiff !== 0) {
            return sortDirection === 'desc' ? -permissionDiff : permissionDiff;
          }
          let timeDiff = getUploadTimestamp(b.uploadDate) - getUploadTimestamp(a.uploadDate);
          if (timeDiff === 0) timeDiff = getUploadSequence(b) - getUploadSequence(a);
          return timeDiff;
        }
        case '評價': {
          diff = (a.rating || 0) - (b.rating || 0);
          break;
        }
        case '留言': {
          diff = (a.commentsCount || 0) - (b.commentsCount || 0);
          break;
        }
        case '按讚': {
          diff = (a.likes || 0) - (b.likes || 0);
          break;
        }
        case '演講人': {
          diff = (a.speaker || '').localeCompare(b.speaker || '', 'zh-Hant');
          break;
        }
        default:
          diff = 0;
      }
      return sortDirection === 'desc' ? -diff : diff;
    });
  }, [
    tracks,
    selectedCategory,
    selectedSpeakerRank,
    selectedBadgeSpeakerRank,
    selectedKeywords,
    searchQuery,
    sortField,
    sortDirection,
    useDefaultHomeOrder,
    homeShuffleSeed,
    currentUser,
    isSuperAdmin,
    isAdministrator,
    stickerSummary
  ]);

  useEffect(() => {
    resetLuckyDrawState();
  }, [
    selectedCategory,
    selectedSpeakerRank,
    selectedBadgeSpeakerRank,
    selectedKeywords,
    searchQuery,
    sortField,
    sortDirection,
    useDefaultHomeOrder,
    homeShuffleSeed,
    resetLuckyDrawState
  ]);

  const displayedTracks = useMemo(() => {
    if (!luckyOrderIds) return filteredTracks;
    const byId = new Map(filteredTracks.map(track => [track.id, track]));
    const ordered = luckyOrderIds.map(id => byId.get(id)).filter((track): track is Track => Boolean(track));
    const included = new Set(ordered.map(track => track.id));
    return [...ordered, ...filteredTracks.filter(track => !included.has(track.id))];
  }, [filteredTracks, luckyOrderIds]);

  const getLuckyAudioContext = () => {
    if (typeof window === 'undefined') return null;
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    if (!Context) return null;
    if (!luckyAudioContextRef.current || luckyAudioContextRef.current.state === 'closed') {
      luckyAudioContextRef.current = new Context();
    }
    const context = luckyAudioContextRef.current;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    return context;
  };

  const playLuckyTone = (frequency: number, durationSeconds: number, delaySeconds = 0, volume = 0.035) => {
    const context = getLuckyAudioContext();
    if (!context) return;
    try {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const startAt = context.currentTime + delaySeconds;
      oscillator.type = 'square';
      oscillator.frequency.setValueAtTime(frequency, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(volume, startAt + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + durationSeconds + 0.02);
    } catch {}
  };

  const playLuckyTick = (step: number) => {
    playLuckyTone(300 + (step % 7) * 34, 0.045, 0, 0.025);
  };

  const playLuckyWin = () => {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) =>
      playLuckyTone(frequency, 0.16, index * 0.085, 0.045)
    );
  };

  const handleLuckyDraw = (anchor: HTMLElement) => {
    if (luckyPhase === 'spin' || luckyRequestPending.current) return;
    setIsSearchFocused(false);
    setLuckyAnswerText(null);
    clearLuckyTimers();

    // Private VIP stays a separate third group and is never surfaced by random discovery.
    const candidates = filteredTracks.filter(track => !track.isPrivateVip && checkCanAccess(track) && isTrackStickerUnlocked(track));
    if (candidates.length === 0) {
      showPermissionAlert('目前條件下沒有可播放的音檔可以抽選。', anchor);
      return;
    }

    // v148: the visual reel has a hard, short budget. Sticker validation may finish
    // later, but network latency is never allowed to keep the phone animating/reordering.
    getLuckyAudioContext();
    const baseIds = filteredTracks.map(track => track.id);
    const winner = candidates[Math.floor(Math.random() * candidates.length)];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const visualSpinSteps = Math.max(10, Math.min(14, candidates.length * 2));
    const drawGeneration = ++luckyDrawGenerationRef.current;
    let spinStep = 0;
    let visualComplete = false;
    let settled = false;
    let approvalState: 'pending' | 'approved' | 'failed' = currentUser ? 'pending' : 'approved';
    let approvalError: unknown = null;
    let luckyNotice: any = { bonus: 0, settings: getFeedbackRules() };
    const isCurrentDraw = () => luckyDrawGenerationRef.current === drawGeneration;

    luckyRequestPending.current = true;
    setLuckyOrderIds(baseIds);
    setLuckyWinnerId(null);
    setLuckyPhase('spin');

    const fail = () => {
      if (settled || !isCurrentDraw()) return;
      settled = true;
      clearLuckyTimers();
      luckyRequestPending.current = false;
      setLuckyPhase('idle');
      setLuckyOrderIds(null);
      setLuckyWinnerId(null);
      setLuckyAnswerText(null);
      showPermissionAlert(approvalError instanceof Error ? approvalError.message : '貼紙不足或連線失敗，無法召喚繁星解答', anchor);
    };

    const finish = () => {
      if (settled || !isCurrentDraw()) return;
      settled = true;
      clearLuckyTimers();
      luckyRequestPending.current = false;
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));
      setLuckyWinnerId(winner.id);
      setLuckyPhase('win');
      if (luckyNotice) {
        setFeedbackRules(luckyNotice.settings);
        setLuckyAnswerText(luckyNotice.settings.luckyHintText.replaceAll('{x}', String(luckyNotice.bonus)));
      }
      playLuckyWin();
    };

    const completeVisualSpin = () => {
      if (visualComplete || settled || !isCurrentDraw()) return;
      visualComplete = true;
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, winner.id));
      setLuckyWinnerId(null);
      // Stop the reel immediately. If the server is still validating stickers,
      // keep the chosen card still instead of burning CPU/GPU with an endless reel.
      setLuckyPhase('idle');
      if (approvalState === 'approved') finish();
      else if (approvalState === 'failed') fail();
    };

    const approvalPromise = currentUser
      ? apiJson('/api/stickers/lucky-spend', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operationId: crypto.randomUUID(), trackId: winner.id })
        }).then(data => {
          if (!isCurrentDraw() || settled) return;
          luckyNotice = data;
          approvalState = 'approved';
          void refreshStickerSummary();
          if (visualComplete) finish();
        }).catch(error => {
          if (!isCurrentDraw() || settled) return;
          approvalError = error;
          approvalState = 'failed';
          if (visualComplete) fail();
        })
      : Promise.resolve().then(() => {
          if (!isCurrentDraw() || settled) return;
          approvalState = 'approved';
          if (visualComplete) finish();
        });

    const approvalTimeout = window.setTimeout(() => {
      if (!isCurrentDraw() || settled || approvalState !== 'pending') return;
      approvalError = new Error('連線時間過久，請再試一次。');
      approvalState = 'failed';
      if (visualComplete) fail();
    }, 20000);
    luckyTimersRef.current.push(approvalTimeout);

    if (reducedMotion || candidates.length === 1 || filteredTracks.length === 1) {
      completeVisualSpin();
      void approvalPromise;
      return;
    }

    const spin = () => {
      if (settled || !isCurrentDraw()) return;
      if (approvalState === 'failed') {
        fail();
        return;
      }
      if (spinStep >= visualSpinSteps) {
        completeVisualSpin();
        return;
      }

      const candidate = candidates[Math.floor(Math.random() * candidates.length)];
      setLuckyOrderIds(moveTrackIdToSecondSlot(baseIds, candidate.id));
      setLuckyWinnerId(null);
      setLuckyPhase('spin');
      if (spinStep % 2 === 0) playLuckyTick(spinStep);

      const progress = Math.min(1, spinStep / Math.max(1, visualSpinSteps - 1));
      const delay = Math.round(62 + progress * progress * 70);
      spinStep += 1;
      const timer = window.setTimeout(spin, delay);
      luckyTimersRef.current.push(timer);
    };

    spin();
    void approvalPromise;
  };

  // Rated tracks by current user for BW export
  const userRatedTracks = useMemo(() => {
    if (!currentUser) return [];
    return (tracks || [])
      .map(t => {
        const tRatings = t?.ratings || {};
        return {
          track: t,
          rating: tRatings[currentUser.email] || tRatings[currentUser.id] || 0
        };
      })
      .filter(x => x.rating > 0);
  }, [tracks, currentUser]);

  const currentIdentityKeys = identityKeys(currentUser, visitor.deviceId);
  const currentIdentifier = currentIdentityKeys[0];
  const currentRatings = currentTrack?.ratings || {};
  const currentTrackRating = (currentTrack && (
    currentRatings[currentIdentifier] ||
    (currentUser && (currentRatings[currentUser.email] || currentRatings[currentUser.id])) ||
    currentRatings[visitor.deviceId] ||
    (currentUser?.email === 'yukidu@gmail.com' ? currentRatings['u-admin'] : undefined)
  )) || 0;
  const hasLikedCurrent = Boolean(currentTrack?.likedBy && Array.isArray(currentTrack.likedBy) && currentTrack.likedBy.some(k => currentIdentityKeys.includes(k)));

  return (
    <div className="min-h-screen flex flex-col antialiased selection:bg-rose-200 selection:text-rose-900" translate="no">
      {/* Hidden Native Audio Element */}
      <audio
        ref={audioRef}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onEnded={() => {
          syncPlaybackToCloud(true);
          setIsPlaying(false);
        }}
        onWaiting={() => {
          // waiting fires frequently after timeline seeks. Once playback has already
          // started, keep the player visible instead of reopening a fullscreen modal.
          if (audioInitialLoadRef.current && audioLoadingTimerRef.current === null) {
            beginInitialAudioLoad();
          }
        }}
        onCanPlay={finishInitialAudioLoad}
        onPlaying={finishInitialAudioLoad}
        onError={() => {
          setIsPlaying(false);
          finishInitialAudioLoad();
        }}
      />

      {/* Requirement 26: 讀取中請稍候... 動態超巨大提示 */}
      {isLoadingAudio && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in">
          <div className="relative flex items-center justify-center mb-6">
            <div className="w-32 h-32 rounded-full border-4 border-rose-400/30 animate-ping absolute" />
            <div className="w-28 h-28 rounded-full border-4 border-t-rose-500 border-r-rose-400 border-b-transparent border-l-transparent animate-spin" />
            <Mic className="w-12 h-12 text-white absolute" />
          </div>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-widest animate-pulse">
            讀取中請稍候...
          </h2>
          <p className="text-sm text-rose-200 mt-2 font-medium text-center px-6">
            正在準備音訊播放<br />離線儲存會在背景自動完成
          </p>
        </div>
      )}

      <StickerFeedback />
      {/* Top Navbar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={tab => {
          setIsProfileOpen(false);
    setIsStickersOpen(false);
          setSelectedDetailTrack(null);
          if (playerMode==='expanded') setPlayerMode(savedPreferredMode);
          if (tab === 'home') {
            handleReturnToHomePlaylist();
          } else {
            setCurrentTab(tab);
            if (tab === 'stats') {
              setSelectedDetailTrack(null);
              if (playerMode === 'expanded') setPlayerMode(savedPreferredMode);
            } else if (tab === 'notifications') {
              setSelectedDetailTrack(null);
              if (playerMode === 'expanded') setPlayerMode(savedPreferredMode);
            } else if (tab === 'upload') {
              setIsUploadOpen(true);
            } else if (tab === 'admin') {
              setIsAdminOpen(true);
            } else if (tab === 'profile') {
              setIsProfileOpen(true);
            }
          }
        }}
        onLogoClick={handleReturnToHomePlaylist}
        isDark={isDark}
        onToggleTheme={handleToggleTheme}
        onRandomPalette={handleRandomPalette}
        currentUser={currentUser}
        visitor={visitor}
        isAdmin={isAdmin}
        canUpload={canUpload}
        pendingNotificationsCount={pendingNotificationsCount}
        pendingAuditCount={pendingAuditCount}
        stickerBalance={stickerSummary?.balance}
        onOpenStickers={() => {setIsProfileOpen(false);setIsStickersOpen(true);setSelectedDetailTrack(null);setCurrentTab('stickers');if(playerMode==='expanded')setPlayerMode(savedPreferredMode);window.scrollTo(0,0);}}
        onInstallGuide={() => {setIsProfileOpen(false);setIsStickersOpen(false);setSelectedDetailTrack(null);setCurrentTab('install');if(playerMode==='expanded')setPlayerMode(savedPreferredMode);window.scrollTo(0,0);}}
      />

      <TutorialSpotlight
        active={
          showHomeTutorial &&
          !isProfileOpen && !isStickersOpen &&
          currentTab === 'home' &&
          !selectedDetailTrack &&
          filteredTracks.length > 0
        }
        opacity={0.92}
        targets={[
          {
            key: 'logo',
            selector: '[data-tutorial-target="home-logo"]',
            text: '回首頁'
          },
          {
            key: 'visitor',
            selector: '[data-tutorial-target="visitor-profile"]',
            text: '註冊會員\n才有完整功能\n\n記憶播放進度\n生命靈數分析\n累積星幣點數\n收藏我的最愛\n超多有趣功能等你發現'
          },
          {
            key: 'photo',
            selector: '[data-tutorial-target="first-track-photo"]',
            text: '按照片\n播放/暫停'
          }
        ]}
        neverRemind={neverRemindHomeTutorial}
        onNeverRemindChange={handleHomeTutorialNeverRemind}
        onDismiss={() => setShowHomeTutorial(false)}
      />

      {/* Permission Alert Toast */}
      {permissionAlert && (
        <div
          className="fixed z-[120] max-w-sm w-[calc(100vw-16px)] animate-in fade-in zoom-in-95"
          style={permissionAlertPosition
            ? { left: permissionAlertPosition.left, top: permissionAlertPosition.top }
            : { left: '50%', top: 80, transform: 'translateX(-50%)' }}
        >
          <div className="bg-amber-50 dark:bg-amber-950 border border-amber-300 dark:border-amber-800 rounded-2xl p-4 shadow-xl flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs sm:text-sm text-amber-900 dark:text-amber-200">
              <p className="font-bold">權限不足提示</p>
              <p className="mt-0.5">{permissionAlert}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={() => {
                    setPermissionAlert(null); setPermissionAlertPosition(null);
                    setIsProfileOpen(true);
                  }}
                  className="px-3 py-1 rounded-lg bg-amber-600 text-white font-bold text-xs"
                >
                  前往登入
                </button>
                <button
                  onClick={() => { setPermissionAlert(null); setPermissionAlertPosition(null); }}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-xs"
                >
                  關閉
                </button>
              </div>
            </div>
            <button
              onClick={() => { setPermissionAlert(null); setPermissionAlertPosition(null); }}
              className="p-1 text-amber-700 hover:text-amber-900"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Container */}
      <main hidden={isUploadOpen} className={`flex-1 w-full mx-auto px-4 sm:px-6 py-5 pb-28 ${isAdminOpen ? 'max-w-6xl' : 'max-w-3xl'}`}>
        {/* Requirement 16 & 9: 優先切換排行榜與公開通知分頁 */}
        {isAdminOpen ? (<Suspense fallback={<div role="status" className="py-12 text-center text-slate-500">載入功能中…</div>}>
      <AdminModal
        presentation="page"
        onUplinesChanged={()=>{void fetchAllUsers(true);if(currentUser)void apiJson(`/api/users/profile?email=${encodeURIComponent(currentUser.email)}`).then(data=>{if(data.user)setCurrentUser(previous=>{if(!previous || previous.id!==data.user.id)return previous;const updated={...previous,platinumUpline:data.user.platinumUpline,diamondUpline:data.user.diamondUpline};localStorage.setItem('sq_current_user_v1',JSON.stringify(updated));return updated;});}).catch(()=>{});}}
        isOpen={isAdminOpen}
        onClose={handleReturnToHomePlaylist}
        isAdmin={isAdmin}
        currentUser={currentUser}
        comments={comments}
        users={allUsers}
        tracks={tracks}
        onUpdateUserFull={handleAdminUpdateUser}
        onBatchUpdateUsers={handleBatchUpdateUsers}
        onToggleBlockUser={handleToggleBlockUser}
        onToggleContributor={handleToggleContributor}
        onToggleAdminUser={handleToggleAdminUser}
        onDeleteTrack={handleDeleteTrack}
        onEditTrack={track => { setTrackToEdit(track); setIsUploadOpen(true); }}
        onUpdateTrack={handleUpdateTrack}
        onCategoriesUpdated={fetchCategories}
      />
      </Suspense>) : isProfileOpen ? (<Suspense fallback={<div role="status" className="py-12 text-center text-slate-500">載入功能中…</div>}>
      <ProfileModal
        isOpen={isProfileOpen}
        onClose={handleReturnToHomePlaylist}
        currentUser={currentUser}
        tracks={tracks}
        comments={allComments}
        identityKeys={identityKeys(currentUser, visitor.deviceId)}
        onLoginWithGoogle={handleLoginWithGoogle}
        onUpdateProfile={handleUpdateProfile}
        onSelectTrack={openTrackDetail}
        onSelectCategory={cat => {
          setIsProfileOpen(false);
          setSelectedCategory(cat);
          setCurrentTab('home');
        }}
        onRateTrack={(trackId, score) => handleRateTrack(trackId, score)}
        onClearListeningHistory={handleClearListeningHistory}
        allUsers={allUsers}
        forceEdit={profileEditRequested}
        onForceEditHandled={()=>setProfileEditRequested(false)}
      />
      </Suspense>) : isStickersOpen ? (<Suspense fallback={<div role="status" className="py-12 text-center text-slate-500">載入功能中…</div>}>
      <StickersModal
        isOpen={isStickersOpen}
        onClose={handleReturnToHomePlaylist}
        currentUser={currentUser}
        tracks={tracks}
        initialSummary={stickerSummary}
        onRequireProfileEdit={()=>{setIsStickersOpen(false);setProfileEditRequested(true);setIsProfileOpen(true);}}
        onOpenSource={source => {
          if (source.kind === 'track') {
            const track = tracks.find(item => item.id === source.trackId);
            if (track) { setIsStickersOpen(false); openTrackDetail(track, source.commentId); }
          } else if (source.kind === 'member') {
            const member = [currentUser,...allUsers].find(item => item?.id === source.userId);
            if (member) { setIsStickersOpen(false); setPreviewMember(member); }
          } else { setIsStickersOpen(false); setCurrentTab('home'); }
        }}
        onStickerChanged={refreshStickerSummary}
        onTracksUpdated={savedTracks => {
          const byId = new Map(savedTracks.map(track => [track.id, track]));
          setTracks(prev => prev.map(track => byId.get(track.id) || track));
          setCurrentTrack(prev => prev ? byId.get(prev.id) || prev : prev);
          setSelectedDetailTrack(prev => prev ? byId.get(prev.id) || prev : prev);
        }}
      />
      </Suspense>) : currentTab === 'install' ? (<IOSInstallPage onBack={handleReturnToHomePlaylist}/>) : currentTab === 'stats' ? (
          <StatisticsView
            tracks={tracks}
            users={allUsers}
            comments={comments}
            onSelectTrack={openTrackDetail}
            onViewMember={user => setPreviewMember(user)}
          />
        ) : currentTab === 'notifications' ? (
          <NotificationsView
            users={allUsers}
            currentUser={currentUser}
            isAdmin={isSuperAdmin}
            isAdministrator={isAdministrator}
            onApproveRank={handleApproveRank}
            onRequestMembers={() => fetchAllUsers()}
            onViewMember={user => setPreviewMember(user)}
            tracks={tracks}
            onSelectTrack={openTrackDetail}
            onAddComment={(trackId, content, replyToId, replyToAuthor) =>
              handleAddComment(content, replyToId, replyToAuthor, trackId)
            }
          />
        ) : (selectedDetailTrack || (currentTrack && playerMode === 'expanded')) ? (
          (() => {
            const activeTrack = selectedDetailTrack || currentTrack!;
            const isPlayingActive = isPlaying && currentTrack?.id === activeTrack.id;
            const activeRatings = activeTrack.ratings || {};
            const activeRating = activeRatings[currentIdentifier] ||
              (currentUser && (activeRatings[currentUser.email] || activeRatings[currentUser.id])) ||
              activeRatings[visitor.deviceId] ||
              (currentUser?.email === 'yukidu@gmail.com' ? activeRatings['u-admin'] : undefined) ||
              0;
            const hasLikedActive = Boolean(activeTrack.likedBy && Array.isArray(activeTrack.likedBy) && activeTrack.likedBy.some(k => currentIdentityKeys.includes(k)));

            return (
              <DetailView
                key={activeTrack.id}
                navigation={detailNavigation}
                commentsReady={commentsTrackId === activeTrack.id}
                track={activeTrack}
                comments={comments}
                isPlaying={isPlayingActive}
                currentTime={currentTrack?.id === activeTrack.id ? currentTime : 0}
                duration={currentTrack?.id === activeTrack.id && duration > 0 ? duration : (activeTrack.durationSeconds || 600)}
                playbackRate={playbackRate}
                visitor={visitor}
                currentUser={currentUser}
                isAdmin={isAdmin}
                userRating={activeRating}
                canRate={checkCanAccess(activeTrack) && isTrackVipUnlocked(activeTrack) && isTrackStickerUnlocked(activeTrack)}
                hasLiked={hasLikedActive}
                progressMemory={playbackMemories[activeTrack.id]}
                playerMode={playerMode}
                onSetPlayerMode={(m) => {
                  if (m !== 'expanded') {
                    setSelectedDetailTrack(null);
                  }
                  setPlayerMode(m);
                }}
                onTogglePlay={(anchor) => {
                  if (currentTrack?.id === activeTrack.id) {
                    handleTogglePlay();
                  } else {
                    handlePlayTrack(activeTrack, savedPreferredMode, anchor, visitorShareTrackId.current === activeTrack.id);
                  }
                }}
                onSeek={(sec) => {
                  if (currentTrack?.id === activeTrack.id) {
                    handleSeek(sec);
                  } else {
                    handleSeekCard(activeTrack, sec);
                  }
                }}
                onSkip={handleSkip}
                onRate={score => handleRateTrack(activeTrack.id, score)}
                onToggleLike={() => handleToggleLike(activeTrack.id)}
                onShare={() => setIsShareOpen(true)}
                onChangeSpeed={handleChangeSpeed}
                onAddComment={handleAddComment}
                onDeleteComment={handleDeleteComment}
                onEditComment={handleEditComment}
                onOpenBwExport={mode => {
                  setBwExportMode(mode);
                  setIsBwExportOpen(true);
                }}
                onViewMember={user => setPreviewMember(user)}
                onUpdateTrack={handleUpdateTrack}
                isVipUnlocked={isTrackVipUnlocked(activeTrack)}
                onVipBlocked={(anchor) => showPermissionAlert('此錄音檔為【私密VIP】專屬內容，請向上傳者取得專屬授權連結後再播放。', anchor)}
                onEditTrack={t => {
                  setTrackToEdit(t);
                  setIsUploadOpen(true);
                }}
                onSelectSpeakerRank={rank => {
                  setSelectedDetailTrack(null);
                  setPlayerMode(savedPreferredMode);
                  setSelectedCategory('全部');
                  setSelectedSpeakerRank('全部');
                  setSelectedKeywords([]);
                  setSearchQuery('');
                  setIsSearchFocused(false);
                  setSelectedBadgeSpeakerRank(rank);
                  setShowKeywordsDrawer(true);
                  setUseDefaultHomeOrder(true);
                  setCurrentTab('home');
                  window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
                }}
                onSelectKeyword={kw => {
                  setSelectedDetailTrack(null);
                  setPlayerMode(savedPreferredMode);
                  setSelectedBadgeSpeakerRank('');
                  setSearchQuery(kw);
                  setCurrentTab('home');
                }}
                allUsers={allUsers}
                tracks={tracks}
              />
            );
          })()
        ) : (
          /* List View (Home) */
          <div className="space-y-4">
            {/* Search Input Bar & Search Button (Requirement 9: 刪除上傳按鈕, Requirement 10: 增加搜尋按鈕) */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={event => handleLuckyDraw(event.currentTarget)}
                disabled={luckyPhase === 'spin'}
                className="h-[46px] px-3.5 sm:px-4 py-0 rounded-2xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1 shadow-2xs hover:brightness-105 shrink-0 active:scale-95 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-80"
                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                title="從目前條件下可播放的音檔中召喚繁星解答"
              >
                <span>💫召喚繁星解答</span>
              </button>

              <div ref={searchContainerRef} className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/80 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={e => {
                    setSearchQuery(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') setIsSearchFocused(false);
                  }}
                  placeholder="搜尋演講者、主題、系列或網友關鍵字..."
                  className="w-full pl-10 pr-9 h-[46px] py-0 rounded-2xl text-sm text-white placeholder:text-white/70 outline-hidden shadow-2xs transition-all border border-white/20 focus:ring-2 focus:ring-white/40"
                  style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearchFocused(true);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/80 hover:text-white cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Requirement 10 (v2.7): 搜尋建議選單僅顯示分類標籤與網友關鍵字，刪除音檔詳細資料 */}
                {isSearchFocused && (searchSuggestions.categories.length > 0 || visibleSearchSuggestionKeywords.length > 0) && (
                  <div
                    className="absolute left-0 right-0 top-full mt-2 z-50 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl shadow-2xl border border-rose-100 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800/80 animate-in fade-in zoom-in-95 text-slate-800 dark:text-slate-100 max-h-96 overflow-y-auto"
                    onClick={e => e.stopPropagation()}
                  >
                    {/* 分類標籤 */}
                    {searchSuggestions.categories.length > 0 && (
                      <div className="p-2.5">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <span>🏷️</span>
                          <span>分類標籤</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {searchSuggestions.categories.map(cat => (
                            <button
                              key={`cat-${cat}`}
                              type="button"
                              onClick={() => {
                                setSelectedCategory(cat);
                                setSearchQuery('');
                                setIsSearchFocused(false);
                              }}
                              className="px-2.5 py-1 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900 transition-colors cursor-pointer"
                            >
                              #{cat}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 網友關鍵字 */}
                    {visibleSearchSuggestionKeywords.length > 0 && (
                      <div className="p-2.5">
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                          <span>💬</span>
                          <span>網友關鍵字</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {visibleSearchSuggestionKeywords.map(kw => {
                            const isSelected = selectedKeywords.includes(kw);
                            return (
                              <button
                                key={`kw-${kw}`}
                                type="button"
                                onClick={() => {
                                  setSelectedKeywords(prev => isSelected ? prev.filter(k => k !== kw) : [...prev, kw]);
                                  setIsSearchFocused(false);
                                }}
                                className={`px-2.5 py-1 rounded-xl text-sm font-normal transition-colors cursor-pointer flex items-center gap-1 ${
                                  isSelected
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-slate-700'
                                }`}
                              >
                                <span>🔍 {kw}({keywordMatchCounts[kw] ?? 0})</span>
                                {isSelected && <span className="text-[10px] text-amber-600 font-bold">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 進階篩選：獎章條件與網友關鍵字統一收在同一個抽屜 */}
            <div className="space-y-1">
              <div className="flex items-center gap-2 px-0.5">
                <button
                  type="button"
                  onClick={() => setShowKeywordsDrawer(prev => !prev)}
                  className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-left text-sm text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors cursor-pointer"
                  aria-expanded={showKeywordsDrawer}
                >
                  <span className="font-semibold">按此</span>
                  <span className="font-black">{showKeywordsDrawer ? '▲收起' : '▼展開'}</span>
                  <span className="font-bold">進階篩選</span>
                  {(selectedBadgeSpeakerRank || selectedKeywords.length > 0) && (
                    <span className="ml-1 rounded-full bg-amber-100 dark:bg-amber-950/70 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">已套用</span>
                  )}
                </button>

                <div className="ml-auto flex items-center gap-2">
                  {(selectedKeywords.length > 0 || selectedBadgeSpeakerRank) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedKeywords([]);
                        setSelectedBadgeSpeakerRank('');
                      }}
                      className="text-sm font-bold text-slate-500 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-300 underline cursor-pointer"
                    >
                      重設
                    </button>
                  )}
                </div>
              </div>

              {showKeywordsDrawer && (
                <div className="relative p-2 rounded-xl bg-amber-50/80 dark:bg-slate-800/80 border border-amber-200/70 dark:border-slate-700 animate-in fade-in space-y-2">
                  {selectedBadgeSpeakerRank && (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-white/85 dark:bg-slate-900/75 px-2.5 py-2 text-sm text-amber-900 dark:text-amber-200">
                      <span aria-hidden="true">🏅</span>
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">獎章</span>
                      <span className="font-bold">{selectedBadgeSpeakerRank}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedBadgeSpeakerRank('')}
                        className="ml-auto rounded-full border border-amber-300/80 bg-white px-2 py-0.5 text-xs font-bold text-amber-800 shadow-2xs hover:bg-amber-100 dark:border-amber-600/60 dark:bg-slate-900 dark:text-amber-200 cursor-pointer"
                        title="清除獎章篩選"
                      >
                        清除
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                    <span aria-hidden="true">💬</span>
                    <span>網友關鍵字</span>
                    <span className="font-normal">(可複選多個)</span>
                  </div>

                  <div className="flex flex-wrap gap-0.5 max-h-40 overflow-y-auto">
                    {visibleAvailableKeywords.length === 0 ? (
                      <span className="text-xs text-slate-400 italic">目前條件下沒有其他符合的關鍵字</span>
                    ) : (
                      visibleAvailableKeywords.map(kw => {
                        const isSelected = selectedKeywords.includes(kw);
                        return (
                          <button
                            key={`drawer-kw-${kw}`}
                            type="button"
                            onClick={() => {
                              setSelectedKeywords(prev =>
                                isSelected ? prev.filter(k => k !== kw) : [...prev, kw]
                              );
                            }}
                            className={`px-2 py-1 rounded-lg text-sm font-normal transition-colors cursor-pointer border ${
                              isSelected
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-amber-50 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{kw}({keywordMatchCounts[kw] ?? 0})</span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Selected Keyword Chips Indicator */}
              {selectedKeywords.length > 0 && (
                <div className="flex flex-wrap items-center gap-0.5 px-0.5 py-0.5">
                  {selectedKeywords.map(kw => (
                    <span
                      key={kw}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-full text-sm font-normal bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-200 border border-amber-300/80 dark:border-amber-700"
                    >
                      <span>{kw}({keywordMatchCounts[kw] ?? 0})</span>
                      <button
                        type="button"
                        onClick={() => setSelectedKeywords(prev => prev.filter(k => k !== kw))}
                        className="hover:text-red-500 p-0 cursor-pointer"
                        title="移除此關鍵字"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Requirement 18, 19 & 20: 排序選項排成一列緊密排序，分類改成下拉式選單排在最右側，底色統一 */}
            <div className={`sort-toolbar relative grid gap-1 w-full max-w-full px-0 pt-0.5 ${(isSpeakerRankDropdownOpen || isCategoryDropdownOpen) ? 'z-[100]' : 'z-20'}`}>
              {/* v3.7: large/landscape shows seven controls; portrait phones hide 評價/按讚 and keep five columns. */}
              {(['權限', '評價', '留言', '按讚', '貼紙', '時間'] as SortField[]).map(field => {
                const isActive = sortField === field;
                const displayField = field === '留言' ? '心得' : field;
                const hideOnPortraitPhone = field === '評價' || field === '按讚';
                return (
                  <div key={field} className={`sort-toolbar-item relative min-w-0 ${hideOnPortraitPhone ? 'sort-hide-portrait' : ''}`}>
                    <button
                      type="button"
                      onClick={() => handleSortClick(field)}
                      className={`w-full h-[46px] min-w-0 px-0 py-0 rounded-xl text-[10px] sm:text-xs font-bold transition-all flex items-center justify-center gap-0 shadow-2xs ${
                        isActive
                          ? 'ring-2 ring-white/95 text-white brightness-110 font-black'
                          : 'text-white/85 hover:text-white hover:brightness-105 opacity-90 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                      title={field==='貼紙'?'貼紙：首次成本低至高，再次心得獎勵高至低':`依${displayField}排序，重複點擊切換遞增/遞減`}
                    >
                      <span className="truncate">{displayField}</span>
                      {isActive && (
                        <span className="sort-direction-icon inline-flex items-center justify-center w-5 h-5 ml-0 rounded-full bg-white text-[var(--color-primary,#c06c84)] shrink-0 shadow-2xs">
                          {sortDirection === 'desc' ? (
                            <ArrowDown className="w-4 h-4 stroke-[3.5]" />
                          ) : (
                            <ArrowUp className="w-4 h-4 stroke-[3.5]" />
                          )}
                        </span>
                      )}
                    </button>
                  </div>
                );
              })}

              {/* 2. Category Dropdown */}
              <div className="sort-toolbar-item relative min-w-0">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setIsCategoryDropdownOpen(prev => !prev);
                      setIsSpeakerRankDropdownOpen(false);
                    }}
                    className="w-full h-[46px] min-w-0 px-0 py-0 rounded-xl text-[10px] sm:text-xs font-bold text-white flex items-center justify-center gap-0 shadow-2xs hover:brightness-105 transition-all"
                    style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                    title="點擊展開分類選單"
                  >
                    <span className="truncate min-w-0">
                      分類
                    </span>
                    <ChevronDown className="w-3 h-3 text-white/90 shrink-0" />
                  </button>

                  {/* Dropdown Menu with click outside backdrop */}
                  {isCategoryDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-[90]"
                        onClick={() => setIsCategoryDropdownOpen(false)}
                      />
                      <div
                        className="absolute right-0 top-full mt-1.5 z-[110] w-36 rounded-2xl shadow-xl py-1 overflow-hidden border border-white/20 animate-in fade-in zoom-in-95 text-white"
                        style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                        onClick={e => e.stopPropagation()}
                      >
                        {categoryOptions.map(cat => {
                          const isSelected = selectedCategory === cat;
                          return (
                            <button
                              key={cat}
                              onClick={() => {
                                setSelectedCategory(cat);
                                setIsCategoryDropdownOpen(false);
                              }}
                              className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition-colors ${
                                isSelected
                                  ? 'bg-white/25 text-white font-black'
                                  : 'text-white/90 hover:bg-white/15'
                              }`}
                            >
                              <span>{cat}</span>
                              {isSelected && <Check className="w-3.5 h-3.5 text-white font-bold" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
              </div>
            </div>

            {/* Audio Cards List - Requirement 14 (v2.7): 刪除包圍所有音檔的更大區塊框線，騰出更多版面空間 */}
            <div className={`audio-card-grid relative grid grid-cols-1 gap-2 pt-1 ${luckyPhase === 'spin' ? 'lucky-spin-active' : ''} ${luckyPhase === 'win' ? 'lucky-win-active' : ''}`}>
              {displayedTracks.length === 0 ? (
                <div className="text-center py-16 bg-white/60 dark:bg-slate-800/40 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">
                    找不到符合條件的演講音檔
                  </p>
                </div>
              ) : (
                displayedTracks.map((track, trackIndex) => {
                  const isCurrent = currentTrack?.id === track.id;
                  const canAccess = checkCanAccess(track);
                  const isVipUnlocked = isTrackVipUnlocked(track);
                  const isStickerUnlocked = isTrackStickerUnlocked(track);
                  const tRatings = track?.ratings || {};
                  const trackRating = tRatings[currentIdentifier] ||
                    (currentUser && (tRatings[currentUser.email] || tRatings[currentUser.id])) ||
                    tRatings[visitor.deviceId] ||
                    (currentUser?.email === 'yukidu@gmail.com' ? tRatings['u-admin'] : undefined) ||
                    0;
                  const hasLiked = Boolean(track?.likedBy && Array.isArray(track.likedBy) && track.likedBy.some(k => currentIdentityKeys.includes(k)));

                  return (
                    <div
                      key={track.id}
                      className="lucky-card relative"
                      data-track-card-id={track.id}
                      data-lucky-winner={luckyWinnerId === track.id ? 'true' : undefined}
                    >
                    {luckyPhase === 'win' && luckyWinnerId === track.id && luckyAnswerText && (
                      <div className="lucky-answer-notice" role="status" aria-live="polite">
                        {luckyAnswerText.split(/([+]\d+(?:\.\d+)?)/g).map((part,index)=><span key={index} className={part.startsWith('+')?'text-red-500':undefined}>{part}</span>)}
                      </div>
                    )}
                    {luckyPhase === 'win' && luckyWinnerId === track.id && (
                      <div className="lucky-winner-badge" aria-live="polite">✨ 好手氣！✨</div>
                    )}
                    <AudioCard
                      track={track}
                      isPlaying={isPlaying && isCurrent}
                      isCurrentTrack={isCurrent}
                      canAccess={canAccess}
                      isVipUnlocked={isVipUnlocked}
                      tutorialTarget={trackIndex === 0}
                      progressMemory={playbackMemories[track.id]}
                      commentRewardClaimed={Boolean(stickerSummary?.commentRewardTrackIds?.includes(track.id))}
                      userRating={trackRating}
                      hasLiked={hasLiked}
                      onClick={() => {
                        // Requirement 8: 點擊資訊卡，不要播放音檔，「只會」最大化展開該曲目的詳細介面
                        openTrackDetail(track);
                      }}
                      onTogglePlay={(anchor) => {
                        if (track.isPrivateVip && !isVipUnlocked) {
                          showPermissionAlert('此錄音檔為【私密VIP】專屬內容，請向上傳者取得專屬授權連結後再播放。', anchor);
                          return;
                        }
                        if (isCurrent) {
                          handleTogglePlay();
                        } else {
                          handlePlayTrack(track, savedPreferredMode, anchor);
                        }
                      }}
                      onRate={score => handleRateTrack(track.id, score)}
                      onToggleLike={() => handleToggleLike(track.id)}
                      onSeek={seconds => handleSeekCard(track, seconds)}
                      onOpenCommentPreview={() => setCommentPreviewTrack(track)}
                    />
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Page Footer - Requirement 2 (v2.7): 刪除右下角的v版本號 */}
        <footer className="mt-12 pt-6 border-t border-slate-200/50 dark:border-slate-800/80 flex items-center justify-between text-xs text-slate-400 dark:text-slate-500">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsChangelogOpen(true)}
              className="w-5 h-5 rounded-full bg-slate-200/50 dark:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center justify-center text-[10px] font-mono font-bold transition-colors cursor-pointer"
              title="查看版本改版紀錄"
            >
              !
            </button>
            <span>繁星回聲</span>
          </div>
        </footer>
      </main>

      {/* Requirement 1 (第9次更新) & Requirement 7 (第10次更新) & Requirement 1 (第13次更新): 
          按下「展開詳細介面最大化」，底部播放器和浮動播放器都要維持存在，且不會中斷播放。
          記憶用戶手動調整播放器的最後狀態，例如浮動播放器就一直維持浮動狀態，不會強制跳回底部播放器。 */}
      {currentTrack && (
        <MiniPlayer
          track={currentTrack}
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={duration}
          playbackRate={playbackRate}
          playerMode={playerMode === 'expanded' ? savedPreferredMode : playerMode}
          onSetPlayerMode={(m) => {
            if (m === 'expanded') {
              openTrackDetail(currentTrack);
            } else {
              setSelectedDetailTrack(null);
            }
            setPlayerMode(m);
          }}
          onScrollToTop={() => { window.scrollTo({top:0,behavior:'smooth'}); document.getElementById('detail-view-container')?.scrollTo({top:0,behavior:'smooth'}); }}
          onReturnHome={handleReturnToHomePlaylist}
          onClose={() => {
            audioRef.current?.pause();
            setIsPlaying(false);
            setCurrentTrack(null);
            setCurrentTime(0);
            setDuration(0);
            if ('mediaSession' in navigator) {
              try {
                navigator.mediaSession.playbackState = 'none';
                navigator.mediaSession.metadata = null;
              } catch {}
            }
          }}
          onTogglePlay={handleTogglePlay}
          onSeek={handleSeek}
          onSkip={handleSkip}
          onChangeSpeed={handleChangeSpeed}
        />
      )}

      {/* Requirement 15: Comment Preview Modal */}
      <CommentPreviewModal initialComments={allComments}
        isOpen={!!commentPreviewTrack}
        onClose={() => setCommentPreviewTrack(null)}
        track={commentPreviewTrack}
        currentUser={currentUser}
        visitor={visitor}
        isAdmin={isAdmin}
        allUsers={allUsers}
        tracks={tracks}
        onViewMember={user => setPreviewMember(user)}
        onDeleteComment={(commentId) => handleDeleteComment(commentId, commentPreviewTrack?.id)}
        onCommentAdded={async () => {
          hasFetchedAllCommentsRef.current = false;
          if (commentPreviewTrack) {
            setTracks(prev =>
              prev.map(t =>
                t.id === commentPreviewTrack.id
                  ? { ...t, commentsCount: (t.commentsCount || 0) + 1 }
                  : t
              )
            );
          }
          const activeId = activeCommentsTrackIdRef.current;
          if (activeId && activeId === commentPreviewTrack?.id) {
            try {
              const data = await apiJson(`/api/tracks/${encodeURIComponent(activeId)}/comments`);
              if (activeCommentsTrackIdRef.current === activeId) setComments(data);
            } catch {}
          }
        }}
      />

      {/* Upload & management document page (the nested editor remains a separate modal) */}
      {isUploadOpen && <main data-echo-page="audio-management" className="flex-1 w-full max-w-6xl mx-auto px-0 sm:px-6 py-0 sm:py-5 pb-28">
      <Suspense fallback={<div role="status" className="py-14 text-center text-slate-500">載入音檔管理中…</div>}>
      <UploadModal
        presentation="page"
        isOpen={isUploadOpen}
        onClose={() => {
          // Native browser Back should return to the previous page rather than
          // keeping a stale upload entry that re-opens the workspace.
          if (window.history.state?.echostars && window.history.state?.tab === 'upload') {
            window.history.back();
          } else {
            setIsUploadOpen(false);
            setTrackToEdit(null);
            if (currentTab === 'upload') setCurrentTab('home');
          }
        }}
        currentUser={currentUser}
        isAdmin={isAdmin}
        trackToEdit={trackToEdit}
        tracks={tracks}
        onCategoriesUpdated={fetchCategories}
        onSuccess={rawTrack => {
          const trackData: any = (rawTrack as any)?.track || rawTrack;
          const normalizedTrack = trackData as Track;

          if (trackToEdit) {
            updateTrackCopies(normalizedTrack.id, track => ({ ...track, ...normalizedTrack }));
            setTrackToEdit(null);
          } else {
            locallyChangedTrackIds.current.add(normalizedTrack.id);
            setTracks(prev => [normalizedTrack, ...prev]);
            handlePlayTrack(normalizedTrack, savedPreferredMode);
          }
        }}
      />
      </Suspense>
      </main>}

      {/* Profile & Google Binding Modal (With Amway Fields & Numerology) */}


      {/* Member Profile & Numerology Preview Modal (Clicking any comment author) */}
      {!!previewMember && <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/50 text-white">載入功能中…</div>}>
      <MemberPreviewModal
        isOpen={!!previewMember}
        onClose={() => setPreviewMember(null)}
        user={previewMember}
        tracks={tracks}
        comments={comments}
        allUsers={allUsers}
        currentUser={currentUser}
      />
      </Suspense>}

      {/* Social Share Modal */}
      {(selectedDetailTrack || currentTrack) && (
        <ShareModal
          isOpen={isShareOpen}
          onClose={() => setIsShareOpen(false)}
          track={selectedDetailTrack || currentTrack!}
          visitor={visitor}
          currentUser={currentUser}
        />
      )}

      {/* Black & White Minimalist Canvas Share Modal - Requirement 4: 支援訪客與會員匯出圖卡 */}
      {isBwExportOpen && <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/50 text-white">載入功能中…</div>}>
      <BwExportModal
        isOpen={isBwExportOpen}
        onClose={() => setIsBwExportOpen(false)}
        mode={bwExportMode}
        currentTrack={currentTrack || selectedDetailTrack || undefined}
        comments={comments}
        ratedTracks={userRatedTracks}
        currentUser={currentUser || {
          id: 'guest',
          name: visitor.fullName || '學習夥伴',
          email: '',
          rank: '一般夥伴',
          avatar: visitor.emoji || '👤',
          playCount: 0,
          isBlocked: false,
          lastActive: '剛才'
        }}
      />
      </Suspense>}

      {/* Requirement 3 (v2.8): 首頁播放清單和音檔詳細介紹畫面這二處，網頁左下角，新增：半透明浮動的向上箭頭按鈕，按了會回到頁面的最前面 */}
      {!currentTrack && (currentTab === 'home' || selectedDetailTrack !== null || playerMode === 'expanded') && (
        <button
          type="button"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            document.documentElement.scrollTo({ top: 0, behavior: 'smooth' });
            document.body.scrollTo({ top: 0, behavior: 'smooth' });
            const mainContainer = document.querySelector('main');
            if (mainContainer) mainContainer.scrollTo({ top: 0, behavior: 'smooth' });
            const detailContainer = document.getElementById('detail-view-container');
            if (detailContainer) detailContainer.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          style={{ bottom: "var(--scroll-top-bottom, 24px)" }}
          aria-label="回到頁面最前面"
          title="回到頁面最前面"
          className="fixed bottom-40 left-1/2 -translate-x-1/2 z-40 w-[66px] h-[66px] rounded-full bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 backdrop-blur-md border border-slate-200/80 dark:border-slate-700/80 shadow-xl flex items-center justify-center transition-all cursor-pointer active:scale-90 hover:scale-105 touch-manipulation"
        >
          <ArrowUp className="w-[30px] h-[30px] text-[var(--color-primary,#c06c84)] stroke-[2.5]" />
        </button>
      )}

      {stickerSpend && <StickerSpendDialog {...stickerSpend} balance={stickerSummary?.balance} onResolve={resolveStickerSpend} />}


      {/* Version Changelog Modal */}
      {isChangelogOpen && <Suspense fallback={<div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/50 text-white">載入功能中…</div>}>
      <ChangelogModal
        isOpen={isChangelogOpen}
        onClose={() => setIsChangelogOpen(false)}
        currentUser={currentUser}
        isAdmin={isSuperAdmin}
      />
      </Suspense>}
    </div>
  );
}
