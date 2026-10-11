type PermissionVisibilityTrack = { authorizedOnlyVisible?: boolean | number };

export function canAppearInHomeForViewer(
  track: PermissionVisibilityTrack,
  isLoggedIn: boolean,
  canAccess: boolean
): boolean {
  if (!Boolean(track.authorizedOnlyVisible)) return true;
  return isLoggedIn && canAccess;
}
