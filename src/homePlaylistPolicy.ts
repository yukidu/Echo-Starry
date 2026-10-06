export type HomePlaylistTrack = {
  id: string;
  isPrivateVip?: boolean;
};

type DefaultHomeOrderOptions<T extends HomePlaylistTrack> = {
  canAccess: (track: T) => boolean;
  getRequiredRankIndex: (track: T) => number;
  getUploadTimestamp: (track: T) => number;
  getUploadSequence: (track: T) => number;
  shuffleSeed: number;
};

const stableShuffleScore = (id: string, seed: number) => {
  let hash = (2166136261 ^ (seed >>> 0)) >>> 0;
  const source = `${seed}:${id}`;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
};

export function sortDefaultHomeTracks<T extends HomePlaylistTrack>(
  tracks: readonly T[],
  options: DefaultHomeOrderOptions<T>
): T[] {
  const {
    canAccess,
    getRequiredRankIndex,
    getUploadTimestamp,
    getUploadSequence,
    shuffleSeed
  } = options;

  return [...tracks].sort((a, b) => {
    // Private VIP is always the third group, even for an owner/admin who can play it.
    const groupFor = (track: T) => {
      if (track.isPrivateVip) return 2;
      return canAccess(track) ? 0 : 1;
    };

    const groupDiff = groupFor(a) - groupFor(b);
    if (groupDiff !== 0) return groupDiff;

    const group = groupFor(a);
    if (group === 0) {
      const shuffleDiff = stableShuffleScore(a.id, shuffleSeed) - stableShuffleScore(b.id, shuffleSeed);
      return shuffleDiff || a.id.localeCompare(b.id);
    }

    if (group === 1) {
      const rankDiff = getRequiredRankIndex(a) - getRequiredRankIndex(b);
      if (rankDiff !== 0) return rankDiff;
    }

    // Same locked rank, and all private VIP items: newest first.
    const timeDiff = getUploadTimestamp(b) - getUploadTimestamp(a);
    if (timeDiff !== 0) return timeDiff;
    const sequenceDiff = getUploadSequence(b) - getUploadSequence(a);
    return sequenceDiff || a.id.localeCompare(b.id);
  });
}

export function moveTrackIdToSecondSlot(ids: readonly string[], targetId: string): string[] {
  if (ids.length <= 1) return [...ids];
  const next = ids.filter(id => id !== targetId);
  const insertAt = Math.min(1, next.length);
  next.splice(insertAt, 0, targetId);
  return next;
}

export function sortStickerTracks<T extends HomePlaylistTrack & {stickerUnlockCost?:number;commentStickerReward?:number}>(tracks:readonly T[],purchasedIds:readonly string[],mode:'cost'|'reward'):T[]{
  const purchased=new Set(purchasedIds);
  return [...tracks].sort((a,b)=>Number(purchased.has(b.id))-Number(purchased.has(a.id)) || (mode==='cost'?(a.stickerUnlockCost || 0)-(b.stickerUnlockCost || 0):(b.commentStickerReward || 0)-(a.commentStickerReward || 0)));
}
