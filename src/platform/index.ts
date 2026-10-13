export type RuntimePlatform = 'web' | 'pwa';

export interface SharePayload {
  title?: string;
  text?: string;
  url?: string;
}

export interface FilePickOptions {
  accept?: string;
  multiple?: boolean;
  capture?: 'user' | 'environment';
}

const hasWindow = typeof window !== 'undefined';
const hasNavigator = typeof navigator !== 'undefined';

// Compute once at module initialization. No listeners, polling, Context or repeated render-time detection.
const standalone = hasWindow && (
  window.matchMedia?.('(display-mode: standalone)').matches === true ||
  (hasNavigator && (navigator as Navigator & { standalone?: boolean }).standalone === true)
);

export const platformRuntime: Readonly<{
  kind: RuntimePlatform;
  standalone: boolean;
  canShare: boolean;
  canNotify: boolean;
}> = Object.freeze({
  kind: standalone ? 'pwa' : 'web',
  standalone,
  canShare: hasNavigator && typeof navigator.share === 'function',
  canNotify: hasWindow && 'Notification' in window
});

export async function share(payload: SharePayload): Promise<'shared' | 'unsupported' | 'cancelled'> {
  if (!platformRuntime.canShare) return 'unsupported';
  try {
    await navigator.share(payload);
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}

export async function copyText(value: string): Promise<boolean> {
  if (!hasNavigator || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

// File/camera APIs are created only when the user explicitly invokes them.
// No file input or camera initialization is added to application startup.
export function pickFiles(options: FilePickOptions = {}): Promise<File[]> {
  if (!hasWindow) return Promise.resolve([]);
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept) input.accept = options.accept;
    input.multiple = Boolean(options.multiple);
    if (options.capture) input.setAttribute('capture', options.capture);
    input.addEventListener('change', () => resolve(Array.from(input.files || [])), { once: true });
    input.addEventListener('cancel', () => resolve([]), { once: true });
    input.click();
  });
}

export function capturePhoto(facing: 'user' | 'environment' = 'environment'): Promise<File | null> {
  return pickFiles({ accept: 'image/*', capture: facing }).then(files => files[0] || null);
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!platformRuntime.canNotify) return 'unsupported';
  return Notification.requestPermission();
}

// Central navigation boundary for browser login flows. A future Capacitor implementation can replace this
// without changing calling components. Current Google GIS popup/callback remains Web-only until that migration is needed.
export function navigateToLogin(url: string): void {
  if (hasWindow) window.location.assign(url);
}
