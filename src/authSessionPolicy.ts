/** Shared by normal login and share-page recovery. No authentication decisions use cached profile fields. */
export function shouldDiscardSession(status: number, checkedToken: string, currentToken: string) {
  return status === 401 && Boolean(checkedToken) && checkedToken === currentToken;
}
export function mergeMemberSession<T extends { id: string }>(previous: { id: string; _authToken?: string; _sessionExpiresAt?: number } | null, updated: T): T {
  if (!previous || previous.id !== updated.id) return updated;
  const old = previous;
  return { ...updated, ...(old._authToken ? { _authToken: old._authToken, _sessionExpiresAt: old._sessionExpiresAt } : {}) };
}
