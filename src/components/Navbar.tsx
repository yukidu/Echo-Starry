import { effectiveMemberRank } from '../utils/ranks';
import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Home, BarChart3, Bell, User, UploadCloud, Settings, Palette, Moon, Sun, Mic, Menu, LogOut, Pin, GripVertical } from 'lucide-react';
import { UserProfile, RANK_ORDER } from '../types';
import { VisitorIdentity } from '../utils/visitor';
import { TwinklingStars } from './TwinklingStars';
import { InstallAppButton } from './InstallAppButton';
import {
  MAX_QUICK_ACTIONS,
  QuickActionId,
  QuickLabelMode,
  fetchCloudQuickPreferences,
  normalizeQuickActionIds,
  normalizeQuickLabelMode,
  readLocalQuickPreferences,
  saveCloudQuickPreferences,
  writeLocalQuickPreferences
} from '../quickShortcutPreferences';
import './Navbar.css';

export type NavTab = 'home' | 'stats' | 'notifications' | 'profile' | 'upload' | 'admin' | 'stickers' | 'install';

const USER_FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';

function readStoredFontZoom() {
  if (typeof window === 'undefined') return 1;
  const value = Number(localStorage.getItem(USER_FONT_ZOOM_KEY));
  return Number.isFinite(value) ? Math.min(1.4, Math.max(0.8, value)) : 1;
}

interface NavbarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onLogoClick?: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onRandomPalette: () => void;
  currentUser: UserProfile | null;
  isAdmin: boolean;
  canUpload?: boolean;
  pendingNotificationsCount?: number;
  pendingAuditCount?: number;
  stickerBalance?: number;
  onOpenStickers?: () => void;
  onInstallGuide?: () => void;
  visitor?: VisitorIdentity;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  onLogoClick,
  isDark,
  onToggleTheme,
  onRandomPalette,
  currentUser,
  isAdmin,
  canUpload = true,
  pendingNotificationsCount = 0,
  pendingAuditCount = 0,
  stickerBalance,
  onOpenStickers,
  onInstallGuide,
  visitor
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isQuickCustomizeOpen, setIsQuickCustomizeOpen] = useState(false);
  const [quickActionIds, setQuickActionIds] = useState<QuickActionId[]>(() => readLocalQuickPreferences().quickActionIds);
  const [quickLabelMode, setQuickLabelMode] = useState<QuickLabelMode>(() => readLocalQuickPreferences().quickLabelMode);
  const [fontZoom, setFontZoom] = useState(readStoredFontZoom);
  const [draggedQuickId, setDraggedQuickId] = useState<QuickActionId | null>(null);
  const [quickSyncStatus, setQuickSyncStatus] = useState('');
  const draggedQuickIdRef = useRef<QuickActionId | null>(null);
  const cloudSaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.mainTab = currentTab;
    return () => {
      if (document.body.dataset.mainTab === currentTab) delete document.body.dataset.mainTab;
    };
  }, [currentTab]);

  useEffect(() => {
    return () => {
      if (cloudSaveTimerRef.current !== null) window.clearTimeout(cloudSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!currentUser?.id || typeof window === 'undefined') {
      setQuickSyncStatus(currentUser ? '' : '訪客設定只儲存在此裝置');
      return;
    }
    const sessionKey = `echostars_ui_prefs_loaded_v1:${currentUser.id}`;
    if (sessionStorage.getItem(sessionKey) === '1') {
      setQuickSyncStatus('會員快捷設定已啟用跨裝置同步');
      return;
    }
    let cancelled = false;
    void fetchCloudQuickPreferences()
      .then(async cloud => {
        if (cancelled || cloud === undefined) return;
        sessionStorage.setItem(sessionKey, '1');
        if (cloud) {
          const ids = normalizeQuickActionIds(cloud.quickActionIds);
          const mode = normalizeQuickLabelMode(cloud.quickLabelMode);
          setQuickActionIds(ids);
          setQuickLabelMode(mode);
          writeLocalQuickPreferences(ids, mode);
          setQuickSyncStatus('已載入跨裝置快捷設定');
          return;
        }
        const local = readLocalQuickPreferences();
        if (local.quickActionIds.length > 0 || local.quickLabelMode !== 'icons') {
          await saveCloudQuickPreferences(local.quickActionIds, local.quickLabelMode);
          if (!cancelled) setQuickSyncStatus('已將此裝置設定同步到會員帳號');
        } else if (!cancelled) {
          setQuickSyncStatus('會員快捷設定已啟用跨裝置同步');
        }
      })
      .catch(error => {
        console.warn('Failed to hydrate quick shortcut preferences:', error);
        if (!cancelled) setQuickSyncStatus('目前使用本機設定');
      });
    return () => { cancelled = true; };
  }, [currentUser?.id]);

  const cleanEmail = currentUser?.email?.toLowerCase().trim();
  const isSuperAdmin = isAdmin || cleanEmail === 'yukidu@gmail.com' || currentUser?.role === '超級管理員';
  const isAdministrator = currentUser?.isAdminUser === true || currentUser?.role === '管理員' || currentUser?.role === '獎銜審核員';
  const canAudit = isSuperAdmin || isAdministrator || cleanEmail === 'yukidu@gmail.com' || currentUser?.role === '獎銜審核員' || currentUser?.isAdminUser === true;
  const stickerBalanceText = stickerBalance === undefined
    ? '…'
    : (Number.isInteger(stickerBalance) ? String(stickerBalance) : stickerBalance.toFixed(1));
  const stickerMenuTitle = currentUser ? `我的貼紙 ${stickerBalanceText} 張` : '我的貼紙(會員專屬)';

  const displayName = currentUser?.name || visitor?.fullName || '勇敢的獅子';
  const displayRole = !currentUser
    ? '訪客'
    : isSuperAdmin
    ? '超級管理員'
    : isAdministrator
    ? '管理員'
    : currentUser.isContributor
    ? '貢獻者'
    : effectiveMemberRank(currentUser, '會員');

  const userRank = currentUser ? effectiveMemberRank(currentUser, '') : '';
  const isDiamondOrAbove = isAdministrator || isSuperAdmin || userRank.includes('鑽石') || userRank.includes('皇冠') || userRank.includes('大使');
  const isPlatinumOrAbove = isDiamondOrAbove || (() => {
    if (!userRank) return false;
    if (
      userRank.includes('白金') ||
      userRank.includes('翡翠') ||
      userRank.includes('明珠') ||
      userRank.includes('紅寶石') ||
      userRank.includes('藍寶石')
    ) return true;
    const idx = (RANK_ORDER as readonly string[]).indexOf(userRank);
    return idx >= 26;
  })();
  const isContributor = currentUser?.isContributor === true;
  const canAccessSettings = isSuperAdmin || isAdministrator || isPlatinumOrAbove || isContributor;

  const mobileRowClass = (active: boolean) => `mobile-menu-row flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
    active
      ? 'bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-800 font-bold'
      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

  const topButtonClass = (active = false) => `navbar-top-action ${
    active
      ? 'bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-700 text-[var(--color-primary,#c06c84)]'
      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
  }`;

  const handleMobileNav = (tab: NavTab) => {
    if (tab === 'home') {
      if (onLogoClick) onLogoClick();
      else onSelectTab('home');
    } else {
      if (currentTab !== 'home') onSelectTab('home');
      onSelectTab(tab);
    }
    setIsMobileMenuOpen(false);
  };

  const handleLogoClick = () => handleMobileNav('home');

  const handleOpenStickers = () => {
    if (currentTab !== 'home') onSelectTab('home');
    onOpenStickers?.();
    setIsMobileMenuOpen(false);
  };

  const handleInstallGuide = () => {
    if (currentTab !== 'home') onSelectTab('home');
    onInstallGuide?.();
    setIsMobileMenuOpen(false);
  };

  const handleRandomPalette = () => {
    onRandomPalette();
    setIsMobileMenuOpen(false);
  };

  const handleToggleTheme = () => {
    onToggleTheme();
    setIsMobileMenuOpen(false);
  };

  const changeFontZoom = (delta: number) => {
    const next = Math.round(Math.min(1.4, Math.max(0.8, fontZoom + delta)) * 10) / 10;
    setFontZoom(next);
    try {
      localStorage.setItem(USER_FONT_ZOOM_KEY, String(next));
    } catch {}
    window.dispatchEvent(new Event('resize'));
  };

  const handleLogout = () => {
    localStorage.removeItem('sq_current_user_v1');
    sessionStorage.removeItem('echostars_auth_session_checked_at');
    sessionStorage.removeItem('echostars_first_profile_edit_v1');
    sessionStorage.removeItem('echostars_first_profile_edit_opened_v1');
    setIsMobileMenuOpen(false);
    window.location.reload();
  };

  const quickActionOptions: Array<{
    id: QuickActionId;
    label: string;
    available: boolean;
    icon: React.ReactNode;
    onClick: () => void;
  }> = [
    { id: 'home', label: '首頁播放清單', available: true, icon: <Home className="w-4 h-4" />, onClick: handleLogoClick },
    { id: 'stats', label: '排行榜', available: true, icon: <BarChart3 className="w-4 h-4" />, onClick: () => handleMobileNav('stats') },
    { id: 'notifications', label: '通知', available: Boolean(currentUser), icon: <Bell className="w-4 h-4" />, onClick: () => handleMobileNav('notifications') },
    { id: 'stickers', label: '我的貼紙', available: true, icon: <Trophy className="w-4 h-4" />, onClick: handleOpenStickers },
    { id: 'upload', label: '上傳音檔', available: canUpload, icon: <UploadCloud className="w-4 h-4" />, onClick: () => handleMobileNav('upload') },
    { id: 'profile', label: '個人中心', available: true, icon: <User className="w-4 h-4" />, onClick: () => handleMobileNav('profile') },
    { id: 'admin', label: '後台管理', available: canAccessSettings, icon: <Settings className="w-4 h-4" />, onClick: () => handleMobileNav('admin') },
    { id: 'palette', label: '切換配色', available: true, icon: <Palette className="w-4 h-4" />, onClick: handleRandomPalette }
  ];

  const availableQuickActions = quickActionOptions.filter(option => option.available);
  const visibleQuickActionIds = quickActionIds
    .filter(id => availableQuickActions.some(option => option.id === id))
    .slice(0, MAX_QUICK_ACTIONS);
  const pinnedQuickActions = visibleQuickActionIds
    .map(id => availableQuickActions.find(option => option.id === id))
    .filter((option): option is NonNullable<typeof option> => Boolean(option));

  const queueCloudSave = (ids: QuickActionId[], mode: QuickLabelMode) => {
    if (!currentUser?.id) return;
    if (cloudSaveTimerRef.current !== null) window.clearTimeout(cloudSaveTimerRef.current);
    setQuickSyncStatus('跨裝置同步中…');
    cloudSaveTimerRef.current = window.setTimeout(() => {
      void saveCloudQuickPreferences(ids, mode)
        .then(saved => {
          if (saved !== undefined) setQuickSyncStatus('已跨裝置同步');
        })
        .catch(error => {
          console.warn('Failed to save quick shortcut preferences:', error);
          setQuickSyncStatus('本機已儲存，雲端同步稍後再試');
        });
    }, 900);
  };

  const persistQuickPreferences = (ids: QuickActionId[], mode: QuickLabelMode, sync = true) => {
    const normalizedIds = normalizeQuickActionIds(ids);
    const normalizedMode = normalizeQuickLabelMode(mode);
    setQuickActionIds(normalizedIds);
    setQuickLabelMode(normalizedMode);
    writeLocalQuickPreferences(normalizedIds, normalizedMode);
    if (sync) queueCloudSave(normalizedIds, normalizedMode);
  };

  const toggleQuickAction = (id: QuickActionId) => {
    const selected = visibleQuickActionIds;
    if (selected.includes(id)) {
      persistQuickPreferences(selected.filter(item => item !== id), quickLabelMode);
      return;
    }
    if (selected.length >= MAX_QUICK_ACTIONS) return;
    persistQuickPreferences([...selected, id], quickLabelMode);
  };

  const reorderQuickAction = (source: QuickActionId, target: QuickActionId) => {
    if (source === target) return;
    const selected = [...visibleQuickActionIds];
    const from = selected.indexOf(source);
    const to = selected.indexOf(target);
    if (from < 0 || to < 0) return;
    selected.splice(from, 1);
    selected.splice(to, 0, source);
    persistQuickPreferences(selected, quickLabelMode);
  };

  const beginPointerDrag = (id: QuickActionId, event: React.PointerEvent<HTMLButtonElement>) => {
    draggedQuickIdRef.current = id;
    setDraggedQuickId(id);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePointerDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const source = draggedQuickIdRef.current;
    if (!source) return;
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-quick-sort-id]');
    const target = targetElement?.dataset.quickSortId as QuickActionId | undefined;
    if (target && target !== source) reorderQuickAction(source, target);
  };

  const endPointerDrag = () => {
    draggedQuickIdRef.current = null;
    setDraggedQuickId(null);
  };

  const quickActionIsActive = (id: QuickActionId) => id !== 'palette' && currentTab === id;

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 transition-colors shadow-xs relative">
      <TwinklingStars density="subtle" className="opacity-75 dark:opacity-90" />

      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-3">
        <button
          type="button"
          data-tutorial-target="home-logo"
          onClick={handleLogoClick}
          className="brand-logo-glow relative isolate flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5 text-left group focus:outline-hidden cursor-pointer"
          title="返回首頁播放清單（全部分類）"
        >
          <div
            className="relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-105"
            style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
          >
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white transition-transform group-hover:scale-110" />
            <span className="absolute inset-0 rounded-2xl border-2 animate-ping" style={{ borderColor: 'var(--color-primary, #c06c84)' }} />
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <span
              className="text-base sm:text-xl font-black tracking-wider echo-wave-text inline-flex items-baseline whitespace-nowrap shrink-0"
              style={{ color: 'var(--color-primary, #c06c84)' }}
            >
              繁星回聲
            </span>
            <div className="hidden sm:flex shrink-0 items-center gap-0.5 h-4 ml-0.5">
              <span className="w-0.5 rounded-full animate-[pulseWaveBar_1.2s_ease-in-out_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full animate-[pulseWaveBar_1.2s_ease-in-out_0.2s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full opacity-80 animate-[pulseWaveBar_1.2s_ease-in-out_0.4s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full opacity-60 animate-[pulseWaveBar_1.2s_ease-in-out_0.6s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
            </div>
          </div>
        </button>

        <button
          type="button"
          data-tutorial-target={!currentUser ? 'visitor-profile' : undefined}
          data-main-menu="hamburger"
          onClick={() => setIsMobileMenuOpen(open => !open)}
          className="relative shrink-0 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          title={isMobileMenuOpen ? '關閉主選單' : '開啟主選單'}
          aria-label="主選單"
          aria-expanded={isMobileMenuOpen}
        >
          <Menu className="w-6 h-6" />
          {pendingNotificationsCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center shadow-xs"
              style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}
            >
              {pendingNotificationsCount}
            </span>
          )}
        </button>
      </div>

      <div
        data-echostars-top-toolbar="true"
        className="navbar-top-toolbar relative z-10 max-w-4xl mx-auto px-3 sm:px-6 pb-2 flex items-center justify-end gap-1"
        aria-label="置頂快捷功能"
      >
        <button
          type="button"
          className={topButtonClass(false)}
          onClick={() => changeFontZoom(-0.1)}
          disabled={fontZoom <= 0.8}
          title={`縮小字體（目前 ${Math.round(fontZoom * 100)}%）`}
          aria-label="縮小字體"
        >
          <span className="font-black text-xs">A−</span>
        </button>
        <button
          type="button"
          className={topButtonClass(false)}
          onClick={() => changeFontZoom(0.1)}
          disabled={fontZoom >= 1.4}
          title={`放大字體（目前 ${Math.round(fontZoom * 100)}%）`}
          aria-label="放大字體"
        >
          <span className="font-black text-xs">A＋</span>
        </button>
        <button
          type="button"
          className={topButtonClass(false)}
          onClick={handleToggleTheme}
          title={isDark ? '切換淺色模式' : '切換深色模式'}
          aria-label={isDark ? '切換淺色模式' : '切換深色模式'}
          aria-pressed={isDark}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {pinnedQuickActions.length > 0 && <span className="navbar-top-toolbar-divider" aria-hidden="true" />}

        {pinnedQuickActions.map(action => (
          <button
            key={action.id}
            type="button"
            className={`${topButtonClass(quickActionIsActive(action.id))} navbar-top-quick-action ${quickLabelMode === 'labels' ? 'navbar-top-action-with-label' : ''}`}
            onClick={action.onClick}
            title={action.label}
            aria-label={action.label}
          >
            {action.icon}
            {quickLabelMode === 'labels' && <span className="navbar-top-action-label">{action.label}</span>}
          </button>
        ))}
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu-shell">
          <div className="mobile-menu-panel animate-in slide-in-from-top-2">
            <span data-echostars-font-control="moved-to-toolbar" hidden aria-hidden="true" />

            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 mb-1">
              <div className="font-black text-sm text-slate-800 dark:text-slate-100 truncate max-w-[18rem]">{displayName}</div>
              <div className="text-xs font-bold" style={{ color: 'var(--color-primary,#c06c84)' }}>{displayRole}</div>
            </div>

            <button onClick={handleLogoClick} className={mobileRowClass(currentTab === 'home')}>
              <Home className="w-4 h-4 shrink-0" />
              <span>首頁播放清單</span>
            </button>

            <button onClick={() => handleMobileNav('stats')} className={mobileRowClass(currentTab === 'stats')}>
              <BarChart3 className="w-4 h-4 shrink-0" />
              <span>排行榜</span>
            </button>

            {currentUser && (
              <button type="button" onClick={() => handleMobileNav('notifications')} className={mobileRowClass(currentTab === 'notifications')}>
                <Bell className="w-4 h-4 shrink-0" />
                <span>
                  {canAudit ? <>
                    通知 <span className="mobile-menu-accent-number">{pendingAuditCount}</span> 待審核
                  </> : <>
                    通知{pendingNotificationsCount > 0 && <> <span className="mobile-menu-accent-number">{pendingNotificationsCount}</span></>}
                  </>}
                </span>
              </button>
            )}

            <button type="button" onClick={handleOpenStickers} className={mobileRowClass(currentTab === 'stickers')}>
              <Trophy className="w-4 h-4 shrink-0" />
              <span>
                {currentUser ? <>
                  我的貼紙 <span className="mobile-menu-accent-number sticker-menu-amount">{stickerBalanceText}</span> 張
                </> : stickerMenuTitle}
              </span>
            </button>

            {canUpload && (
              <button onClick={() => handleMobileNav('upload')} className={mobileRowClass(currentTab === 'upload')}>
                <UploadCloud className="w-4 h-4 shrink-0" />
                <span>上傳音檔</span>
              </button>
            )}

            <button onClick={() => handleMobileNav('profile')} className={mobileRowClass(currentTab === 'profile')}>
              <User className="w-4 h-4 shrink-0" />
              <span>個人中心</span>
            </button>

            <InstallAppButton onOpenIOSGuide={handleInstallGuide} />

            {canAccessSettings && (
              <button onClick={() => handleMobileNav('admin')} className={mobileRowClass(currentTab === 'admin')}>
                <Settings className="w-4 h-4 shrink-0" />
                <span>後台管理</span>
              </button>
            )}

            <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

            <button
              type="button"
              onClick={() => setIsQuickCustomizeOpen(open => !open)}
              className={mobileRowClass(false)}
              aria-expanded={isQuickCustomizeOpen}
              title="最多選擇三個常用功能顯示在置頂主選單"
            >
              <Pin className="w-4 h-4 shrink-0" />
              <span className="mr-auto">自訂置頂功能</span>
              <span className="mobile-menu-accent-number">{visibleQuickActionIds.length}/{MAX_QUICK_ACTIONS}</span>
            </button>

            {isQuickCustomizeOpen && (
              <div className="navbar-quick-customizer px-2 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                <div className="navbar-drag-tip mb-2 rounded-lg px-2 py-2 text-[11px] font-black whitespace-normal" role="note">
                  <span aria-hidden="true">☝️</span> 已選功能可按住左側 <GripVertical className="inline w-3.5 h-3.5 align-[-2px]" /> 拖曳排序，手機、平板、電腦都可以。
                </div>

                <div className="mb-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 p-2">
                  <div className="mb-1.5 text-[11px] font-black text-slate-600 dark:text-slate-300">置頂顯示方式</div>
                  <div className="grid grid-cols-2 gap-1" role="group" aria-label="置頂快捷顯示方式">
                    <button
                      type="button"
                      onClick={() => persistQuickPreferences(visibleQuickActionIds, 'icons')}
                      className={`rounded-lg px-2 py-1.5 text-xs font-bold border ${quickLabelMode === 'icons' ? 'border-[var(--color-primary,#c06c84)] bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-700' : 'border-slate-200 dark:border-slate-700'}`}
                      aria-pressed={quickLabelMode === 'icons'}
                    >
                      只有圖示
                    </button>
                    <button
                      type="button"
                      onClick={() => persistQuickPreferences(visibleQuickActionIds, 'labels')}
                      className={`rounded-lg px-2 py-1.5 text-xs font-bold border ${quickLabelMode === 'labels' ? 'border-[var(--color-primary,#c06c84)] bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-700' : 'border-slate-200 dark:border-slate-700'}`}
                      aria-pressed={quickLabelMode === 'labels'}
                    >
                      圖示＋文字
                    </button>
                  </div>
                </div>

                {visibleQuickActionIds.length > 0 && (
                  <div className="mb-2 space-y-1" aria-label="已置頂功能排序">
                    <div className="px-1 text-[11px] font-black text-slate-500 dark:text-slate-400">已置頂（拖曳調整順序）</div>
                    {visibleQuickActionIds.map(id => {
                      const action = availableQuickActions.find(option => option.id === id);
                      if (!action) return null;
                      return (
                        <div
                          key={id}
                          data-quick-sort-id={id}
                          draggable
                          onDragStart={() => { draggedQuickIdRef.current = id; setDraggedQuickId(id); }}
                          onDragOver={event => {
                            event.preventDefault();
                            const source = draggedQuickIdRef.current;
                            if (source) reorderQuickAction(source, id);
                          }}
                          onDragEnd={endPointerDrag}
                          className={`navbar-quick-sort-row flex items-center gap-2 rounded-lg border px-1.5 py-1.5 bg-white dark:bg-slate-800 ${draggedQuickId === id ? 'is-dragging' : ''}`}
                        >
                          <button
                            type="button"
                            className="navbar-drag-handle shrink-0 rounded-md p-1.5"
                            aria-label={`按住拖曳排序：${action.label}`}
                            title="按住拖曳排序"
                            onPointerDown={event => beginPointerDrag(id, event)}
                            onPointerMove={movePointerDrag}
                            onPointerUp={endPointerDrag}
                            onPointerCancel={endPointerDrag}
                          >
                            <GripVertical className="w-4 h-4" />
                          </button>
                          <span className="shrink-0">{action.icon}</span>
                          <span className="min-w-0 flex-1 truncate text-xs font-bold">{action.label}</span>
                          <button
                            type="button"
                            className="shrink-0 rounded-md px-2 py-1 text-xs font-black"
                            onClick={() => toggleQuickAction(id)}
                            aria-label={`取消置頂：${action.label}`}
                            title="取消置頂"
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-1.5">
                  {availableQuickActions.filter(action => !visibleQuickActionIds.includes(action.id)).map(action => {
                    const disabled = visibleQuickActionIds.length >= MAX_QUICK_ACTIONS;
                    return (
                      <button
                        key={action.id}
                        type="button"
                        onClick={() => toggleQuickAction(action.id)}
                        disabled={disabled}
                        className="flex min-w-0 items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/70 px-2 py-2 text-xs font-bold transition-colors disabled:opacity-40"
                        title={disabled ? '已選滿三個，請先取消一個' : `置頂：${action.label}`}
                      >
                        <span className="shrink-0">{action.icon}</span>
                        <span className="truncate">{action.label}</span>
                        <span className="ml-auto shrink-0" aria-hidden="true">＋</span>
                      </button>
                    );
                  })}
                </div>

                <p className="px-1 pt-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 whitespace-normal">
                  {quickSyncStatus || (currentUser ? '會員快捷設定會跨裝置同步' : '訪客設定只儲存在此裝置')}
                </p>
              </div>
            )}

            <button type="button" onClick={handleRandomPalette} className={mobileRowClass(false)}>
              <Palette className="w-4 h-4 shrink-0" />
              <span>切換配色</span>
            </button>

            {currentUser && (
              <>
                <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
                <button type="button" onClick={handleLogout} className={mobileRowClass(false)} title="登出目前帳號">
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span>登出</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};