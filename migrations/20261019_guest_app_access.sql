-- Starry ID guest access v1: explicit, idempotent D1 migration.
-- One-time provisioning only. NEVER execute these statements inside an
-- authenticated HTTP GET/POST request or on every admin page open.
-- The production D1 database already contains all three tables.
-- No changes to users, profiles, member grants or existing guest policies.
CREATE TABLE IF NOT EXISTS starry_guest_app_policies (
  appId TEXT PRIMARY KEY,
  allowed INTEGER NOT NULL CHECK (allowed IN (0,1)),
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS starry_guest_app_previews (
  id TEXT PRIMARY KEY,
  actorUserId TEXT NOT NULL,
  appId TEXT NOT NULL,
  beforeAllowed INTEGER NOT NULL,
  afterAllowed INTEGER NOT NULL,
  undoOperationId TEXT,
  createdAt INTEGER NOT NULL,
  expiresAt INTEGER NOT NULL,
  consumedAt INTEGER
);

CREATE TABLE IF NOT EXISTS starry_guest_app_operations (
  id TEXT PRIMARY KEY,
  actorUserId TEXT NOT NULL,
  appId TEXT NOT NULL,
  beforeAllowed INTEGER NOT NULL,
  afterAllowed INTEGER NOT NULL,
  createdAt INTEGER NOT NULL,
  sourceOperationId TEXT,
  undoneBy TEXT
);
