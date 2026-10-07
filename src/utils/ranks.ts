import type { UserProfile } from '../types';

/** Canonical rank used only by the home playlist filter; original labels stay unchanged. */
export const baseSpeakerRank = (rank: string): string =>
  rank.trim().replace(/^GAR\s*/i, '').replace(/創辦人/g, '').trim();

/**
 * Member-facing pages must display the same official rank used by backend permission
 * and sticker ranking logic. A pending, unapproved rank remains a request only; after
 * approval, approvedRank becomes the official display value (falling back to rank for
 * legacy approved rows that do not yet have approvedRank populated).
 */
export const effectiveMemberRank = (
  user: Pick<UserProfile, 'rank' | 'approvedRank' | 'rankApproved'> | null | undefined,
  fallback = '無'
): string => {
  const requested = String(user?.rank || '').trim();
  const approved = String(user?.approvedRank || '').trim();
  return user?.rankApproved ? (approved || requested || fallback) : (requested || fallback);
};
