import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { CheckCircle2, CircleChevronDown, Download, LoaderCircle, Share, SquarePlus, X } from 'lucide-react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' | string; platform?: string }>;
}

type RelatedApp = {
  platform?: string;
  id?: string;
  url?: string;
};

type InstallNavigator = Navigator & {
  standalone?: boolean;
  getInstalledRelatedApps?: () => Promise<RelatedApp[]>;
};

const isIOSFamily = () => {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';

  return (
    /iPad|iPhone|iPod/i.test(ua) ||
    (platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
};

const getIOSBrowserKind = () => {
  if (!isIOSFamily() || typeof navigator === 'undefined') return 'other';

  const ua = navigator.userAgent || '';
  if (/CriOS/i.test(ua)) return 'chrome';
  if (/EdgiOS/i.test(ua)) return 'edge';
  if (/FxiOS/i.test(ua)) return 'firefox';
  return 'safari';
};

declare global {
  interface Window {
    __ECHOSTARS_INSTALL_PROMPT__?: InstallEvent | null;
  }
}

let promptEvent: InstallEvent | null =
  typeof window !== 'undefined'
    ? (window.__ECHOSTARS_INSTALL_PROMPT__ || null)
    : null;

let installed =
  typeof window !== 'undefined' &&
  (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as InstallNavigator).standalone === true
  );

let revision = 0;
const listeners = new Set<() => void>();
const publish = () => {
  revision += 1;
  listeners.forEach(fn => fn());
};

const isStandalone = () =>
  typeof window !== 'undefined' &&
  (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as InstallNavigator).standalone === true
  );

const capturePrompt = (event: InstallEvent) => {
  event.preventDefault();
  promptEvent = event;
  window.__ECHOSTARS_INSTALL_PROMPT__ = event;
  installed = false;
  publish();
};

async function detectInstalledPwa() {
  if (isStandalone()) {
    if (!installed) {
      installed = true;
      publish();
    }
    return true;
  }

  const installNavigator = navigator as InstallNavigator;
  if (typeof installNavigator.getInstalledRelatedApps === 'function') {
    try {
      const apps = await installNavigator.getInstalledRelatedApps();
      const hasInstalledPwa = apps.some(app => app.platform === 'webapp');
      if (hasInstalledPwa && !installed) {
        installed = true;
        publish();
      }
      return hasInstalledPwa;
    } catch (error) {
      console.warn('Installed PWA detection failed:', error);
    }
  }

  return false;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => {
    capturePrompt(event as InstallEvent);
  });

  window.addEventListener('echostars-install-prompt-ready', () => {
    const event = window.__ECHOSTARS_INSTALL_PROMPT__;
    if (event) capturePrompt(event);
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    promptEvent = null;
    window.__ECHOSTARS_INSTALL_PROMPT__ = null;
    publish();
  });

  window.matchMedia('(display-mode: standalone)').addEventListener?.('change', event => {
    if (event.matches) {
      installed = true;
      publish();
    }
  });
}

export function InstallAppButton({
  onOpenIOSGuide,
  className = ''
}: {
  onOpenIOSGuide?: () => void;
  compact?: boolean;
  className?: string;
}) {
  useSyncExternalStore(
    fn => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => revision,
    () => 0
  );

  const [isInstalling, setIsInstalling] = useState(false);
  const [showInstaller, setShowInstaller] = useState(false);
  const [showIOSInstallGuide, setShowIOSInstallGuide] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [iosVisualViewport, setIOSVisualViewport] = useState(() => ({
    top: 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 720
  }));

  const readyEvent =
    promptEvent ||
    (typeof window !== 'undefined' ? window.__ECHOSTARS_INSTALL_PROMPT__ || null : null);

  useEffect(() => {
    // Old versions stored an installed hint that could become stale after the user
    // uninstalled the app outside the website. It must never block this button.
    try {
      localStorage.removeItem('echostars_pwa_installed_hint_v1');
      localStorage.removeItem('echostars_pwa_installed_hint_v2');
    } catch {
      // Ignore restricted storage modes.
    }

    void detectInstalledPwa();

    const earlyPrompt = window.__ECHOSTARS_INSTALL_PROMPT__;
    if (earlyPrompt && earlyPrompt !== promptEvent) {
      capturePrompt(earlyPrompt);
    }
  }, []);

  useEffect(() => {
    if (!showInstaller || !installed) return;
    setIsPreparing(false);
  }, [showInstaller]);

  useEffect(() => {
    if (!showIOSInstallGuide || typeof window === 'undefined') return;

    const syncVisualViewport = () => {
      const viewport = window.visualViewport;
      const nextTop = Math.max(0, viewport?.offsetTop ?? 0);
      const nextHeight = Math.max(
        280,
        viewport?.height ?? window.innerHeight
      );

      setIOSVisualViewport({
        top: nextTop,
        height: nextHeight
      });
    };

    syncVisualViewport();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', syncVisualViewport);
    viewport?.addEventListener('scroll', syncVisualViewport);
    window.addEventListener('resize', syncVisualViewport);
    window.addEventListener('orientationchange', syncVisualViewport);

    return () => {
      viewport?.removeEventListener('resize', syncVisualViewport);
      viewport?.removeEventListener('scroll', syncVisualViewport);
      window.removeEventListener('resize', syncVisualViewport);
      window.removeEventListener('orientationchange', syncVisualViewport);
    };
  }, [showIOSInstallGuide]);

  const runNativePrompt = async (event: InstallEvent) => {
    setIsInstalling(true);
    try {
      await event.prompt();
      const choice = await event.userChoice;

      promptEvent = null;
      window.__ECHOSTARS_INSTALL_PROMPT__ = null;

      if (choice.outcome === 'accepted') {
        installed = true;
      }
      publish();
      setShowInstaller(false);
    } catch (error) {
      console.warn('PWA native install prompt failed:', error);
    } finally {
      setIsInstalling(false);
    }
  };

  const prepareInstall = async () => {
    if (isPreparing) return;
    setIsPreparing(true);

    try {
      if (await detectInstalledPwa()) return;

      if ('serviceWorker' in navigator) {
        const registration =
          (await navigator.serviceWorker.getRegistration('/')) ||
          (await navigator.serviceWorker.register('/sw.js'));
        await registration.update().catch(() => {});
        await navigator.serviceWorker.ready.catch(() => registration);
      }

      const event = promptEvent || window.__ECHOSTARS_INSTALL_PROMPT__;
      if (event) {
        publish();
      }
    } catch (error) {
      console.warn('PWA install preparation failed:', error);
    } finally {
      setIsPreparing(false);
    }
  };

  const handleInstall = async () => {
    if (isInstalling) return;

    if (installed) {
      publish();
      return;
    }

    // iOS/iPadOS browsers do not emit beforeinstallprompt. Never wait for an
    // event that cannot arrive; show the shortest possible system install path.
    if (isIOSFamily()) {
      if (isStandalone()) {
        installed = true;
        publish();
        return;
      }

      setIsPreparing(false);
      setShowInstaller(false);
      if (onOpenIOSGuide) { onOpenIOSGuide(); return; }
      setShowIOSInstallGuide(true);
      return;
    }

    const event = promptEvent || window.__ECHOSTARS_INSTALL_PROMPT__;
    if (event) {
      // Fast path: Chromium native install prompt, called directly from the
      // user's click.
      await runNativePrompt(event);
      return;
    }

    if (await detectInstalledPwa()) {
      publish();
      return;
    }

    setShowInstaller(true);
    void prepareInstall();
  };

  return (
    <>
      <button
        type="button"
        title={
          installed
            ? '繁星回聲已安裝'
            : isIOSFamily()
            ? '加入主畫面'
            : readyEvent
            ? '安裝繁星回聲 App'
            : '準備安裝繁星回聲 App'
        }
        aria-label={installed ? '繁星回聲已安裝' : '安裝到桌面'}
        onClick={handleInstall}
        className={
          className ||
          'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
        }
      >
        {isInstalling || isPreparing ? (
          <LoaderCircle className="w-4 h-4 animate-spin" />
        ) : installed ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <Download className="w-4 h-4" />
        )}

        <span>安裝到桌面</span>

        {installed ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-3.5 h-3.5" />
            已安裝
          </span>
        ) : isIOSFamily() ? (
          <span className="ml-auto text-[10px] font-bold text-sky-600 dark:text-sky-400">
            加入主畫面
          </span>
        ) : readyEvent ? (
          <span className="ml-auto text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
            可安裝
          </span>
        ) : (
          <span className="ml-auto text-[10px] font-bold text-slate-400 dark:text-slate-500">
            準備安裝
          </span>
        )}
      </button>

      {showInstaller && !installed && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/55 backdrop-blur-[1px]"
          onClick={() => setShowInstaller(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="安裝繁星回聲"
            onClick={event => event.stopPropagation()}
            className="w-full max-w-xs rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl p-5"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-black text-base text-slate-900 dark:text-slate-100">
                安裝繁星回聲
              </h3>
              <button
                type="button"
                onClick={() => setShowInstaller(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="關閉"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {readyEvent ? (
              <button
                type="button"
                onClick={() => void runNativePrompt(readyEvent)}
                disabled={isInstalling}
                className="mt-4 w-full rounded-2xl px-4 py-3 text-sm font-black text-white disabled:opacity-60"
                style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}
              >
                {isInstalling ? '開啟系統安裝中…' : '安裝'}
              </button>
            ) : isPreparing ? (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-sm font-bold text-slate-600 dark:text-slate-300">
                <LoaderCircle className="w-4 h-4 animate-spin" />
                正在準備系統安裝…
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-slate-100 dark:bg-slate-800 px-4 py-3 text-center text-sm font-bold text-slate-600 dark:text-slate-300">
                系統安裝按鈕尚未就緒，請重新整理後再試。
              </div>
            )}
          </section>
        </div>
      )}

      {showIOSInstallGuide && !installed && (
        <div
          className="fixed left-0 right-0 z-[230] flex items-start justify-center overflow-hidden bg-black/60 px-3 backdrop-blur-[1px]"
          style={{
            top: `${iosVisualViewport.top}px`,
            height: `${iosVisualViewport.height}px`,
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            boxSizing: 'border-box'
          }}
          onClick={() => setShowIOSInstallGuide(false)}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label="在 iPhone 或 iPad 安裝繁星回聲"
            onClick={event => event.stopPropagation()}
            className="flex max-h-full min-h-0 w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-slate-100">
                  {getIOSBrowserKind() === 'safari'
                    ? '安裝繁星回聲'
                    : '請用 Safari 安裝'}
                </h3>
                <p className="mt-0.5 text-sm font-semibold text-slate-500 dark:text-slate-400">
                  {getIOSBrowserKind() === 'safari'
                    ? '2 步驟完成'
                    : 'iOS Chrome／Edge 無法一鍵安裝'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSInstallGuide(false)}
                className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="關閉"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-3 sm:px-5">
              {getIOSBrowserKind() === 'safari' ? (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-100 p-3.5 dark:bg-slate-800">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary,#c06c84)] text-base font-black text-white">
                        1
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-black text-slate-900 dark:text-slate-100">
                          點「分享」
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
                          點 Safari 的分享按鈕。
                        </p>
                        <div className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                          <Share className="h-5 w-5" />
                          分享
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-100 p-3.5 dark:bg-slate-800">
                    <div className="flex items-start gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary,#c06c84)] text-base font-black text-white">
                        2
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-black text-slate-900 dark:text-slate-100">
                          點「檢視較多」
                        </p>
                        <p className="mt-1 text-sm font-semibold leading-snug text-slate-600 dark:text-slate-300">
                          再選「加入主畫面」→「加入」。
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs font-black text-slate-800 dark:text-slate-100">
                          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                            <CircleChevronDown className="h-4 w-4" />
                            檢視較多
                          </span>
                          <span aria-hidden="true">→</span>
                          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                            <SquarePlus className="h-4 w-4" />
                            加入主畫面
                          </span>
                          <span aria-hidden="true">→</span>
                          <span className="rounded-lg bg-[var(--color-primary,#c06c84)] px-2 py-1.5 text-white">
                            加入
                          </span>
                        </div>
                        <p className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                          若已直接看到「加入主畫面」，可直接點。
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-2xl bg-slate-100 p-3.5 dark:bg-slate-800">
                    <p className="text-base font-black text-slate-900 dark:text-slate-100">
                      1. 改用 Safari 開啟
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-100 p-3.5 dark:bg-slate-800">
                    <p className="text-base font-black text-slate-900 dark:text-slate-100">
                      2. 分享 → 檢視較多 → 加入主畫面
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-5">
              <button
                type="button"
                onClick={() => setShowIOSInstallGuide(false)}
                className="w-full rounded-2xl px-4 py-2.5 text-base font-black text-white"
                style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}
              >
                知道了
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
