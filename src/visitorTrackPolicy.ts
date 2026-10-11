type VisitorTrack = {
  requiredRank?: string;
  isPrivateVip?: boolean;
  guestVisible?: boolean | number;
  authorizedOnlyVisible?: boolean | number;
  stickerUnlockCost?: number | null;
};

export function isPublicRecording(track: VisitorTrack): boolean {
  return !track.requiredRank || track.requiredRank === '無' || track.requiredRank === '公開';
}

export function isFreeForGuest(track: VisitorTrack): boolean {
  return Math.max(0, Number(track.stickerUnlockCost || 0)) === 0;
}

export function isVisibleOnGuestHome(track: VisitorTrack): boolean {
  return !Boolean(track.authorizedOnlyVisible) && isPublicRecording(track) && !track.isPrivateVip && isFreeForGuest(track);
}

export function canGuestPlayPublicShare(track: VisitorTrack, isGuest: boolean, isSharedDetail: boolean): boolean {
  return isGuest && isSharedDetail && !Boolean(track.authorizedOnlyVisible) && isPublicRecording(track) && !track.isPrivateVip;
}
