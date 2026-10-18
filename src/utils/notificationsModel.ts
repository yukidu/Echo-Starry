import type { Comment, Track, UserProfile } from '../types';

// Notifications must tolerate old/corrupt browser storage instead of crashing React.
export function parseDismissedMentions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? Array.from(new Set(value.filter((id): id is string => typeof id === 'string' && id.length > 0))).slice(-5000)
      : [];
  } catch {
    return [];
  }
}

const normalize = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const dateMs = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value !== 'string') return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function buildMentionNotifications(
  comments: Comment[],
  currentUser: UserProfile | null,
  tracks: Track[],
  users: UserProfile[],
  dismissedIds: string[]
) {
  const myName = normalize(currentUser?.name);
  if (!myName || !Array.isArray(comments)) return [];
  const myEmail = normalize(currentUser?.email);
  const dismissed = new Set(Array.isArray(dismissedIds) ? dismissedIds : []);
  // Build lookup tables only once: avoid scanning every member and recording for every message.
  const trackById = new Map(tracks.map(track => [track.id, track]));
  const userByEmail = new Map<string, UserProfile>();
  const userByName = new Map<string, UserProfile>();
  for (const user of users) {
    const email = normalize(user.email);
    const name = normalize(user.name);
    if (email && !userByEmail.has(email)) userByEmail.set(email, user);
    if (name && !userByName.has(name)) userByName.set(name, user);
  }
  return comments.flatMap(comment => {
    if (!comment || typeof comment.content !== 'string' || dismissed.has(comment.id)) return [];
    const authorEmail = normalize(comment.authorEmail);
    const authorName = normalize(comment.authorName);
    if ((authorEmail && authorEmail === myEmail) || (authorName && authorName === myName)) return [];
    const lower = comment.content.toLowerCase();
    const isDirectMention = lower.includes(`@${myName}`) || lower.includes(`＠${myName}`) ||
      normalize(comment.replyToAuthor) === myName;
    if (!isDirectMention) return [];
    return [{
      id: `mention-${comment.id}`,
      comment,
      track: trackById.get(comment.trackId),
      authorUser: userByEmail.get(authorEmail) || userByName.get(authorName),
      isDirectMention,
      createdAt: comment.createdAt || 0,
      timestamp: comment.timestamp || '近期'
    }];
  }).sort((a, b) => dateMs(b.createdAt) - dateMs(a.createdAt)).slice(0, 100);
}

export function getPendingNotificationUsers(users: UserProfile[]) {
  return users.filter(user => user.rankAuditStatus === 'pending' || user.rankApproved === false)
    .sort((a, b) => dateMs(b.rankUpdatedAt || b.registerDate) - dateMs(a.rankUpdatedAt || a.registerDate));
}

export function getNewNotificationMembers(users: UserProfile[]) {
  return users.filter(user => normalize(user.email) !== 'yukidu@gmail.com' &&
    (user.rankAuditStatus === 'approved' || user.rankApproved === true))
    .sort((a, b) => dateMs(b.registerDate || b.auditedAt) - dateMs(a.registerDate || a.auditedAt))
    .slice(0, 50);
}
