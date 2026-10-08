type VisitorTrack = { requiredRank?: string; isPrivateVip?: boolean; guestVisible?: boolean | number };
export function isPublicRecording(track: VisitorTrack): boolean {
  return !track.requiredRank || track.requiredRank === '無' || track.requiredRank === '公開';
}
export function isVisibleOnGuestHome(track: VisitorTrack): boolean {
  return track.guestVisible === true || track.guestVisible === 1 || (isPublicRecording(track) && !track.isPrivateVip);
}
export function canGuestPlayPublicShare(track: VisitorTrack, isGuest: boolean, isSharedDetail: boolean): boolean {
  return isGuest && isSharedDetail && isPublicRecording(track) && !track.isPrivateVip;
}
