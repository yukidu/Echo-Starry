import { effectiveMemberRank } from '../utils/ranks';
import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Home, BarChart3, Bell, User, UploadCloud, Settings, Palette, Moon, Sun, Mic, Menu, LogOut, Check, Download, RotateCcw } from 'lucide-react';
import { UserProfile, RANK_ORDER } from '../types';
import { VisitorIdentity } from '../utils/visitor';
import { TwinklingStars } from './TwinklingStars';
import { InstallAppButton } from './InstallAppButton';
import {
  QuickActionId,
  QuickActionPreferences,
  QuickDeviceKind,
  fetchCloudQuickPreferences,
  getQuickDeviceKind,
  normalizeQuickActionPreferences,
  quickActionLimitForDevice,
  readLocalQuickPreferences,
  saveCloudQuickPreferences,
  writeLocalQuickPreferences
} from '../quickShortcutPreferences';
import './Navbar.css';
import './Navbar.v124.css';

export type NavTab = 'home' | 'stats' | 'notifications' | 'profile' | 'upload' | 'admin' | 'stickers' | 'install';

const USER_FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';
const QUICK_ACTION_ORDER: QuickActionId[] = [
  'font', 'theme', 'stats', 'notifications', 'stickers', 'upload', 'profile', 'admin', 'palette'
];
const QUICK_DRAG_HOLD_MS = 260;
const QUICK_DRAG_CANCEL_DISTANCE = 10;

function readStoredFontZoom() {
  if (typeof window === 'undefined') return 1;
  const value = Number(localStorage.getItem(USER_FONT_ZOOM_KEY));
  return Number.isFinite(value) ? Math.min(1.4, Math.max(1, value)) : 1;
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

interface QuickDragState {
  id: QuickActionId | null;
  pointerId: number | null;
  startX: number;
  startY: number;
  dragging: boolean;
  element: HTMLElement | null;
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
  const [quickPreferences, setQuickPreferences] = useState<QuickActionPreferences>(readLocalQuickPreferences);
  const [deviceKind, setDeviceKind] = useState<QuickDeviceKind>(getQuickDeviceKind);
  const [fontZoom, setFontZoom] = useState(readStoredFontZoom);
  const [draggingQuickActionId, setDraggingQuickActionId] = useState<QuickActionId | null>(null);
  const cloudSaveTimerRef = useRef<number | null>(null);
  const dragHoldTimerRef = useRef<number | null>(null);
  const suppressQuickClickUntilRef = useRef(0);
  const dragStateRef = useRef<QuickDragState>({
    id: null,
    pointerId: null,
    startX: 0,
    startY: 0,
    dragging: false,
    element: null
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.mainTab = currentTab;
    return () => {
      if (document.body.dataset.mainTab === currentTab) delete document.body.dataset.mainTab;
    };
  }, [currentTab]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncDeviceKind = () => setDeviceKind(getQuickDeviceKind());
    window.addEventListener('resize', syncDeviceKind);
    window.addEventListener('orientationchange', syncDeviceKind);
    return () => {
      window.removeEventListener('resize', syncDeviceKind);
      window.removeEventListener('orientationchange', syncDeviceKind);
    };
  }, []);

  useEffect(() => () => {
    if (cloudSaveTimerRef.current !== null) window.clearTimeout(cloudSaveTimerRef.current);
    if (dragHoldTimerRef.current !== null) window.clearTimeout(dragHoldTimerRef.current);
  }, []);

  useEffect(() => {
    if (!currentUser?.id || typeof window === 'undefined') return;
    const sessionKey = `echostars_ui_prefs_loaded_v2:${currentUser.id}`;
    if (sessionStorage.getItem(sessionKey) === '1') return;
    let cancelled = false;
    void fetchCloudQuickPreferences()
      .then(async cloud => {
        if (cancelled || cloud === undefined) return;
        sessionStorage.setItem(sessionKey, '1');
        if (cloud) {
          const next = normalizeQuickActionPreferences(cloud.quickActionIds);
          setQuickPreferences(next);
          writeLocalQuickPreferences(next);
          return;
        }
        const local = readLocalQuickPreferences();
        await saveCloudQuickPreferences(local);
      })
      .catch(error => {
        console.warn('Failed to hydrate quick shortcut preferences:', error);
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
  const stickerMenuTitle = currentUser ? `我的貼紙 ${stickerBalanceText} 張` : '我的貼紙';

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

  const identityAvatar = currentUser?.avatar?.trim() || (!currentUser ? visitor?.emoji || '🦁' : '👤');
  const identityAvatarIsImage = /^(?:https?:|data:|blob:|\/)/i.test(identityAvatar);
  const identityNameSize = Math.max(0.45, Math.min(1, 3 / Array.from(displayName).length));
  const identityRoleSize = Math.max(0.45, Math.min(0.75, 3 / Array.from(displayRole).length));

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
  const themeActionLabel = isDark ? '開燈' : '關燈';

  const menuRowClass = (active: boolean) => `mobile-menu-row flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
    active
      ? 'bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-800 font-bold'
      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

  const menuActionClass = 'flex min-w-0 flex-1 items-center gap-3 text-left py-0.5';

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
      // Switching to notifications must not mount the homepage first.
      // A single transition also avoids duplicate player/notification work.
      if (tab !== 'notifications' && currentTab !== 'home') onSelectTab('home');
      onSelectTab(tab);
    }
    setIsMobileMenuOpen(false);
  };

  const handleLogoClick = () => handleMobileNav('home');

  const handleMenuHomeRefresh = () => {
    setIsMobileMenuOpen(false);
    const onHomeUrl = window.location.pathname === '/' && !window.location.search && !window.location.hash;
    if (onHomeUrl) {
      window.location.reload();
      return;
    }
    window.location.assign('/');
  };

  const handleOpenStickers = () => {
    if (currentTab !== 'home') onSelectTab('home');
    onOpenStickers?.();
    setIsMobileMenuOpen(false);
  };

  const handleInstallGuide = () => {
    if (currentTab !== 'home') onSelectTab('home');
    setIsMobileMenuOpen(false);
    onInstallGuide?.();
  };

  const handleRandomPalette = () => {
    onRandomPalette();
  };

  const changeFontZoom = (delta: number) => {
    const next = Math.round(Math.min(1.4, Math.max(1, fontZoom + delta)) * 10) / 10;
    setFontZoom(next);
    try { localStorage.setItem(USER_FONT_ZOOM_KEY, String(next)); } catch {}
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

  const actionAvailability: Record<QuickActionId, boolean> = {
    font: true,
    theme: true,
    stats: true,
    notifications: Boolean(currentUser),
    stickers: Boolean(currentUser),
    upload: canUpload,
    profile: Boolean(currentUser),
    install: false,
    admin: canAccessSettings,
    palette: true
  };

  const availableActionIds = QUICK_ACTION_ORDER.filter(id => actionAvailability[id]);
  const storedForDevice = quickPreferences[deviceKind] || [];
  const selectedQuickActionIds = storedForDevice.filter(id => availableActionIds.includes(id));
  const deviceLimit = quickActionLimitForDevice(deviceKind);
  const pinnedQuickActionIds = currentUser
    ? selectedQuickActionIds.filter(id => actionAvailability[id])
    : (['font', 'theme'] as QuickActionId[]);

  const queueCloudSave = (next: QuickActionPreferences) => {
    if (!currentUser?.id) return;
    if (cloudSaveTimerRef.current !== null) window.clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = window.setTimeout(() => {
      void saveCloudQuickPreferences(next).catch(error => {
        console.warn('Failed to save quick shortcut preferences:', error);
      });
    }, 900);
  };

  const persistQuickPreferences = (next: QuickActionPreferences) => {
    const normalized = normalizeQuickActionPreferences(next);
    setQuickPreferences(normalized);
    writeLocalQuickPreferences(normalized);
    queueCloudSave(normalized);
  };

  const resetCurrentDeviceMenu = () => {
    if (!currentUser) return;
    persistQuickPreferences({ ...quickPreferences, [deviceKind]: ['font', 'theme'] });
  };

  const toggleQuickAction = (id: QuickActionId) => {
    if (!currentUser) return;
    const selected = [...selectedQuickActionIds];
    const nextSelected = selected.includes(id)
      ? selected.filter(item => item !== id)
      : selected.length < deviceLimit
      ? [...selected, id]
      : selected;
    persistQuickPreferences({ ...quickPreferences, [deviceKind]: nextSelected });
  };

  const reorderQuickAction = (fromId: QuickActionId, toId: QuickActionId) => {
    if (!currentUser || fromId === toId) return;
    const ordered = [...selectedQuickActionIds];
    const fromIndex = ordered.indexOf(fromId);
    const toIndex = ordered.indexOf(toId);
    if (fromIndex < 0 || toIndex < 0) return;
    ordered.splice(fromIndex, 1);
    ordered.splice(toIndex, 0, fromId);
    persistQuickPreferences({ ...quickPreferences, [deviceKind]: ordered });
  };

  const canShowPinControl = (id: QuickActionId) => {
    if (!currentUser) return false;
    return selectedQuickActionIds.includes(id) || selectedQuickActionIds.length < deviceLimit;
  };

  const renderPinControl = (id: QuickActionId, label: string) => {
    if (!currentUser) return null;
    if (!canShowPinControl(id)) return <span className="navbar-pin-placeholder" aria-hidden="true" />;
    const checked = selectedQuickActionIds.includes(id);
    return (
      <button
        type="button"
        className={`navbar-inline-pin ${checked ? 'is-selected' : ''}`}
        onClick={event => {
          event.stopPropagation();
          toggleQuickAction(id);
        }}
        aria-label={`${checked ? '取消置頂' : '置頂'}：${label}`}
        aria-pressed={checked}
        title={checked ? '取消顯示在置頂主選單' : '顯示在置頂主選單'}
      >
        {checked ? <Check className="w-3.5 h-3.5" /> : <span className="navbar-inline-pin-empty" />}
      </button>
    );
  };

  const quickActionIsActive = (id: QuickActionId) =>
    (id === 'stats' || id === 'notifications' || id === 'upload' || id === 'profile' || id === 'admin' || id === 'stickers') && currentTab === id;

  const handlePinnedInstall = () => {
    setIsMobileMenuOpen(true);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLButtonElement>('.navbar-menu-install-shortcut')?.click();
      });
    });
  };

  const renderPinnedAction = (id: QuickActionId) => {
    if (id === 'font') {
      return (
        <div className="navbar-top-font-group" aria-label="字體">
          <button type="button" className={topButtonClass(false)} onClick={() => changeFontZoom(-0.1)} disabled={fontZoom <= 1} aria-label="縮小字體" title={`縮小字體（目前 ${Math.round(fontZoom * 100)}%）`}>
            <span className="font-black text-xs">A−</span>
          </button>
          <button type="button" className={topButtonClass(false)} onClick={() => changeFontZoom(0.1)} disabled={fontZoom >= 1.4} aria-label="放大字體" title={`放大字體（目前 ${Math.round(fontZoom * 100)}%）`}>
            <span className="font-black text-xs">A＋</span>
          </button>
        </div>
      );
    }
    if (id === 'theme') {
      return (
        <button type="button" className={topButtonClass(false)} onClick={onToggleTheme} title={isDark ? '切換淺色模式' : '切換深色模式'} aria-label={isDark ? '切換淺色模式' : '切換深色模式'} aria-pressed={isDark}>
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      );
    }

    const meta: Record<Exclude<QuickActionId, 'font' | 'theme'>, { label: string; icon: React.ReactNode; onClick: () => void }> = {
      stats: { label: '排行榜', icon: <BarChart3 className="w-4 h-4" />, onClick: () => handleMobileNav('stats') },
      notifications: { label: '通知', icon: <Bell className="w-4 h-4" />, onClick: () => handleMobileNav('notifications') },
      stickers: { label: '我的貼紙', icon: <Trophy className="w-4 h-4" />, onClick: handleOpenStickers },
      upload: { label: '上傳音檔', icon: <UploadCloud className="w-4 h-4" />, onClick: () => handleMobileNav('upload') },
      profile: { label: '個人中心', icon: <User className="w-4 h-4" />, onClick: () => handleMobileNav('profile') },
      install: { label: '安裝到桌面', icon: <Download className="w-4 h-4" />, onClick: handlePinnedInstall },
      admin: { label: '後台管理', icon: <Settings className="w-4 h-4" />, onClick: () => handleMobileNav('admin') },
      palette: { label: '好心情', icon: <Palette className="w-4 h-4" />, onClick: handleRandomPalette }
    };
    const action = meta[id as Exclude<QuickActionId, 'font' | 'theme'>];
    return (
      <button type="button" className={topButtonClass(quickActionIsActive(id))} onClick={action.onClick} title={action.label} aria-label={action.label}>
        {action.icon}
        {id === 'notifications' && pendingNotificationsCount > 0 && (
          <span className="navbar-top-badge">{pendingNotificationsCount}</span>
        )}
      </button>
    );
  };

  const clearDragHoldTimer = () => {
    if (dragHoldTimerRef.current === null) return;
    window.clearTimeout(dragHoldTimerRef.current);
    dragHoldTimerRef.current = null;
  };

  const beginQuickActionDrag = (id: QuickActionId, event: React.PointerEvent<HTMLDivElement>) => {
    if (!currentUser) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    clearDragHoldTimer();
    const pointerId = event.pointerId;
    const element = event.currentTarget;
    dragStateRef.current = {
      id,
      pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      element
    };
    dragHoldTimerRef.current = window.setTimeout(() => {
      const state = dragStateRef.current;
      if (state.id !== id || state.pointerId !== pointerId) return;
      state.dragging = true;
      setDraggingQuickActionId(id);
      try { element.setPointerCapture(pointerId); } catch {}
      try { navigator.vibrate?.(12); } catch {}
    }, QUICK_DRAG_HOLD_MS);
  };

  const moveQuickActionDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (state.pointerId !== event.pointerId || !state.id) return;
    if (!state.dragging) {
      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
      if (distance > QUICK_DRAG_CANCEL_DISTANCE) clearDragHoldTimer();
      return;
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-quick-action-id]');
    const targetId = target?.dataset.quickActionId as QuickActionId | undefined;
    if (targetId && targetId !== state.id) reorderQuickAction(state.id, targetId);
  };

  const endQuickActionDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (state.pointerId !== event.pointerId) return;
    clearDragHoldTimer();
    if (state.dragging) {
      suppressQuickClickUntilRef.current = Date.now() + 500;
      try { state.element?.releasePointerCapture(event.pointerId); } catch {}
    }
    dragStateRef.current = {
      id: null,
      pointerId: null,
      startX: 0,
      startY: 0,
      dragging: false,
      element: null
    };
    setDraggingQuickActionId(null);
  };

  const cancelQuickActionHold = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = dragStateRef.current;
    if (state.pointerId === event.pointerId && !state.dragging) clearDragHoldTimer();
  };

  const renderPinnedActionSlot = (id: QuickActionId) => (
    <div
      key={id}
      className={`navbar-top-action-slot ${draggingQuickActionId === id ? 'is-dragging' : ''}`}
      data-quick-action-id={id}
      onPointerDown={event => beginQuickActionDrag(id, event)}
      onPointerMove={moveQuickActionDrag}
      onPointerUp={endQuickActionDrag}
      onPointerCancel={endQuickActionDrag}
      onPointerLeave={cancelQuickActionHold}
      onClickCapture={event => {
        if (Date.now() < suppressQuickClickUntilRef.current) {
          event.preventDefault();
          event.stopPropagation();
        }
      }}
    >
      {renderPinnedAction(id)}
    </div>
  );

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 transition-colors shadow-xs relative">
      <TwinklingStars density="subtle" className="opacity-75 dark:opacity-90" />

      <div className="navbar-main-row relative z-10 w-full px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3">
        <button type="button" data-tutorial-target="home-logo" onClick={handleLogoClick} className="brand-logo-glow relative isolate flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5 text-left group focus:outline-hidden cursor-pointer" title="返回首頁播放清單（全部分類）">
          <div className="relative w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-2xl flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-105" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}>
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white transition-transform group-hover:scale-110" />
            <span className="absolute inset-0 rounded-2xl border-2 animate-ping" style={{ borderColor: 'var(--color-primary, #c06c84)' }} />
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="text-base sm:text-xl font-black tracking-wider echo-wave-text inline-flex items-baseline whitespace-nowrap shrink-0" style={{ color: 'var(--color-primary, #c06c84)' }}>繁星回聲</span>
            <div className="hidden sm:flex shrink-0 items-center gap-0.5 h-4 ml-0.5">
              <span className="w-0.5 rounded-full animate-[pulseWaveBar_1.2s_ease-in-out_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full animate-[pulseWaveBar_1.2s_ease-in-out_0.2s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full opacity-80 animate-[pulseWaveBar_1.2s_ease-in-out_0.4s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full opacity-60 animate-[pulseWaveBar_1.2s_ease-in-out_0.6s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
            </div>
          </div>
        </button>

        <button type="button" data-tutorial-target={!currentUser ? 'visitor-profile' : undefined} data-main-menu="hamburger" onClick={() => setIsMobileMenuOpen(open => !open)} className="relative shrink-0 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" title={isMobileMenuOpen ? '關閉主選單' : '開啟主選單'} aria-label="主選單" aria-expanded={isMobileMenuOpen}>
          <Menu className="w-6 h-6" />
          {pendingNotificationsCount > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center shadow-xs" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>{pendingNotificationsCount}</span>}
        </button>
      </div>

      <div data-echostars-top-toolbar="true" className="navbar-top-toolbar relative z-10 flex items-center justify-end gap-1" aria-label="置頂快捷功能">
        {pinnedQuickActionIds.map(renderPinnedActionSlot)}
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu-shell">
          <div className="mobile-menu-panel animate-in slide-in-from-top-2" data-react-menu="true" style={{ '--navbar-font-zoom': fontZoom, zoom: 1 / fontZoom } as React.CSSProperties}>
            <div className="navbar-menu-profile-head px-3 py-2 border-b border-slate-200 dark:border-slate-700 mb-1">
              <button type="button" onClick={() => handleMobileNav('profile')} className="navbar-menu-identity" aria-label={currentUser ? '開啟個人中心' : '登入繁星回聲'}>
                <span className="navbar-menu-identity-icon" aria-hidden="true">
                  {identityAvatarIsImage ? <img src={identityAvatar} alt="" /> : identityAvatar}
                </span>
                <span className="navbar-menu-identity-text">
                  <span className="navbar-menu-identity-name" style={{ fontSize: `${identityNameSize}rem` }} title={displayName}>{displayName}</span>
                  <span className="navbar-menu-identity-role" style={{ fontSize: `${identityRoleSize}rem` }}>{displayRole}</span>
                </span>
              </button>
              <div className="navbar-menu-header-actions">
                <button type="button" onClick={handleRandomPalette} className="navbar-menu-palette-shortcut" title="好心情" aria-label="好心情">
                  <Palette className="w-5 h-5 shrink-0" />
                  <span>好心情</span>
                </button>
                <button type="button" onClick={handleMenuHomeRefresh} className="navbar-menu-home-shortcut" title="回首頁並重新整理" aria-label="回首頁">
                  <Home className="w-4 h-4 shrink-0" />
                  <span>回首頁</span>
                </button>
              </div>
            </div>

            <div className={`${menuRowClass(false)} navbar-menu-install-row`}>
              <InstallAppButton onOpenIOSGuide={handleInstallGuide} className={menuActionClass} hideWhenInstalled />
            </div>

            <div className={`${menuRowClass(false)} navbar-menu-font-row`}>
              {renderPinControl('font', '字體')}
              <span className="w-4 shrink-0 text-center text-xs font-black">A</span>
              <span className="navbar-menu-font-label">字體</span>
              <div className="navbar-menu-font-controls">
                <button type="button" onClick={() => changeFontZoom(-0.1)} disabled={fontZoom <= 1} className="navbar-menu-mini-control" aria-label="縮小字體">A−</button>
                <span className="navbar-menu-font-value">{Math.round(fontZoom * 100)}%</span>
                <button type="button" onClick={() => changeFontZoom(0.1)} disabled={fontZoom >= 1.4} className="navbar-menu-mini-control" aria-label="放大字體">A＋</button>
              </div>
            </div>

            <div className={menuRowClass(false)}>
              {renderPinControl('theme', themeActionLabel)}
              <button type="button" onClick={onToggleTheme} className={menuActionClass}>
                {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                <span className="min-w-0 flex-1">{themeActionLabel}</span>
              </button>
            </div>

            <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

            <div className={menuRowClass(currentTab === 'stats')}>
              {renderPinControl('stats', '排行榜')}
              <button onClick={() => handleMobileNav('stats')} className={menuActionClass}>
                <BarChart3 className="w-4 h-4 shrink-0" /><span>排行榜</span>
              </button>
            </div>

            {currentUser && (
              <div className={menuRowClass(currentTab === 'notifications')}>
                {renderPinControl('notifications', '通知')}
                <button type="button" onClick={() => handleMobileNav('notifications')} className={menuActionClass}>
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>{canAudit ? <>通知 <span className="mobile-menu-accent-number">{pendingAuditCount}</span> 待審核</> : <>通知{pendingNotificationsCount > 0 && <> <span className="mobile-menu-accent-number">{pendingNotificationsCount}</span></>}</>}</span>
                </button>
              </div>
            )}

            {currentUser && (
            <div className={menuRowClass(currentTab === 'stickers')}>
              {renderPinControl('stickers', '我的貼紙')}
              <button type="button" onClick={handleOpenStickers} className={menuActionClass}>
                <Trophy className="w-4 h-4 shrink-0" />
                <span>{currentUser ? <>我的貼紙 <span className="mobile-menu-accent-number sticker-menu-amount">{stickerBalanceText}</span> 張</> : stickerMenuTitle}</span>
              </button>
            </div>

            )}

            {canUpload && (
              <div className={menuRowClass(currentTab === 'upload')}>
                {renderPinControl('upload', '上傳音檔')}
                <button onClick={() => handleMobileNav('upload')} className={menuActionClass}>
                  <UploadCloud className="w-4 h-4 shrink-0" /><span>上傳音檔</span>
                </button>
              </div>
            )}

            {currentUser && (
            <div className={menuRowClass(currentTab === 'profile')}>
              {renderPinControl('profile', '個人中心')}
              <button onClick={() => handleMobileNav('profile')} className={menuActionClass}>
                <User className="w-4 h-4 shrink-0" /><span>個人中心</span>
              </button>
            </div>

            )}

            {canAccessSettings && (
              <div className={menuRowClass(currentTab === 'admin')}>
                {renderPinControl('admin', '後台管理')}
                <button onClick={() => handleMobileNav('admin')} className={menuActionClass}>
                  <Settings className="w-4 h-4 shrink-0" /><span>後台管理</span>
                </button>
              </div>
            )}

            {
              <>
                <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
                <div className="navbar-menu-footer-actions">
                  {currentUser ? (
                    <button type="button" onClick={handleLogout} className="navbar-menu-footer-button" title="登出目前帳號">
                      <LogOut className="w-4 h-4 shrink-0" /><span>登出</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => handleMobileNav('profile')} className="navbar-menu-footer-button" title="登入 Google 帳號">
                      <User className="w-4 h-4 shrink-0" /><span>登入</span>
                    </button>
                  )}
                  {currentUser && (
                  <button type="button" onClick={resetCurrentDeviceMenu} className="navbar-menu-footer-button navbar-menu-reset-button" title="恢復此裝置的預設置頂選單">
                    <RotateCcw className="w-4 h-4 shrink-0" /><span>重設選單</span>
                  </button>
                  )}
                </div>
              </>
            }
          </div>
        </div>
      )}
    </header>
  );
};
