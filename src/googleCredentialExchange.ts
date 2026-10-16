import { withGoogleLoginDeadline } from './googleLoginDeadline';
let pending: Promise<any> | null = null;
let revision = 0;
let pendingCredential = '';
export function loginRevision() { return revision; }

const STARRY_ID_SYNC_URL = 'https://id.starry.phd/api/google-sync';

/** Both GIS entry points share a single bounded exchange; no extra retry requests. */
export function exchangeGoogleCredential(credential: string, fetcher: typeof fetch): Promise<any> {
  if (pending) return pendingCredential === credential ? pending : Promise.reject(new Error('上一個帳號仍在登入，請稍後再試。'));
  pendingCredential = credential;
  revision += 1;
  pending = withGoogleLoginDeadline(async signal => {
    const centralResult = await fetcher(STARRY_ID_SYNC_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', cache: 'no-store', signal,
      body: JSON.stringify({ credential, appId: 'echostars' })
    });
    const centralData = await centralResult.json().catch(() => ({}));
    if (!centralResult.ok || !centralData?.success || !centralData?.user?.id) {
      throw new Error(centralData?.error || 'Starry ID 登入失敗，請稍後重試。');
    }

    const result = await fetcher('/api/users/google-sync', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      credentials: 'include', cache: 'no-store', signal,
      body: JSON.stringify({ credential })
    });
    const data = await result.json().catch(() => ({}));
    if (!result.ok || !data?.user?.id || !data?.authToken) {
      throw new Error(data?.error || '繁星回聲登入同步失敗，請稍後重試。');
    }
    return data;
  }).finally(() => { pending = null; pendingCredential = ''; });
  return pending;
}
