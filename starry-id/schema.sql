-- Starry ID 中央會員中心 / Cloudflare D1
-- Phase 1: 從 EchoStars 抽離共用會員身份與固定基本資料。
-- 原則：中央會員資料只有一份；App 專屬權限與行為資料放 app_memberships 或原 App DB。

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  primaryEmail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users(LOWER(TRIM(primaryEmail)));
CREATE INDEX IF NOT EXISTS users_status ON users(status);

CREATE TABLE IF NOT EXISTS identities (
  provider TEXT NOT NULL,
  providerSubject TEXT NOT NULL,
  userId TEXT NOT NULL,
  providerEmail TEXT,
  emailVerified INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  lastSeenAt INTEGER,
  PRIMARY KEY(provider, providerSubject),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS identities_user ON identities(userId);
CREATE INDEX IF NOT EXISTS identities_provider_email ON identities(provider, LOWER(TRIM(providerEmail)));

CREATE TABLE IF NOT EXISTS profiles (
  userId TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  avatar TEXT,
  googleAvatar TEXT,
  amwayId TEXT,
  phone TEXT,
  residence TEXT,
  center TEXT,
  rank TEXT,
  approvedRank TEXT,
  rankApproved INTEGER NOT NULL DEFAULT 0,
  rankAuditStatus TEXT,
  rankAuditType TEXT,
  rankUpdatedAt TEXT,
  joinReason TEXT,
  stayReason TEXT,
  birthday TEXT,
  motto TEXT,
  zodiac TEXT,
  talentNumber INTEGER,
  lifeNumber INTEGER,
  registerDate TEXT,
  auditedBy TEXT,
  auditedAt TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profiles_amway_id ON profiles(amwayId);
CREATE INDEX IF NOT EXISTS profiles_rank ON profiles(rank);

-- 推薦人 / 白金上線 / 鑽石上線等跨 App 共用關係。
-- 初次搬移時若舊資料只有姓名字串，先保留 legacyLabel，不猜測同名會員。
CREATE TABLE IF NOT EXISTS member_relationships (
  userId TEXT NOT NULL,
  relationType TEXT NOT NULL CHECK(relationType IN ('sponsor','platinum_upline','diamond_upline')),
  relatedUserId TEXT,
  legacyLabel TEXT,
  resolutionStatus TEXT NOT NULL DEFAULT 'unresolved',
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId, relationType),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(relatedUserId) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS member_relationships_related ON member_relationships(relatedUserId);

-- App 專屬身份與權限不污染中央 profile。
CREATE TABLE IF NOT EXISTS app_memberships (
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  role TEXT,
  isAdminUser INTEGER NOT NULL DEFAULT 0,
  isContributor INTEGER NOT NULL DEFAULT 0,
  canUpload INTEGER NOT NULL DEFAULT 0,
  joinedAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId, appId),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS app_memberships_app ON app_memberships(appId, status);

-- 保留舊系統 ID，讓既有播放、收藏、學習紀錄不需要重寫 owner id。
CREATE TABLE IF NOT EXISTS legacy_links (
  sourceApp TEXT NOT NULL,
  sourceUserId TEXT NOT NULL,
  userId TEXT NOT NULL,
  sourceEmail TEXT,
  importedAt INTEGER NOT NULL,
  PRIMARY KEY(sourceApp, sourceUserId),
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS legacy_links_user ON legacy_links(userId);

-- 所有中央基本資料修改都留下異動紀錄。
CREATE TABLE IF NOT EXISTS profile_audit_logs (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  appId TEXT NOT NULL,
  actorUserId TEXT,
  fieldName TEXT NOT NULL,
  oldValue TEXT,
  newValue TEXT,
  createdAt INTEGER NOT NULL,
  FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS profile_audit_logs_user_created ON profile_audit_logs(userId, createdAt DESC);
CREATE INDEX IF NOT EXISTS profile_audit_logs_app_created ON profile_audit_logs(appId, createdAt DESC);

-- Migration 可重跑、可追蹤、可查錯，不直接刪除來源資料。
CREATE TABLE IF NOT EXISTS migration_batches (
  id TEXT PRIMARY KEY,
  sourceApp TEXT NOT NULL,
  status TEXT NOT NULL,
  startedAt INTEGER NOT NULL,
  completedAt INTEGER,
  scannedCount INTEGER NOT NULL DEFAULT 0,
  migratedCount INTEGER NOT NULL DEFAULT 0,
  skippedCount INTEGER NOT NULL DEFAULT 0,
  issueCount INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS migration_issues (
  id TEXT PRIMARY KEY,
  batchId TEXT NOT NULL,
  sourceApp TEXT NOT NULL,
  sourceUserId TEXT,
  issueType TEXT NOT NULL,
  details TEXT,
  createdAt INTEGER NOT NULL,
  resolvedAt INTEGER,
  FOREIGN KEY(batchId) REFERENCES migration_batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS migration_issues_batch ON migration_issues(batchId, issueType);
