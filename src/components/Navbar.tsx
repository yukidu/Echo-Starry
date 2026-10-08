import { effectiveMemberRank } from '../utils/ranks';
import React, { useEffect, useRef, useState } from 'react';
import { Trophy, Home, BarChart3, Bell, User, UploadCloud, Settings, Palette, Moon, Sun, Mic, Menu, LogOut, Check, Download } from 'lucide-react';
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

export type NavTab = 'home' | 'stats' | 'notifications' | 'profile' | 'upload' | 'admin' | 'stickers' | 'install';

const USER_FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';
const QUICK_ACTION_ORDER: QuickActionId[] = [
  'font', 'theme', 'stats', 'notifications', 'stickers', 'upload', 'profile', 'install', 'admin', 'palette'
];

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
  const [quickPreferences, setQuickPreferences] = useState<QuickActionPreferences>(readLocalQuickPreferences);
  const [deviceKind, setDeviceKind] = useState<QuickDeviceKind>(getQuickDeviceKind);
  const [fontZoom, setFontZoom] = useState(readStoredFontZoom);
  const [quickSyncStatus, setQuickSyncStatus] = useState('');
  const cloudSaveTimerRef = useRef<number | null>(null);

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
  }, []);

  useEffect(() => {
    if (!currentUser?.id || typeof window === 'undefined') {
      setQuickSyncStatus('');
      return;
    }
    const sessionKey = `echostars_ui_prefs_loaded_v2:${currentUser.id}`;
    if (sessionStorage.getItem(sessionKey) === '1') {
      setQuickSyncStatus('已啟用跨裝置同步');
      return;
    }
    let cancelled = false;
    void fetchCloudQuickPreferences()
      .then(async cloud => {
        if (cancelled || cloud === undefined) return;
        sessionStorage.setItem(sessionKey, '1');
        if (cloud) {
          const next = normalizeQuickActionPreferences(cloud.quickActionIds);
          setQuickPreferences(next);
          writeLocalQuickPreferences(next);
          setQuickSyncStatus('已載入跨裝置設定');
          return;
        }
        const local = readLocalQuickPreferences();
        await saveCloudQuickPreferences(local);
        if (!cancelled) setQuickSyncStatus('已同步此裝置設定');
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
  };

  const handleRandomPalette = () => {
    onRandomPalette();
    setIsMobileMenuOpen(false);
  };

  const changeFontZoom = (delta: number) => {
    const next = Math.round(Math.min(1.4, Math.max(0.8, fontZoom + delta)) * 10) / 10;
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
    stickers: true,
    upload: canUpload,
    profile: true,
    install: true,
    admin: canAccessSettings,
    palette: true
  };

  const availableActionIds = QUICK_ACTION_ORDER.filter(id => actionAvailability[id]);
  const storedForDevice = quickPreferences[deviceKind] || [];
  const selectedQuickActionIds = storedForDevice.filter(id => availableActionIds.includes(id));
  const deviceLimit = quickActionLimitForDevice(deviceKind);
  const pinnedQuickActionIds = currentUser
    ? QUICK_ACTION_ORDER.filter(id => selectedQuickActionIds.includes(id) && actionAvailability[id])
    : (['font', 'theme'] as QuickActionId[]);

  const queueCloudSave = (next: QuickActionPreferences) => {
    if (!currentUser?.id) return;
    if (cloudSaveTimerRef.current !== null) window.clearTimeout(cloudSaveTimerRef.current);
    setQuickSyncStatus('同步中…');
    cloudSaveTimerRef.current = window.setTimeout(() => {
      void saveCloudQuickPreferences(next)
        .then(saved => {
          if (saved !== undefined) setQuickSyncStatus('已跨裝置同步');
        })
        .catch(error => {
          console.warn('Failed to save quick shortcut preferences:', error);
          setQuickSyncStatus('本機已儲存，稍後再同步');
        });
    }, 900);
  };

  const persistQuickPreferences = (next: QuickActionPreferences) => {
    const normalized = normalizeQuickActionPreferences(next);
    setQuickPreferences(normalized);
    writeLocalQuickPreferences(normalized);
    queueCloudSave(normalized);
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
        document.querySelector<HTMLButtonElement>('.echostars-install-menu-action')?.click();
      });
    });
  };

  const renderPinnedAction = (id: QuickActionId) => {
    if (id === 'font') {
      return (
        <div key={id} className="navbar-top-font-group" aria-label="文字大小">
          <button type="button" className={topButtonClass(false)} onClick={() => changeFontZoom(-0.1)} disabled={fontZoom <= 0.8} aria-label="縮小字體" title={`縮小字體（目前 ${Math.round(fontZoom * 100)}%）`}>
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
        <button key={id} type="button" className={topButtonClass(false)} onClick={onToggleTheme} title={isDark ? '切換淺色模式' : '切換深色模式'} aria-label={isDark ? '切換淺色模式' : '切換深色模式'} aria-pressed={isDark}>
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
      palette: { label: '切換配色', icon: <Palette className="w-4 h-4" />, onClick: handleRandomPalette }
    };
    const action = meta[id as Exclude<QuickActionId, 'font' | 'theme'>];
    return (
      <button key={id} type="button" className={topButtonClass(quickActionIsActive(id))} onClick={action.onClick} title={action.label} aria-label={action.label}>
        {action.icon}
        {id === 'notifications' && pendingNotificationsCount > 0 && (
          <span className="navbar-top-badge">{pendingNotificationsCount}</span>
        )}
      </button>
    );
  };

  const deviceLabel = deviceKind === 'mobile' ? '手機' : deviceKind === 'tablet' ? '平板' : '桌機';
  const limitLabel = deviceKind === 'desktop' ? '不限' : String(deviceLimit);

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
        {pinnedQuickActionIds.map(renderPinnedAction)}
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu-shell">
          <div className="mobile-menu-panel animate-in slide-in-from-top-2">
            <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 mb-1">
              <div className="font-black text-sm text-slate-800 dark:text-slate-100 truncate max-w-[18rem]">{displayName}</div>
              <div className="flex items-center justify-between gap-3 text-xs font-bold">
                <span style={{ color: 'var(--color-primary,#c06c84)' }}>{displayRole}</span>
                {currentUser && <span className="text-slate-400 dark:text-slate-500">{deviceLabel}置頂 {selectedQuickActionIds.length}/{limitLabel}</span>}
              </div>
              {currentUser && quickSyncStatus && <div className="mt-0.5 text-[10px] font-semibold text-slate-400 dark:text-slate-500">{quickSyncStatus}</div>}
            </div>

            <div className={menuRowClass(false)}>
              {renderPinControl('font', '文字大小')}
              <span className="w-4 shrink-0 text-center text-xs font-black">A</span>
              <span className="min-w-0 flex-1">文字大小</span>
              <button type="button" onClick={() => changeFontZoom(-0.1)} disabled={fontZoom <= 0.8} className="navbar-menu-mini-control" aria-label="縮小字體">A−</button>
              <span className="text-[10px] font-bold text-slate-400">{Math.round(fontZoom * 100)}%</span>
              <button type="button" onClick={() => changeFontZoom(0.1)} disabled={fontZoom >= 1.4} className="navbar-menu-mini-control" aria-label="放大字體">A＋</button>
            </div>

            <div className={menuRowClass(false)}>
              {renderPinControl('theme', '淺色／暗色切換')}
              <button type="button" onClick={onToggleTheme} className={menuActionClass}>
                {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
                <span className="min-w-0 flex-1">淺色／暗色切換</span>
                <span className="text-[10px] font-bold text-slate-400">目前{isDark ? '暗色' : '淺色'}</span>
              </button>
            </div>

            <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />

            <button onClick={handleLogoClick} className={menuRowClass(currentTab === 'home')}>
              <Home className="w-4 h-4 shrink-0" />
              <span>首頁播放清單</span>
            </button>

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

            <div className={menuRowClass(currentTab === 'stickers')}>
              {renderPinControl('stickers', '我的貼紙')}
              <button type="button" onClick={handleOpenStickers} className={menuActionClass}>
                <Trophy className="w-4 h-4 shrink-0" />
                <span>{currentUser ? <>我的貼紙 <span className="mobile-menu-accent-number sticker-menu-amount">{stickerBalanceText}</span> 張</> : stickerMenuTitle}</span>
              </button>
            </div>

            {canUpload && (
              <div className={menuRowClass(currentTab === 'upload')}>
                {renderPinControl('upload', '上傳音檔')}
                <button onClick={() => handleMobileNav('upload')} className={menuActionClass}>
                  <UploadCloud className="w-4 h-4 shrink-0" /><span>上傳音檔</span>
                </button>
              </div>
            )}

            <div className={menuRowClass(currentTab === 'profile')}>
              {renderPinControl('profile', '個人中心')}
              <button onClick={() => handleMobileNav('profile')} className={menuActionClass}>
                <User className="w-4 h-4 shrink-0" /><span>個人中心</span>
              </button>
            </div>

            <div className={menuRowClass(false)}>
              {renderPinControl('install', '安裝到桌面')}
              <InstallAppButton onOpenIOSGuide={handleInstallGuide} className="echostars-install-menu-action flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold py-0.5" />
            </div>

            {canAccessSettings && (
              <div className={menuRowClass(currentTab === 'admin')}>
                {renderPinControl('admin', '後台管理')}
                <button onClick={() => handleMobileNav('admin')} className={menuActionClass}>
                  <Settings className="w-4 h-4 shrink-0" /><span>後台管理</span>
                </button>
              </div>
            )}

            <div className={menuRowClass(false)}>
              {renderPinControl('palette', '切換配色')}
              <button type="button" onClick={handleRandomPalette} className={menuActionClass}>
                <Palette className="w-4 h-4 shrink-0" /><span>切換配色</span>
              </button>
            </div>

            {currentUser && (
              <>
                <div className="my-1 h-px bg-slate-200 dark:bg-slate-800" />
                <button type="button" onClick={handleLogout} className={menuRowClass(false)} title="登出目前帳號">
                  <LogOut className="w-4 h-4 shrink-0" /><span>登出</span>
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
};
