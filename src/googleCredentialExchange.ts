import { setInteractiveGoogleLoginActive } from './ecosystemSsoClient';
import { withGoogleLoginDeadline } from './googleLoginDeadline';
let pending: Promise<any> | null = null;
let revision = 0;
let pendingCredential = '';
export function loginRevision() { return revision; }

/**
 * Legacy EchoStars authenticates against its own Worker. The Worker verifies
 * Google's signed credential, updates echoes_db, and synchronizes the verified
 * member with the legacy starry_id_db through its D1 binding.
 * Do not call the separate v2 id.starry.phd service from this legacy site.
 */
export function exchangeGoogleCredential(credential: string, fetcher: typeof fetch): Promise<any> {
  if (pending) return pendingCredential === credential ? pending : Promise.reject(new Error('上一個帳號仍在登入，請稍後再試。'));
  pendingCredential = credential;
  revision += 1;
  setInteractiveGoogleLoginActive(true);
  pending = withGoogleLoginDeadline(async signal => {
    const result = await fetcher('/api/users/google-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
      body: JSON.stringify({ credential })
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !data?.user?.id || !data?.authToken) {
      throw new Error(data?.error || '繁星回聲舊版中央會員登入失敗，請稍後重試。');
    }
    return { ...data, starryUserId: String(data.starryUserId || '') };
  }).finally(() => { pending = null; pendingCredential = ''; setInteractiveGoogleLoginActive(false); });
  return pending;
}
