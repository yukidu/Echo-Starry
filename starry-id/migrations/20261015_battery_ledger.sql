-- v243: Starry ID central battery ledger for the entire Starry ecosystem.
-- One user has one shared balance across every Starry app.

CREATE TABLE IF NOT EXISTS battery_transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deltaUnits INTEGER NOT NULL,
  balanceAfterUnits INTEGER NOT NULL,
  type TEXT NOT NULL,
  sourceApp TEXT NOT NULL DEFAULT 'echostars',
  sourceId TEXT,
  description TEXT NOT NULL,
  actorUserId TEXT,
  uniqueKey TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  trackId TEXT,
  commentId TEXT,
  relatedUserId TEXT,
  sourceLabel TEXT
);
CREATE INDEX IF NOT EXISTS battery_transactions_user_history
  ON battery_transactions(userId, createdAt DESC, id DESC);
CREATE INDEX IF NOT EXISTS battery_transactions_user_cursor
  ON battery_transactions(userId);
CREATE INDEX IF NOT EXISTS battery_transactions_source
  ON battery_transactions(sourceApp, sourceId, type);
CREATE INDEX IF NOT EXISTS battery_transactions_actor_history
  ON battery_transactions(actorUserId, createdAt DESC, id DESC);

-- Current balance is derived from the immutable ledger, but this summary table
-- makes ecosystem-wide reads cheap. The migration and every write refresh it.
CREATE TABLE IF NOT EXISTS battery_accounts (
  userId TEXT PRIMARY KEY,
  balanceUnits INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
);

-- Records one-time source migrations. sourceMaxRowId lets migration resume safely.
CREATE TABLE IF NOT EXISTS battery_migration_state (
  sourceApp TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  sourceCount INTEGER NOT NULL DEFAULT 0,
  migratedCount INTEGER NOT NULL DEFAULT 0,
  sourceBalanceUnits INTEGER NOT NULL DEFAULT 0,
  centralBalanceUnits INTEGER NOT NULL DEFAULT 0,
  sourceMaxRowId INTEGER NOT NULL DEFAULT 0,
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  updatedAt INTEGER NOT NULL
);
