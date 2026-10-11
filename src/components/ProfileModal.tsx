import { effectiveMemberRank } from '../utils/ranks';
import { getFeedbackRules, showStickerNotice } from './StickerFeedback';
import { ThemedSelect } from './ThemedSelect';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  User,
  Star,
  MessageSquare,
  Headphones,
  CheckCircle2,
  Edit2,
  Check,
  X,
  LogIn,
  Shield,
  Clock,
  Sparkles,
  Award,
  MapPin,
  Building,
  Heart,
  Calendar,
  Camera,
  Loader2,
  Share2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  Trash2
} from 'lucide-react';
import {
  UserProfile,
  Track,
  Comment,
  CategoryType,
  RESIDENCE_OPTIONS,
  CENTER_OPTIONS,
  RANK_ORDER,
  JOIN_REASONS,
  AmwayRank,
  JoinReason,
  STAY_REASONS,
  StayReason,
  UserListeningRecord
} from '../types';
import { calculateNumerology } from '../utils/numerology';
import { exportMemberProfileAndListeningImage, shareOrDownloadImage } from '../utils/canvasExport';
import { GOOGLE_CLIENT_ID } from '../config/auth';
import { NumerologyGrid } from './NumerologyGrid';
import { AvatarCropModal } from './AvatarCropModal';
import { CollapsibleCommentText } from './CollapsibleCommentText';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile | null;
  tracks: Track[];
  comments: Comment[];
  identityKeys?: string[];
  onLoginWithGoogle: (email?: string, name?: string, avatarUrl?: string) => void | Promise<void>;
  onUpdateProfile: (updatedData: Partial<UserProfile>) => void | Promise<void>;
  onSelectTrack: (track: Track) => void;
  onSelectCategory?: (category: CategoryType) => void;
  onRateTrack?: (trackId: string, rating: number) => void;
  onClearListeningHistory?: () => Promise<void>;
  allUsers?: UserProfile[];
  forceEdit?: boolean;
  onForceEditHandled?: () => void;
}

function decodeGoogleJwt(token: string) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  tracks,
  comments,
  identityKeys = [],
  onLoginWithGoogle,
  onUpdateProfile,
  onSelectTrack,
  onSelectCategory,
  onRateTrack,
  onClearListeningHistory,
  allUsers = [],
  forceEdit = false,
  onForceEditHandled
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'ratings' | 'comments' | 'listening'>('profile');
  const [listeningRecords, setListeningRecords] = useState<Record<string, UserListeningRecord>>({});
  const [isLoadingRecords, setIsLoadingRecords] = useState(false);
  const [hasLoadedListeningRecords, setHasLoadedListeningRecords] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -120 : 120,
        behavior: 'smooth'
      });
    }
  };

  useEffect(() => {
    if (!isOpen || !currentUser || activeTab !== 'listening' || hasLoadedListeningRecords) return;
    setIsLoadingRecords(true);
    const idParam = currentUser.email || currentUser.id;
    fetch(`/api/playback/history/${encodeURIComponent(idParam)}`)
      .then(res => res.json())
      .then(data => {
        setListeningRecords(data || {});
        setHasLoadedListeningRecords(true);
        setIsLoadingRecords(false);
      })
      .catch(() => {
        setIsLoadingRecords(false);
      });
  }, [isOpen, currentUser, activeTab, hasLoadedListeningRecords]);

  // Edit profile states for all fields
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(currentUser?.name || '');
  const [amwayId, setAmwayId] = useState(currentUser?.amwayId || '');
  const [phone, setPhone] = useState(currentUser?.phone || '');
  const [residence, setResidence] = useState(currentUser?.residence || '臺北');
  const [center, setCenter] = useState(currentUser?.center || '無');
  const [rank, setRank] = useState<AmwayRank>(currentUser?.rank || '無');
  const [joinReason, setJoinReason] = useState<JoinReason>(currentUser?.joinReason || '事業');
  const [stayReason, setStayReason] = useState<StayReason | string>(currentUser?.stayReason || '打造自己的事業與團隊');
  const [sponsor, setSponsor] = useState(currentUser?.sponsor || '');
  const [platinumUpline, setPlatinumUpline] = useState(currentUser?.platinumUpline || '');
  const [diamondUpline, setDiamondUpline] = useState(currentUser?.diamondUpline || '');
  const [birthday, setBirthday] = useState(currentUser?.birthday || '');
  const [avatar, setAvatar] = useState(currentUser?.avatar || '');

  // Avatar Crop Modal state
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);

  // Item 5: Export Personal Card state
  const [isExportingCard, setIsExportingCard] = useState(false);

  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthorizing, setIsAuthorizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [organizationDisplayName,setOrganizationDisplayName] = useState('');

  const refreshOrganizationDisplay = async () => {
    if (!currentUser?.id || !currentUser.amwayId?.trim()) { setOrganizationDisplayName(''); return; }
    try {
      const response=await fetch('/api/organization/me');
      const data=await response.json().catch(()=>({}));
      if (response.ok) setOrganizationDisplayName(String(data.displayName || currentUser.name || ''));
    } catch { /* display falls back to the member's own name */ }
  };
  useEffect(()=>{ if(isOpen && currentUser) void refreshOrganizationDisplay(); },[isOpen,currentUser?.id,currentUser?.name,currentUser?.amwayId]);
  useEffect(()=>{
    if(!isOpen || !forceEdit || !currentUser)return;
    setName(currentUser.name || '');setAmwayId(currentUser.amwayId || '');setPhone(currentUser.phone || '');setResidence(currentUser.residence || '臺北');setCenter(currentUser.center || '無');setRank(currentUser.rank || '無');setJoinReason(currentUser.joinReason || '事業');setStayReason(currentUser.stayReason || '未填寫');setSponsor(currentUser.sponsor || '');setPlatinumUpline(currentUser.platinumUpline || '');setDiamondUpline(currentUser.diamondUpline || '');setBirthday(currentUser.birthday || '');setAvatar(currentUser.avatar || '');setIsEditing(true);onForceEditHandled?.();
  },[isOpen,forceEdit,currentUser?.id]);

  // Standard Google OAuth 2.0 Sign In
  const handleGoogleSignIn = () => {
    setAuthError(null);
    setIsAuthorizing(true);
    const clientId = GOOGLE_CLIENT_ID;

    if (typeof window !== 'undefined' && (window as any).google?.accounts?.oauth2) {
      try {
        const client = (window as any).google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'email profile openid',
          callback: async (tokenResponse: any) => {
            if (tokenResponse && tokenResponse.access_token) {
              try {
                const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
                });
                if (!res.ok) throw new Error('無法取得 Google 帳戶資訊。');
                const userInfo = await res.json();
                if (userInfo.email) {
                  await onLoginWithGoogle(userInfo.email, userInfo.name || userInfo.email.split('@')[0], userInfo.picture);
                } else {
                  setAuthError('無法解析 Google 使用者資訊，請重試。');
                }
              } catch (err) {
                console.error('Failed to fetch Google userinfo:', err);
                setAuthError(err instanceof Error ? err.message : '登入失敗，請稍候重試。');
              }
            } else if (tokenResponse?.error) {
              console.warn('Google auth response error:', tokenResponse);
              if (tokenResponse.error === 'popup_closed_by_user') {
                setIsAuthorizing(false);
                return;
              }
              setAuthError(`Google 登入失敗: ${tokenResponse.error_description || tokenResponse.error}`);
            }
            setIsAuthorizing(false);
          },
          error_callback: () => { setIsAuthorizing(false); setAuthError('Google 授權視窗已關閉，請重試。'); }
        });
        client.requestAccessToken();
      } catch (err: any) {
        setIsAuthorizing(false);
        console.warn('Google oauth2 client init error:', err);
        setAuthError(err.message || 'Google 授權元件初始化失敗');
      }
    } else {
      setIsAuthorizing(false);
      setAuthError('Google 登入元件尚未載入完成，請重新整理頁面後重試。');
    }
  };

  // Item 4: Autocomplete suggestions for platinumUpline and diamondUpline
  const [activeSuggestField, setActiveSuggestField] = useState<'platinum' | 'diamond' | null>(null);

  const platinumSuggestions = useMemo(() => {
    const set = new Set<string>();
    allUsers.forEach(u => {
      const rank = effectiveMemberRank(u, '');
      if (rank && (rank.includes('白金') || rank.includes('翡翠') || rank.includes('鑽石') || rank.includes('皇冠') || rank.includes('大使'))) {
        set.add(u.name);
      }
      if (u.platinumUpline) set.add(u.platinumUpline);
    });

    return Array.from(set).filter(n => n.toLowerCase().includes((platinumUpline || '').toLowerCase()));
  }, [allUsers, platinumUpline]);

  const diamondSuggestions = useMemo(() => {
    const set = new Set<string>();
    allUsers.forEach(u => {
      const rank = effectiveMemberRank(u, '');
      if (rank && (rank.includes('鑽石') || rank.includes('皇冠') || rank.includes('大使'))) {
        set.add(u.name);
      }
      if (u.diamondUpline) set.add(u.diamondUpline);
    });

    return Array.from(set).filter(n => n.toLowerCase().includes((diamondUpline || '').toLowerCase()));
  }, [allUsers, diamondUpline]);

  const handleExportCard = async () => {
    if (!currentUser || isExportingCard) return;
    setIsExportingCard(true);
    try {
      let recordsMap = listeningRecords;
      if (!hasLoadedListeningRecords) {
        const idParam = currentUser.email || currentUser.id;
        const res = await fetch(`/api/playback/history/${encodeURIComponent(idParam)}`);
        if (res.ok) {
          recordsMap = await res.json();
          setListeningRecords(recordsMap || {});
          setHasLoadedListeningRecords(true);
        }
      }
      const records = Object.values(recordsMap || {}).flatMap(record => {
        const track = tracks.find(item => item.id === record.trackId);
        if (!track) return [];
        const rating = (track.ratings || {})[currentUser.email] || (track.ratings || {})[currentUser.id] || record.rating || 0;
        const comment = comments.find(item => item.trackId === record.trackId && item.authorEmail === currentUser.email)?.content || record.comment || '';
        return [{ track, record: { ...record, rating, comment } }];
      });
      const blob = await exportMemberProfileAndListeningImage(currentUser, records);
      await shareOrDownloadImage(blob, `繁星回聲_${currentUser.name}_學習檔案.jpg`, `${currentUser.name} 的學習與聆聽檔案`);
    } catch (err) {
      console.error('Failed to export personal profile card:', err);
    } finally {
      setIsExportingCard(false);
    }
  };

  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const handleClearHistory = async () => {
    if (!onClearListeningHistory || isClearingHistory) return;
    setIsClearingHistory(true);
    setSaveError(null);
    try {
      await onClearListeningHistory();
      setListeningRecords({});
      setHasLoadedListeningRecords(true);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '清除學習紀錄失敗');
    } finally {
      setIsClearingHistory(false);
    }
  };

  if (!isOpen) return null;

  const currentMonth = new Date().toISOString().substring(0, 7);
  const currentUploadCount = (currentUser?.avatarUploadMonth === currentMonth)
    ? (currentUser.avatarUploadCount || 0)
    : 0;

  // Requirement 1: 跟頭像一樣每月只能最多修改 5 次
  const currentProfileEditCount = (currentUser?.profileEditMonth === currentMonth)
    ? (currentUser.profileEditCount || 0)
    : 0;

  const numResult = calculateNumerology(isEditing ? birthday : (currentUser?.birthday || ''));

  const handleStartEdit = () => {
    if (!currentUser) return;
    if (currentProfileEditCount >= 5) {
      alert('您本月基本資料修改次數已達上限 (5次)！次月將自動重設。');
      return;
    }
    setName(currentUser.name || '');
    setAmwayId(currentUser.amwayId || '');
    setPhone(currentUser.phone || '');
    setResidence(currentUser.residence || '臺北');
    setCenter(currentUser.center || '無');
    setRank(currentUser.rank || '無');
    setJoinReason(currentUser.joinReason || '事業');
    setStayReason(currentUser.stayReason || '未填寫');
    setSponsor(currentUser.sponsor || '');
    setPlatinumUpline(currentUser.platinumUpline || '');
    setDiamondUpline(currentUser.diamondUpline || '');
    setBirthday(currentUser.birthday || '');
    setAvatar(currentUser.avatar || '');
    setIsEditing(true);
  };

  const handleSaveProfile = async () => {
    if (isSaving) return;
    if (!name.trim()) {const rules=getFeedbackRules();showStickerNotice(rules.profileHintText.replaceAll('{x}',String(rules.profileReward)),rules.profileHintSeconds);return;}
    setIsSaving(true);
    setSaveError(null);

    const calc = calculateNumerology(birthday);
    const newProfileCount = currentProfileEditCount + 1;

    const payload: Partial<UserProfile> = {
      name: name.trim(),
      amwayId: amwayId.trim(),
      residence,
      center,
      rank,
      joinReason,
      stayReason,
      sponsor: sponsor.trim(),
      platinumUpline: platinumUpline.trim(),
      diamondUpline: diamondUpline.trim(),
      birthday,
      zodiac: calc?.zodiac,
      talentNumber: calc?.talentNumber,
      lifeNumber: calc?.lifeNumber,
      avatar: avatar.trim() || currentUser?.avatar,
      profileEditCount: newProfileCount,
      profileEditMonth: currentMonth
    };

    try {
      await onUpdateProfile(payload);
      await refreshOrganizationDisplay();
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '資料儲存失敗，請重試。');
    } finally { setIsSaving(false); }
  };

  const handleAvatarCropped = async (compressedBase64: string) => {
    setSaveError(null);
    try {
      await onUpdateProfile({ avatar: compressedBase64, avatarUploadCount: currentUploadCount + 1, avatarUploadMonth: currentMonth });
      setAvatar(compressedBase64);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '照片儲存失敗，請重試。');
    }
  };

  // Find tracks rated by this user
  const userRatedTracks = tracks.map(t => {
    const userKeys = [currentUser?.email?.trim().toLowerCase(), currentUser?.id, ...identityKeys, ...(currentUser?.email?.toLowerCase() === 'yukidu@gmail.com' ? ['u-admin'] : [])].filter(Boolean);
    const foundScore = userKeys.map(k => (t.ratings || {})[k!]).find(s => s !== undefined && s > 0);
    return { track: t, rating: foundScore };
  }).filter(item => item.rating !== undefined && item.rating > 0);

  const userComments = currentUser
    ? comments.filter(c => c.authorEmail?.trim().toLowerCase() === currentUser.email?.trim().toLowerCase())
    : [];

  const userListenedItems = (listeningRecords && typeof listeningRecords === 'object' ? Object.values(listeningRecords) : [])
    .filter(rec => !!rec && !!rec.trackId)
    .map(rec => {
      const foundTrack = tracks.find(t => t.id === rec.trackId);
      const isDeleted = !foundTrack || rec.isDeleted === true;
      const track: Track = foundTrack || {
        id: rec.trackId,
        title: rec.trackTitle || '演講錄音檔',
        speaker: rec.trackSpeaker || '繁星講師',
        speakerRank: rec.trackSpeakerRank || '無',
        speakerAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80',
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
      return { track, record: rec, isDeleted };
    });

  return (
    <div className="profile-page w-full min-h-[70dvh]">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full overflow-hidden border border-rose-100/60 dark:border-slate-800">
        {saveError && <p role="alert" className="px-4 py-3 text-sm text-red-600 bg-red-50 dark:bg-red-950">{saveError}</p>}
        {/* Header - Requirement 20: 統一底色與麥克風相同色 */}
        <div
          className="p-4 sm:p-5 flex items-center justify-between text-white"
          style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-base text-white">
                {currentUser ? '個人中心' : '登入 / 綁定 Google 帳號'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser && (isEditing ? <><button disabled={isSaving} onClick={handleSaveProfile} className="px-2 py-2 rounded-lg bg-white/20 text-xs">儲存</button><button disabled={isSaving} onClick={()=>setIsEditing(false)} className="px-2 py-2 text-xs">取消</button></> : <button onClick={handleStartEdit} disabled={currentProfileEditCount>=5} className="px-2 py-2 rounded-lg bg-white/20 text-xs">修改</button>)}
            <button
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        {!currentUser ? (
          /* Not Logged In View - Requirement 5 (v2.8): 解決 401 授權錯誤，提供直達登入與官方帳號一鍵綁定 */
          <div className="p-6 sm:p-8 space-y-5 text-xs text-center">
            <div className="mx-auto w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shadow-inner mb-2">
              <svg className="w-9 h-9" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
            </div>

            <div>
              <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-100">
                歡迎登入 繁星回聲
              </h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1">
                支援 Google 帳號授權綁定與專屬身分識別
              </p>
            </div>

            {/* Login Action Area with single standard Google button */}
            <div className="bg-white dark:bg-slate-800 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xs text-center space-y-4">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200 block text-center">
                使用 Google 官方帳號進行安全驗證與身分綁定
              </span>

              {authError && (
                <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs text-left flex items-start gap-2">
                  <span className="shrink-0 text-sm">⚠️</span>
                  <div className="min-w-0">
                    <p className="font-semibold">{authError}</p>
                    <p className="text-[11px] opacity-80 mt-0.5">
                      請確認您的 Google Cloud 專案已將目前網站網址加入「已獲授權的 JavaScript 來源」。
                    </p>
                  </div>
                </div>
              )}

              {/* Single Standard Google Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={isAuthorizing}
                className="w-full py-3.5 px-4 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 font-bold text-sm text-slate-700 dark:text-slate-200 shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-3 cursor-pointer active:scale-98 disabled:opacity-60"
              >
                {isAuthorizing ? (
                  <Loader2 className="w-5 h-5 animate-spin text-rose-500" />
                ) : (
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>{isAuthorizing ? '正在連線至 Google 授權...' : '使用 Google 帳戶登入 / 註冊'}</span>
              </button>

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                初次登入將自動建立專屬帳號；已有帳號將自動載入您的學習紀錄與資料。
              </p>
            </div>
          </div>
        ) : (
          /* Logged In View */
          <div>
            {/* Tabs - Requirement 3: 左右二側增加 < > 左右箭頭符號，可以用點選方式將標籤向左或右移動 */}
            <div className="flex items-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-1 pt-1.5 gap-1">
              <button
                type="button"
                onClick={() => handleScrollTabs('left')}
                className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
                title="向左移動標籤"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div
                ref={tabsContainerRef}
                className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-none scroll-smooth px-1 text-xs"
              >
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`pb-2 px-1 font-bold border-b-2 shrink-0 transition-colors ${
                    activeTab === 'profile'
                      ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400'
                  }`}
                >
                  自我介紹
                </button>
                <button
                  onClick={() => setActiveTab('ratings')}
                  className={`pb-2 px-1 font-bold border-b-2 shrink-0 transition-colors ${
                    activeTab === 'ratings'
                      ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400'
                  }`}
                >
                  評價
                </button>
                <button
                  onClick={() => setActiveTab('comments')}
                  className={`pb-2 px-1 font-bold border-b-2 shrink-0 transition-colors ${
                    activeTab === 'comments'
                      ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400'
                  }`}
                >
                  心得
                </button>
                <button
                  onClick={() => setActiveTab('listening')}
                  className={`pb-2 px-1 font-bold border-b-2 shrink-0 transition-colors flex items-center gap-1 ${
                    activeTab === 'listening'
                      ? 'border-rose-500 text-rose-600 dark:text-rose-400'
                      : 'border-transparent text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>學習進度</span>
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

            <div className="p-4 sm:p-5  overflow-y-auto space-y-3.5 text-xs">
              {/* TAB 1: Profile & Edit Fields */}
              {activeTab === 'profile' && (
                <div className="space-y-3">
                  {!isEditing ? (
                    <div className="space-y-3">
                      {/* Avatar Card with Prominent Top Edit Button (Requirement 1) */}
                      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-3.5 border border-slate-200/60 dark:border-slate-700/60 flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <div className="relative group shrink-0">
                            <img
                              src={currentUser.avatar}
                              alt={currentUser.name}
                              className="w-14 h-14 rounded-2xl object-cover border-2 border-white dark:border-slate-700 shadow-2xs"
                            />
                            {/* Fast upload trigger */}
                            <button
                              type="button"
                              onClick={() => setIsCropModalOpen(true)}
                              title="上傳並裁切大頭照 (本月限5次)"
                              className="absolute -bottom-1 -right-1 p-1 rounded-full bg-rose-500 text-white shadow-xs hover:scale-110 transition-transform"
                            >
                              <Camera className="w-3 h-3" />
                            </button>
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
                                {organizationDisplayName || currentUser.name}
                              </h3>
                              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                                {effectiveMemberRank(currentUser)}
                              </span>
                              {currentUser.isContributor && (
                                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                                  貢獻者
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">{currentUser.email}</p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 font-medium">
                              直銷商編號: {currentUser.amwayId || '未填寫'} • 居住: {currentUser.residence || '未填寫'} • 中心: {currentUser.center || '無'}
                            </p>
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              本月頭像更換: {currentUploadCount} / 5 次 • 本月資料修改: {currentProfileEditCount} / 5 次
                            </p>
                          </div>
                        </div>

                        {/* Item 5 & Item 1: 匯出個人圖卡 與 修改按鈕 */}
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={handleExportCard}
                            disabled={isExportingCard}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-bold text-xs flex items-center gap-1.5 shadow-2xs hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                            title="匯出黑白緊密排版之個人圖卡並呼叫行動裝置分享選單"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{isExportingCard ? '產生中...' : '匯出個人圖卡'}</span>
                          </button>


                        </div>
                      </div>

                      {/* Profile Details Grid (Requirement 20: 出生日期、手機旁邊備註「隱私不公開」) */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">Email</span>
                            <span className="text-[9px] text-slate-400 font-medium">不列入完善獎勵判定</span>
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 break-all">
                            {currentUser.email || '未填寫'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">初次如何認識安麗？</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {currentUser.joinReason || '事業'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">什麼原因留在安麗？</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {currentUser.stayReason || '打造自己的事業與團隊'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">推薦人</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {currentUser.sponsor || '未填寫'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">上手白金</span>
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate block">
                            {currentUser.platinumUpline || '-'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700"><span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">上手鑽石</span><span className="font-semibold text-slate-800 dark:text-slate-200">{currentUser.diamondUpline || '-'}</span></div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold">西元生日</span>
                            <span className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">隱私不公開</span>
                          </div>
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {currentUser.birthday || '未填寫'}
                          </span>
                        </div>
                        <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-semibold">星座 · 天賦數 · 命數</span>
                          <span className="font-semibold text-black dark:text-white font-mono">
                            {numResult?.zodiac} · {numResult?.talentNumber} · 命數{numResult?.lifeNumber}
                          </span>
                        </div>
                      </div>

                      {/* Instant live 9-grid preview in tab 1 */}
                      <div className="pt-1">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          九宮格生命靈數速覽
                        </span>
                        <NumerologyGrid birthday={currentUser.birthday || ''} />
                      </div>
                    </div>
                  ) : (
                    /* Edit Form with Prominent Top Save Button (Requirement 1) */
                    <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200/70 dark:border-slate-700 space-y-3">
                      {/* Top Action Bar with 儲存按鈕 */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60 dark:border-slate-700">
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm block">
                            編輯個人基本資料
                          </span>
                          <span className="text-[10px] text-slate-500">
                            每月限修改 5 次 (已修改 {currentProfileEditCount}/5 次)
                          </span>
                        </div>


                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            姓名或暱稱
                          </label>
                          <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            直銷商編號
                          </label>
                          <input
                            type="text"
                            value={amwayId}
                            onChange={e => setAmwayId(e.target.value)}
                            placeholder="例：12345678"
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          />
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">Email <span className="text-[10px] text-slate-400 font-normal">（不列入完善獎勵判定）</span></label>
                          <input type="email" value={currentUser?.email || ''} disabled placeholder="未填寫" className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900/60 text-slate-500 cursor-not-allowed"/>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            居住地
                          </label>
                          <ThemedSelect
                            value={residence}
                            onChange={e => setResidence(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          >
                            {RESIDENCE_OPTIONS.map(c => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </ThemedSelect>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            直銷商中心
                          </label>
                          <ThemedSelect
                            value={center}
                            onChange={e => setCenter(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          >
                            {CENTER_OPTIONS.map(c => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </ThemedSelect>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            最高獎銜 <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">（需等人工審核）</span>
                          </label>
                          <ThemedSelect
                            value={rank}
                            onChange={e => setRank(e.target.value as AmwayRank)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          >
                            {RANK_ORDER.map(r => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </ThemedSelect>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            初次如何認識安麗？
                          </label>
                          <ThemedSelect
                            value={joinReason}
                            onChange={e => setJoinReason(e.target.value as JoinReason)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          >
                            {JOIN_REASONS.map(r => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </ThemedSelect>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            什麼原因留在安麗？
                          </label>
                          <ThemedSelect
                            value={stayReason}
                            onChange={e => setStayReason(e.target.value as StayReason)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          >
                            {STAY_REASONS.map(r => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </ThemedSelect>
                        </div>

                        <div><label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">推薦人</label><input type="text" autoComplete="off" value={sponsor} onChange={e=>setSponsor(e.target.value)} placeholder="輸入推薦人姓名" className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"/></div>
                        {/* 上手白金 with Autocomplete (Item 4) */}
                        <div className="relative">
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            上手白金 <span className="text-[10px] text-rose-600 dark:text-rose-400 font-normal">（填寫可以加速審核）</span>
                          </label>
                          <input
                            type="text"
                            value={platinumUpline}
                            onChange={e => {
                              setPlatinumUpline(e.target.value);
                              setActiveSuggestField('platinum');
                            }}
                            onFocus={() => setActiveSuggestField('platinum')}
                            placeholder="輸入或點選白金領袖..."
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          />
                          {activeSuggestField === 'platinum' && platinumSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 max-h-36 overflow-y-auto p-1 text-xs">
                              <div className="text-[10px] text-slate-400 px-2 py-0.5 font-bold">點選帶入上手白金：</div>
                              {platinumSuggestions.slice(0, 8).map((nameItem, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setPlatinumUpline(nameItem);
                                    setActiveSuggestField(null);
                                  }}
                                  className="w-full text-left px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                                >
                                  {nameItem}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* 上手鑽石 with Autocomplete (Item 4) */}
                        <div className="relative">
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                            上手鑽石 <span className="text-[10px] text-rose-600 dark:text-rose-400 font-normal">（填寫可以加速審核）</span>
                          </label>
                          <input
                            type="text"
                            value={diamondUpline}
                            onChange={e => {
                              setDiamondUpline(e.target.value);
                              setActiveSuggestField('diamond');
                            }}
                            onFocus={() => setActiveSuggestField('diamond')}
                            placeholder="輸入或點選鑽石領袖..."
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden"
                          />
                          {activeSuggestField === 'diamond' && diamondSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 max-h-36 overflow-y-auto p-1 text-xs">
                              <div className="text-[10px] text-slate-400 px-2 py-0.5 font-bold">點選帶入上手鑽石：</div>
                              {diamondSuggestions.slice(0, 8).map((nameItem, idx) => (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => {
                                    setDiamondUpline(nameItem);
                                    setActiveSuggestField(null);
                                  }}
                                  className="w-full text-left px-2 py-1 rounded-lg hover:bg-rose-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
                                >
                                  {nameItem}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Birthday (Requirement 20: 備註隱私不公開) */}
                        <div className="sm:col-span-2 bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-200 dark:border-slate-700">
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                            西元生日 (YYYY-MM-DD) <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal">(隱私不公開)</span>
                            <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400 ml-2">
                              (輸入時下方自動即時繪製九宮格，無需先按儲存)
                            </span>
                          </label>
                          <input
                            type="date"
                            value={birthday}
                            onChange={e => setBirthday(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-hidden mb-2"
                          />

                          {/* Live calculation stats */}
                          <div className="flex items-center gap-3 text-xs mb-2">
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              星座：<span className="text-rose-600 dark:text-rose-400 font-extrabold">{numResult?.zodiac || '-'}</span>
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              天賦數：<span className="text-emerald-600 dark:text-emerald-400 font-mono font-bold">{numResult?.talentNumber || '-'}</span>
                            </span>
                            <span className="font-bold text-slate-700 dark:text-slate-200">
                              命數：<span className="text-red-600 dark:text-red-400 font-mono font-bold">{numResult?.lifeNumber || '-'}</span>
                            </span>
                          </div>

                          <NumerologyGrid birthday={birthday} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: User Rated Tracks (Requirement 2 & 3: 一致規格、五顆星視覺、隨時可修評分、分類可點擊跳轉) */}
              {activeTab === 'ratings' && (
                <div className="space-y-2">
                  {userRatedTracks.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      您尚未對任何音檔留下星級評價
                    </div>
                  ) : (
                    userRatedTracks.map(({ track, rating }) => {
                      const categories = track.categories && track.categories.length > 0
                        ? track.categories
                        : track.category ? [track.category] : ['未分類'];

                      return (
                        <div
                          key={track.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 space-y-2 hover:border-rose-300 dark:hover:border-rose-900 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              onClick={() => {
                                onSelectTrack(track);
                                onClose();
                              }}
                              className="min-w-0 flex-1 cursor-pointer group"
                            >
                              <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate group-hover:text-[var(--color-primary,#c06c84)] transition-colors">
                                {track.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                主講：{track.speaker}{track.speakerRank ? ` · ${track.speakerRank}` : ''}
                              </p>
                            </div>

                            {/* Requirement 2: 星星直接顯示五顆星星的視覺，並且可以隨時修正評價分數 */}
                            <div className="flex items-center gap-0.5 shrink-0 bg-white dark:bg-slate-900 px-2 py-1 rounded-xl border border-slate-200/50 dark:border-slate-700 shadow-2xs">
                              {[1, 2, 3, 4, 5].map(star => (
                                <button
                                  key={star}
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    if (onRateTrack) {
                                      onRateTrack(track.id, rating === star ? 0 : star);
                                    }
                                  }}
                                  className="p-0.5 hover:scale-125 transition-transform"
                                  title={`評為 ${star} 星，再次點擊取消`}
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      star <= (rating || 0)
                                        ? 'fill-amber-400 text-amber-400'
                                        : 'text-slate-300 dark:text-slate-600'
                                    }`}
                                  />
                                </button>
                              ))}
                              <span className="text-[11px] font-bold text-amber-600 dark:text-amber-400 ml-1 font-mono">
                                {rating && rating > 0 ? `${rating}星` : '未評'}
                              </span>
                            </div>
                          </div>

                          {/* Requirement 3: 分類（此處的分類可以點選，直接跳轉該分類清單） */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[10px] text-slate-400">分類：</span>
                            {categories.map((cat, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (onSelectCategory) {
                                    onSelectCategory(cat as CategoryType);
                                    onClose();
                                  }
                                }}
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] hover:brightness-95 transition-all font-semibold"
                                title={`點擊跳轉至 ${cat} 分類清單`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 3: User Comments (Requirement 3: 與已評價規格完全一致，分類可點擊跳轉) */}
              {activeTab === 'comments' && (
                <div className="space-y-2">
                  {userComments.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      您尚未在任何演講下留下心得
                    </div>
                  ) : (
                    userComments.map(c => {
                      const foundTrack = tracks.find(t => t.id === c.trackId);
                      const trackTitle = foundTrack?.title || '演講錄音檔';
                      const speaker = foundTrack?.speaker || '繁星講師';
                      const speakerRank = foundTrack?.speakerRank || '';
                      const categories = foundTrack?.categories && foundTrack.categories.length > 0
                        ? foundTrack.categories
                        : foundTrack?.category ? [foundTrack.category] : ['未分類'];

                      return (
                        <div
                          key={c.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 space-y-2 hover:border-rose-300 dark:hover:border-rose-900 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div
                              onClick={() => {
                                if (foundTrack) {
                                  onSelectTrack(foundTrack);
                                  onClose();
                                }
                              }}
                              className="min-w-0 flex-1 cursor-pointer group"
                            >
                              <h4 className="font-bold text-xs sm:text-sm text-slate-800 dark:text-slate-100 truncate group-hover:text-[var(--color-primary,#c06c84)] transition-colors">
                                {trackTitle}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                主講：{speaker}{speakerRank ? ` · ${speakerRank}` : ''}
                              </p>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono shrink-0">
                              {c.timestamp}
                            </span>
                          </div>

                          {/* Requirement 3: 分類（此處的分類可以點選，直接跳轉該分類清單） */}
                          <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                            <span className="text-[10px] text-slate-400">分類：</span>
                            {categories.map((cat, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  if (onSelectCategory) {
                                    onSelectCategory(cat as CategoryType);
                                    onClose();
                                  }
                                }}
                                className="text-[10px] px-2 py-0.5 rounded-lg bg-[var(--color-light-pill,#fae8ed)] text-[var(--color-primary,#c06c84)] border border-[var(--theme-border-subtle,#f1e7ea)] hover:brightness-95 transition-all font-semibold"
                                title={`點擊跳轉至 ${cat} 分類清單`}
                              >
                                {cat}
                              </button>
                            ))}
                          </div>

                          <CollapsibleCommentText
                            className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-xl border border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap"
                            resetKey={`${c.id}:${c.content}`}
                          >
                            {c.replyToAuthor && (
                              <span className="text-[11px] text-[var(--color-primary,#c06c84)] font-bold mr-1">
                                回覆 @{c.replyToAuthor}：
                              </span>
                            )}
                            {c.content}
                          </CollapsibleCommentText>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* TAB 4: 已聆聽音檔清單 (Requirement 7: 修復此頁空白問題) */}
              {activeTab === 'listening' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={handleClearHistory}
                      disabled={isClearingHistory || userListenedItems.length === 0}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-300 text-[11px] font-bold hover:bg-rose-50 dark:hover:bg-rose-950/50 disabled:opacity-40"
                      title="清除雲端與此裝置的聆聽進度紀錄"
                    >
                      {isClearingHistory ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      <span>{isClearingHistory ? '清除中…' : '清除紀錄'}</span>
                    </button>
                  </div>
                  {isLoadingRecords ? (
                    <div className="text-center py-8 text-slate-400 flex items-center justify-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--color-primary,#c06c84)]" />
                      <span>載入聆聽紀錄中...</span>
                    </div>
                  ) : userListenedItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">目前尚無已記錄的聆聽音檔</div>
                  ) : (
                    userListenedItems.map(({ track, record, isDeleted }) => {
                      const isCompleted = (record.progressPercent || 0) > 95 || !!record.completed;
                      return (
                        <div
                          key={track.id}
                          className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold text-xs sm:text-sm text-slate-900 dark:text-slate-100 truncate">
                                {track.title}
                              </p>
                              <p className="text-[10px] text-slate-500">
                                主講：{track.speaker}{track.speakerRank ? `·${track.speakerRank}` : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isCompleted ? (
                                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>已聽完 ({record.finishDate || record.lastListenDate})</span>
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 text-[10px] font-bold">
                                  進度 {record.progressPercent || 0}%
                                </span>
                              )}
                              {isDeleted ? (
                                <span className="px-2.5 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold text-[10px]">
                                  檔案已刪除
                                </span>
                              ) : (
                                <button
                                  onClick={() => {
                                    onSelectTrack(track);
                                    onClose();
                                  }}
                                  className="px-2.5 py-0.5 rounded-lg text-white font-bold text-[10px] shadow-2xs hover:opacity-90"
                                  style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                                >
                                  播放
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-1 p-2 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-700/60 text-[10px]">
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

                          {(record.rating !== undefined || record.comment) && (
                            <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-700 flex flex-col gap-1 text-[11px]">
                              {record.rating !== undefined && record.rating > 0 && (
                                <div className="flex items-center gap-1 text-amber-500">
                                  <span className="text-slate-400 text-[10px]">給予評分：</span>
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star
                                      key={s}
                                      className={`w-3 h-3 ${
                                        s <= record.rating! ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                                      }`}
                                    />
                                  ))}
                                  <span className="font-bold ml-1">{record.rating} 星</span>
                                </div>
                              )}
                              {record.comment && (
                                <div className="text-slate-700 dark:text-slate-300 bg-white/70 dark:bg-slate-900/40 p-1.5 rounded-lg border border-slate-200/40 dark:border-slate-800">
                                  <span className="text-slate-400 text-[10px] block">個人心得：</span>
                                  <p className="italic text-xs mt-0.5">"{record.comment}"</p>
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
        )}
      </div>

      {/* Avatar Crop Modal */}
      <AvatarCropModal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={handleAvatarCropped}
        currentUploadCount={currentUploadCount}
        maxMonthlyUploads={5}
      />
    </div>
  );
};
