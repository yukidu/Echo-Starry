import type { UserProfile } from '../types';

export async function apiJson<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.error || data?.success === false || !data) throw new Error(data?.error || '連線失敗，請稍後重試。');
  return data as T;
}

export function identityKeys(user: UserProfile | null | undefined, deviceId?: string): string[] {
  return [...new Set([user?.email?.toLowerCase().trim(), user?.id, deviceId].filter(Boolean))] as string[];
}
