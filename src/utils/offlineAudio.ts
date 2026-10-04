/**
 * Offline Audio Cache Management
 *
 * 真正的音檔離線保存使用瀏覽器 Cache Storage（不是只記錄狀態）。
 * 播放時先記錄曲目，待播放穩定後以低優先級背景下載完整音檔；
 * 完整寫入 Cache Storage 並再次讀得到後，才視為離線保存成功。
 *
 * 清理政策：最後一次收聽超過 15 天才移除。即使已聽完，也不會立即刪除，
 * 讓使用者之後仍能真正離線播放。
 */

const OFFLINE_REGISTRY_KEY = 'sq_offline_audio_registry_v1';
const RETENTION_MS = 15 * 24 * 60 * 60 * 1000;
const AUDIO_CACHE = 'echostars-audio-v3';
const AUTO_CACHE_DELAY_MS = 3000;

export interface OfflineTrackRecord {
  trackId: string;
  audioUrl?: string;
  cachedAt: number;
  lastListenedAt: number;
  completed?: boolean;
}

export function getOfflineRegistry(): Record<string, OfflineTrackRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(OFFLINE_REGISTRY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveOfflineRegistry(registry: Record<string, OfflineTrackRecord>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OFFLINE_REGISTRY_KEY, JSON.stringify(registry));
  } catch {
    // quota exceeded or private mode: Cache Storage may still work independently.
  }
}

let persistentStorageRequested = false;

/**
 * Ask the browser to reduce automatic eviction of this site's stored audio.
 * Browsers may deny persistence; Cache Storage still remains a real local cache.
 */
export async function requestPersistentOfflineStorage(): Promise<boolean | null> {
  if (persistentStorageRequested) return null;
  persistentStorageRequested = true;
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

const scheduled = new Map<string, number>();
const controllers = new Map<string, AbortController>();
const pending = new Map<string, Promise<boolean>>();
let cacheQueue: Promise<void> = Promise.resolve();

function markCached(trackId: string, audioUrl: string) {
  const reg = getOfflineRegistry();
  const current = reg[trackId];
  reg[trackId] = {
    trackId,
    audioUrl,
    cachedAt: Date.now(),
    lastListenedAt: current?.lastListenedAt || Date.now(),
    completed: current?.completed || false
  };
  saveOfflineRegistry(reg);
}

/**
 * Record listening immediately, then schedule the real full-file Cache Storage write.
 * cachedAt stays 0 until the cache has actually been verified.
 */
export function recordOfflineTrack(trackId: string, audioUrl?: string) {
  const reg = getOfflineRegistry();
  const current = reg[trackId];
  reg[trackId] = {
    trackId,
    audioUrl: audioUrl || current?.audioUrl,
    cachedAt: current?.cachedAt || 0,
    lastListenedAt: Date.now(),
    completed: current?.completed || false
  };
  saveOfflineRegistry(reg);

  if (!audioUrl || typeof window === 'undefined') return;
  if (scheduled.has(trackId) || pending.has(trackId)) return;

  const timer = window.setTimeout(() => {
    scheduled.delete(trackId);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    void ensureOfflineAudioCached(trackId, audioUrl);
  }, AUTO_CACHE_DELAY_MS);
  scheduled.set(trackId, timer);
}

async function cacheAudioNow(trackId: string, audioUrl: string): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  const cache = await caches.open(AUDIO_CACHE);

  const existing = await cache.match(audioUrl);
  if (existing) {
    markCached(trackId, audioUrl);
    return true;
  }

  const controller = new AbortController();
  controllers.set(trackId, controller);
  try {
    const requestInit = {
      signal: controller.signal,
      cache: 'no-store',
      priority: 'low'
    } as RequestInit & { priority: 'low' };
    const response = await fetch(audioUrl, requestInit);
    if (!response.ok || response.status === 206) return false;

    // Cache Storage consumes the full response stream. No in-memory Blob copy is
    // created here, which is significantly safer for long recordings on phones.
    await cache.put(audioUrl, response.clone());
    if (controller.signal.aborted || !getOfflineRegistry()[trackId]) {
      await cache.delete(audioUrl);
      return false;
    }

    // Verify the stored response before claiming offline success.
    if (!(await cache.match(audioUrl))) return false;
    markCached(trackId, audioUrl);
    return true;
  } catch (error) {
    if (!controller.signal.aborted) console.warn('音檔離線保存未完成', error);
    return false;
  } finally {
    if (controllers.get(trackId) === controller) controllers.delete(trackId);
  }
}

/**
 * Ensure only one large full-audio download runs at once, so offline storage does
 * not compete aggressively with the actively streaming player on mobile data.
 */
export function ensureOfflineAudioCached(trackId: string, audioUrl: string): Promise<boolean> {
  const existing = pending.get(trackId);
  if (existing) return existing;

  let task!: Promise<boolean>;
  task = cacheQueue
    .then(() => cacheAudioNow(trackId, audioUrl))
    .finally(() => {
      if (pending.get(trackId) === task) pending.delete(trackId);
    });
  pending.set(trackId, task);
  cacheQueue = task.then(() => undefined, () => undefined);
  return task;
}

/**
 * Update listen activity. Completion is recorded but no longer deletes the file.
 */
export function handleTrackProgressOffline(trackId: string, currentTime: number, duration: number) {
  if (duration <= 0) return;
  const reg = getOfflineRegistry();
  const record = reg[trackId];
  if (!record) return;

  const now = Date.now();
  const ratio = currentTime / duration;
  const shouldSave =
    (ratio > 0.95 && !record.completed) ||
    now - record.lastListenedAt > 30000;

  if (shouldSave) {
    record.lastListenedAt = now;
    if (ratio > 0.95) record.completed = true;
    saveOfflineRegistry(reg);
  }
}

/** Remove one track from actual Cache Storage and its registry record. */
export function removeOfflineTrack(trackId: string) {
  const reg = getOfflineRegistry();
  const timer = scheduled.get(trackId);
  if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer);
  scheduled.delete(trackId);
  controllers.get(trackId)?.abort();
  controllers.delete(trackId);

  if (reg[trackId]) {
    const audioUrl = reg[trackId].audioUrl;
    if (audioUrl && typeof caches !== 'undefined') {
      void caches.open(AUDIO_CACHE).then(cache => cache.delete(audioUrl)).catch(() => {});
    }
    delete reg[trackId];
    saveOfflineRegistry(reg);
  }
}

/** Clean up only tracks not listened to for more than 15 days. */
export function purgeStaleOfflineTracks(): number {
  const reg = getOfflineRegistry();
  const now = Date.now();
  let purgedCount = 0;

  for (const trackId of Object.keys(reg)) {
    const record = reg[trackId];
    if (now - record.lastListenedAt > RETENTION_MS) {
      removeOfflineTrack(trackId);
      delete reg[trackId];
      purgedCount++;
    }
  }

  if (purgedCount > 0) saveOfflineRegistry(reg);
  return purgedCount;
}

export async function isOfflineAudioCached(audioUrl: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    return Boolean(await (await caches.open(AUDIO_CACHE)).match(audioUrl));
  } catch {
    return false;
  }
}

export async function getOfflineAudioUrl(audioUrl: string): Promise<string | null> {
  try {
    if (typeof caches === 'undefined') return null;
    const response = await (await caches.open(AUDIO_CACHE)).match(audioUrl);
    return response ? URL.createObjectURL(await response.blob()) : null;
  } catch {
    return null;
  }
}
