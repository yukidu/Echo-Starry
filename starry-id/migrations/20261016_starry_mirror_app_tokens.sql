-- Starry Mirror / 繁星心鏡：跨子網域不共享 Starry ID HttpOnly Cookie。
-- 由 Starry ID 簽發短效 opaque token，Mirror Worker 僅以 token 經內部 service binding 驗證。
CREATE TABLE IF NOT EXISTS app_access_tokens (
  tokenHash TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS app_access_tokens_user_app
  ON app_access_tokens(userId, appId, expiresAt);
