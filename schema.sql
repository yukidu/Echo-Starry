-- Cloudflare D1 Database Schema for 繁星回聲 (Echoes of Stars)
-- 執行方式: wrangler d1 execute echoes_db --file=./schema.sql

-- 1. 會員表 (users)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  amwayId TEXT,
  phone TEXT,
  center TEXT,
  rank TEXT DEFAULT '3%',
  role TEXT DEFAULT '一般夥伴',
  avatar TEXT,
  joinReason TEXT,
  stayReason TEXT,
  sponsor TEXT,
  platinumUpline TEXT,
  diamondUpline TEXT,
  birthDate TEXT,
  notes TEXT,
  registerDate TEXT,
  rankUpdatedAt TEXT,
  lastActive TEXT,
  auditedBy TEXT,
  auditedAt TEXT,
  rankApproved INTEGER DEFAULT 0,
  rankAuditStatus TEXT DEFAULT 'approved',
  isContributor INTEGER DEFAULT 0,
  isAdminUser INTEGER DEFAULT 0,
  isBlocked INTEGER DEFAULT 0,
  residence TEXT,
  birthday TEXT,
  approvedRank TEXT,
  rankAuditType TEXT,
  canUpload INTEGER DEFAULT 0,
  playCount INTEGER DEFAULT 0,
  googleAvatar TEXT,
  avatarUploadCount INTEGER DEFAULT 0,
  avatarUploadMonth TEXT,
  profileEditCount INTEGER DEFAULT 0,
  profileEditMonth TEXT,
  zodiac TEXT,
  talentNumber INTEGER,
  lifeNumber INTEGER
);

-- 2. 音檔表 (tracks)
CREATE TABLE IF NOT EXISTS tracks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  speaker TEXT NOT NULL,
  speakerRank TEXT,
  speakerAvatar TEXT,
  shareSlug TEXT,
  categories TEXT,
  keywordMeta TEXT DEFAULT '{}',
  keywords TEXT,
  rating REAL DEFAULT 5.0,
  ratingCount INTEGER DEFAULT 1,
  commentsCount INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  duration TEXT,
  durationSeconds INTEGER DEFAULT 600,
  audioUrl TEXT NOT NULL,
  series TEXT,
  speechDate TEXT,
  requiredRank TEXT DEFAULT '無',
  seriesOrder TEXT,
  uploadDate TEXT,
  description TEXT,
  uploaderId TEXT,
  uploaderEmail TEXT,
  playCount INTEGER DEFAULT 0,
  isPrivateVip INTEGER DEFAULT 0,
  vipToken TEXT,
  vipExpiresAt INTEGER,
  vipDurationDays INTEGER DEFAULT 7,
  stickerUnlockCost INTEGER DEFAULT 0,
  commentStickerReward INTEGER DEFAULT 0,
  externalVideos TEXT,
  externalPpts TEXT,
  externalFiles TEXT,
  likedBy TEXT,
  ratings TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS tracks_share_slug_unique
  ON tracks(shareSlug)
  WHERE shareSlug IS NOT NULL AND shareSlug <> '';

-- 2.1 私秘 VIP 短網址密碼
CREATE TABLE IF NOT EXISTS vip_share_access (
  trackId TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

-- 3. 留言表 (comments)
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  authorName TEXT NOT NULL,
  authorAvatar TEXT,
  authorBadge TEXT,
  authorEmail TEXT,
  content TEXT NOT NULL,
  timestamp TEXT,
  createdAt INTEGER,
  likes INTEGER DEFAULT 0,
  replyToId TEXT,
  replyToAuthor TEXT,
  isAdmin INTEGER DEFAULT 0,
  deviceId TEXT,
  likedBy TEXT
);

-- 4. 分類標籤表 (categories)
CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  createdAt INTEGER
);

-- 分類完全由後台管理中心維護。
-- 不在 schema.sql 重新寫入預設分類，避免管理員已刪除的分類在日後重跑 schema 時復活。

-- 5. 播放進度記憶。memberId 是新的唯一 canonical owner；
-- userIdentifier / key 保留只為相容歷史 email、舊 user id、匿名 device id。
CREATE TABLE IF NOT EXISTS playback_memories (
  key TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  userIdentifier TEXT NOT NULL,
  memberId TEXT,
  currentTime REAL DEFAULT 0,
  duration REAL DEFAULT 0,
  progressPercent REAL DEFAULT 0,
  lastPlayedAt INTEGER,
  completed INTEGER DEFAULT 0,
  trackTitle TEXT,
  trackSpeaker TEXT,
  trackSpeakerRank TEXT,
  isDeleted INTEGER DEFAULT 0,
  firstListenDate TEXT,
  lastListenDate TEXT,
  finishDate TEXT
);
CREATE INDEX IF NOT EXISTS playback_memories_member ON playback_memories(memberId);
CREATE INDEX IF NOT EXISTS playback_memories_user ON playback_memories(userIdentifier);
CREATE INDEX IF NOT EXISTS playback_memories_track ON playback_memories(trackId);

-- 5.1 歷史身份別名 -> 穩定會員 id。email / user id 可直接建立；
-- device id 只在有明確證據（例如同一裝置只對應一個會員 Email）時才歸戶。
CREATE TABLE IF NOT EXISTS playback_identity_aliases (
  alias TEXT PRIMARY KEY,
  memberId TEXT NOT NULL,
  aliasType TEXT NOT NULL,
  source TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playback_alias_member ON playback_identity_aliases(memberId);

-- 5.2 會員實際完成分享操作的次數（複製分享文案／系統分享）
CREATE TABLE IF NOT EXISTS share_events (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  trackId TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS share_events_user ON share_events(userId, userEmail);
CREATE INDEX IF NOT EXISTS share_events_created ON share_events(createdAt);

-- 6. 會員行為與異動歷程紀錄表 (user_activity_logs)
CREATE TABLE IF NOT EXISTS user_activity_logs (
  id TEXT PRIMARY KEY,
  userEmail TEXT NOT NULL,
  userId TEXT,
  actionType TEXT NOT NULL,
  details TEXT,
  timestamp INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);

-- 7. 貼紙點數：以 0.1 張為 1 unit 的整數帳本，避免浮點誤差。
CREATE TABLE IF NOT EXISTS sticker_transactions (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  deltaUnits INTEGER NOT NULL,
  balanceAfterUnits INTEGER NOT NULL,
  type TEXT NOT NULL,
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
CREATE INDEX IF NOT EXISTS sticker_transactions_user_created ON sticker_transactions(userId, createdAt DESC);
CREATE INDEX IF NOT EXISTS sticker_transactions_source ON sticker_transactions(sourceId, type);
CREATE TRIGGER IF NOT EXISTS sticker_spend_balance_guard
BEFORE INSERT ON sticker_transactions
WHEN NEW.type IN ('vip_upload_cost', 'lucky_cost', 'track_unlock_cost')
  AND COALESCE((SELECT SUM(deltaUnits) FROM sticker_transactions WHERE userId = NEW.userId), 0) + NEW.deltaUnits < 0
BEGIN SELECT RAISE(ABORT, 'sticker_insufficient'); END;

CREATE TABLE IF NOT EXISTS sticker_unlocks (
  userId TEXT NOT NULL,
  trackId TEXT NOT NULL,
  costUnits INTEGER NOT NULL,
  transactionId TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY(userId, trackId)
);

CREATE TABLE IF NOT EXISTS sticker_settings (
  key TEXT PRIMARY KEY,
  valueUnits INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT
);

CREATE TABLE IF NOT EXISTS member_notifications (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  readAt INTEGER,
  sourceId TEXT UNIQUE
);

-- 會員在首次 Google 登入時建立，不預先寫入個人範例資料。

CREATE TABLE IF NOT EXISTS sticker_comment_rewards (
  commentId TEXT PRIMARY KEY, userId TEXT NOT NULL, trackId TEXT NOT NULL,
  rewardUnits INTEGER NOT NULL, kind TEXT NOT NULL, createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sticker_pending_member_track ON sticker_comment_rewards(userId,trackId);

-- v100 configurable feedback, lucky completion, and maintained upline names.
CREATE TABLE IF NOT EXISTS sticker_text_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sticker_lucky_draws (operationId TEXT PRIMARY KEY,userId TEXT NOT NULL,trackId TEXT NOT NULL,rewardUnits INTEGER NOT NULL,day TEXT NOT NULL,createdAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sticker_lucky_member ON sticker_lucky_draws(userId,day);
CREATE TABLE IF NOT EXISTS upline_names (kind TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(kind,name));
CREATE TABLE IF NOT EXISTS upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name));
CREATE TABLE IF NOT EXISTS couple_links (
  amwayId TEXT PRIMARY KEY,
  userAId TEXT NOT NULL UNIQUE,
  userBId TEXT NOT NULL UNIQUE,
  createdBy TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
