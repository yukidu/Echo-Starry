import { effectiveMemberRank } from '../utils/ranks';
import React, { useEffect, useState } from 'react';
import { Trophy, Home, BarChart3, Bell, User, UploadCloud, Settings, Palette, Moon, Sun, Mic, Menu, X, LogOut } from 'lucide-react';
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
      if (document.body.dataset.mainTab === currentTab) {
        delete document.body.dataset.mainTab;
      }
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

  const nameLen = Array.from(displayName).length;
  const nameFontSize = nameLen <= 4 ? 12 : Math.max(8.5, Math.round((4 / nameLen) * 12 * 10) / 10);
  const mobileNameFontSize = nameLen <= 4 ? 11 : Math.max(8, Math.round((4 / nameLen) * 11 * 10) / 10);

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

  const handleMobileNav = (tab: NavTab) => {
    if (tab === 'home') {
      if (onLogoClick) onLogoClick();
      else onSelectTab('home');
    } else {
      // v110：先關閉上一個主選單頁面的狀態，再打開下一頁，避免後台／上傳頁互相遮住。
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

  const handleLogout = () => {
    localStorage.removeItem('sq_current_user_v1');
    sessionStorage.removeItem('echostars_auth_session_checked_at');
    sessionStorage.removeItem('echostars_first_profile_edit_v1');
    sessionStorage.removeItem('echostars_first_profile_edit_opened_v1');
    setIsMobileMenuOpen(false);
    window.location.reload();
  };

  const desktopButtonClass = (active: boolean) => `p-2.5 rounded-xl transition-all flex items-center justify-center ${
    active
      ? 'bg-rose-100/90 dark:bg-slate-800 text-rose-700 dark:text-rose-300 shadow-xs font-bold'
      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
  }`;

  const mobileRowClass = (active: boolean) => `mobile-menu-row flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
    active
      ? 'bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-800 font-bold'
      : 'hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

  return (
    <header className="sticky top-0 z-40 w-full backdrop-blur-md bg-white/90 dark:bg-slate-900/90 border-b border-[var(--theme-border-subtle,#f1e7ea)] dark:border-slate-800 transition-colors shadow-xs relative">
      <TwinklingStars density="subtle" className="opacity-75 dark:opacity-90" />

      <div className="relative z-10 max-w-4xl mx-auto px-3 sm:px-6 h-16 sm:h-[72px] flex items-center justify-between">
        <button
          type="button"
          data-tutorial-target="home-logo"
          onClick={handleLogoClick}
          className="brand-logo-glow relative isolate flex items-center gap-2 sm:gap-2.5 text-left group focus:outline-hidden cursor-pointer"
          title="返回首頁播放清單（全部分類）"
        >
          <div
            className="relative w-8 h-8 sm:w-10 sm:h-10 rounded-2xl flex items-center justify-center text-white shadow-md transition-transform group-hover:scale-105"
            style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
          >
            <Mic className="w-4 h-4 sm:w-5 sm:h-5 text-white transition-transform group-hover:scale-110" />
            <span className="absolute inset-0 rounded-2xl border-2 animate-ping" style={{ borderColor: 'var(--color-primary, #c06c84)' }} />
          </div>

          <div className="flex items-center gap-1.5">
            <span
              className="text-base sm:text-xl font-black tracking-wider echo-wave-text inline-flex items-baseline"
              style={{ color: 'var(--color-primary, #c06c84)' }}
            >
              <span>繁星回聲</span>
            </span>
            <div className="hidden sm:flex items-center gap-0.5 h-4 ml-0.5">
              <span className="w-0.5 rounded-full animate-[pulseWaveBar_1.2s_ease-in-out_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full animate-[pulseWaveBar_1.2s_ease-in-out_0.2s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full opacity-80 animate-[pulseWaveBar_1.2s_ease-in-out_0.4s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
              <span className="w-0.5 rounded-full opacity-60 animate-[pulseWaveBar_1.2s_ease-in-out_0.6s_infinite]" style={{ backgroundColor: 'var(--color-primary, #c06c84)' }} />
            </div>
          </div>
        </button>

        <div className="hidden md:flex items-center gap-0.5 sm:gap-1">
          <button onClick={handleLogoClick} title="首頁播放清單（全部分類）" className={desktopButtonClass(currentTab === 'home')}>
            <Home className="w-6 h-6" />
          </button>

          <button onClick={() => handleMobileNav('stats')} title="排行榜" className={desktopButtonClass(currentTab === 'stats')}>
            <BarChart3 className="w-6 h-6" />
          </button>

          {currentUser && (
            <button
              onClick={() => handleMobileNav('notifications')}
              title={notificationsMenuTitle}
              className={`p-2.5 rounded-xl transition-all relative flex items-center justify-center ${currentTab === 'notifications' ? 'shadow-xs font-bold' : 'hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}
              style={{
                color: 'var(--color-primary, #c06c84)',
                backgroundColor: currentTab === 'notifications' ? 'var(--color-light-pill, #fae8ed)' : undefined
              }}
            >
              <Bell className="w-6 h-6" />
              {pendingNotificationsCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full text-white text-[9px] font-black flex items-center justify-center shadow-xs animate-pulse"
                  style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                >
                  {pendingNotificationsCount}
                </span>
              )}
            </button>
          )}

          {canUpload && (
            <button onClick={() => handleMobileNav('upload')} title="上傳音檔" className={desktopButtonClass(currentTab === 'upload')}>
              <UploadCloud className="w-6 h-6" />
            </button>
          )}

          <button
            data-tutorial-target="visitor-profile"
            onClick={() => handleMobileNav('profile')}
            title="個人中心"
            className={`px-3 py-1.5 rounded-2xl transition-all relative flex flex-col items-center justify-center text-center cursor-pointer min-w-[64px] max-w-[104px] sm:max-w-[128px] bg-transparent ${currentTab === 'profile' ? 'text-[var(--color-primary,#c06c84)]' : 'hover:text-[var(--color-primary,#c06c84)]'}`}
          >
            <span style={{ fontSize: `${nameFontSize}px` }} className="font-bold text-slate-800 dark:text-slate-100 truncate w-full text-center leading-tight tracking-tight">
              {displayName}
            </span>
            <span className="text-[9px] px-2 py-[1px] mt-0.5 rounded-full font-bold bg-transparent text-[var(--color-primary,#c06c84)] border border-transparent leading-none whitespace-nowrap">
              {displayRole}
            </span>
            {currentUser && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900" />}
          </button>

          <button
            type="button"
            onClick={handleOpenStickers}
            title={stickerMenuTitle}
            className="px-2.5 py-2 rounded-xl text-xs font-black text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Trophy className="w-5 h-5 inline" />{' '}
            {currentUser ? <>
              我的貼紙 <span className="text-2xl font-normal" style={{ color: 'var(--color-primary,#c06c84)' }}>{stickerBalanceText}</span> 張
            </> : stickerMenuTitle}
          </button>

          <InstallAppButton
            onOpenIOSGuide={handleInstallGuide}
            compact
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          />

          {canAccessSettings && (
            <button onClick={() => handleMobileNav('admin')} title="後台管理" className={`${desktopButtonClass(currentTab === 'admin')} relative`}>
              <Settings className="w-6 h-6" />
              {isSuperAdmin && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />}
            </button>
          )}

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-0.5" />

          <button onClick={onRandomPalette} title="隨機切換清新漸層配色" className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all active:rotate-45">
            <Palette className="w-6 h-6" />
          </button>

          <button onClick={onToggleTheme} title={isDark ? '切換為淺色模式' : '切換為深色模式'} className="p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-all active:scale-95">
            {isDark ? <Sun className="w-6 h-6 text-amber-400" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>

        <div className="flex items-center gap-0.5 md:hidden">
          <button
            type="button"
            data-tutorial-target="visitor-profile"
            onClick={() => handleMobileNav('profile')}
            className={`px-1.5 py-1 rounded-xl transition-colors flex flex-col items-center justify-center text-center min-w-[54px] max-w-[72px] shrink-0 bg-transparent ${currentTab === 'profile' ? 'text-[var(--color-primary,#c06c84)]' : 'hover:text-[var(--color-primary,#c06c84)]'}`}
            title={currentUser ? `個人檔案 (${currentUser.name})` : `目前身分：${displayName} (訪客)`}
          >
            <span style={{ fontSize: `${mobileNameFontSize}px` }} className="font-bold text-slate-800 dark:text-slate-100 truncate w-full text-center leading-tight tracking-tight">
              {displayName}
            </span>
            <span className="text-[8.5px] px-1.5 py-[0.5px] mt-0.5 rounded-full font-bold bg-transparent text-[var(--color-primary,#c06c84)] border border-transparent leading-none whitespace-nowrap">
              {displayRole}
            </span>
          </button>

          {currentUser && (
            <button
              type="button"
              onClick={() => handleMobileNav('notifications')}
              className={`relative p-1.5 sm:p-2 rounded-xl transition-colors ${currentTab === 'notifications' ? 'bg-rose-100 dark:bg-slate-800' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title={notificationsMenuTitle}
              aria-label={notificationsMenuTitle}
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: 'var(--color-primary,#c06c84)' }} />
              {pendingNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full text-white text-[8px] font-black flex items-center justify-center animate-pulse" style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}>
                  {pendingNotificationsCount}
                </span>
              )}
            </button>
          )}

          <button onClick={onRandomPalette} className="p-2 sm:p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:rotate-45" title="隨機切換配色" aria-label="隨機配色">
            <Palette className="w-[18px] h-[18px] sm:w-6 sm:h-6 text-[var(--color-primary,#c06c84)]" />
          </button>

          <button onClick={onToggleTheme} className="p-2 sm:p-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={isDark ? '切換淺色模式' : '切換深色模式'} aria-label="深淺色切換">
            {isDark ? <Sun className="w-[18px] h-[18px] sm:w-6 sm:h-6 text-amber-400" /> : <Moon className="w-[18px] h-[18px] sm:w-6 sm:h-6" />}
          </button>

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 transition-colors ml-0.5"
            title="開啟選單"
            aria-label="選單"
          >
            {isMobileMenuOpen ? <X className="w-[22px] h-[22px]" /> : <Menu className="w-[22px] h-[22px]" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu-shell md:hidden">
          <div className="mobile-menu-panel animate-in slide-in-from-top-2">
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
