import { effectiveMemberRank } from '../utils/ranks';
import React, { useEffect, useState } from 'react';
import { Trophy, Home, BarChart3, Bell, User, UploadCloud, Settings, Palette, Moon, Sun, Mic, Menu, LogOut } from 'lucide-react';
import { UserProfile, RANK_ORDER } from '../types';
import { VisitorIdentity } from '../utils/visitor';
import { TwinklingStars } from './TwinklingStars';
import { InstallAppButton } from './InstallAppButton';
import './Navbar.css';

export type NavTab = 'home' | 'stats' | 'notifications' | 'profile' | 'upload' | 'admin' | 'stickers' | 'install';

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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.mainTab = currentTab;
    return () => {
      if (document.body.dataset.mainTab === currentTab) delete document.body.dataset.mainTab;
    };
  }, [currentTab]);

  const cleanEmail = currentUser?.email?.toLowerCase().trim();
  const isSuperAdmin = isAdmin || cleanEmail === 'yukidu@gmail.com' || currentUser?.role === '超級管理員';
  const isAdministrator = currentUser?.isAdminUser === true || currentUser?.role === '管理員' || currentUser?.role === '獎銜審核員';
  const canAudit = isSuperAdmin || isAdministrator || cleanEmail === 'yukidu@gmail.com' || currentUser?.role === '獎銜審核員' || currentUser?.isAdminUser === true;
  const notificationsMenuTitle = canAudit ? '通知與獎銜審核' : '通知';
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

  const handleLogout = () => {
    localStorage.removeItem('sq_current_user_v1');
    sessionStorage.removeItem('echostars_auth_session_checked_at');
    sessionStorage.removeItem('echostars_first_profile_edit_v1');
    sessionStorage.removeItem('echostars_first_profile_edit_opened_v1');
    setIsMobileMenuOpen(false);
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 transition-colors shadow-xs relative">
      <TwinklingStars density="subtle" className="opacity-75 dark:opacity-90" />

      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between gap-3">
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

      {isMobileMenuOpen && (
        <div className="mobile-menu-shell">
          <div className="mobile-menu-panel animate-in slide-in-from-top-2">
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

            <button type="button" onClick={handleRandomPalette} className={mobileRowClass(false)}>
              <Palette className="w-4 h-4 shrink-0" />
              <span>切換配色</span>
            </button>

            <button type="button" onClick={handleToggleTheme} className={mobileRowClass(false)}>
              {isDark ? <Sun className="w-4 h-4 shrink-0" /> : <Moon className="w-4 h-4 shrink-0" />}
              <span>{isDark ? '切換淺色模式' : '切換深色模式'}</span>
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
