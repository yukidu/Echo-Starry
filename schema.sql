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
  guestVisible INTEGER DEFAULT 0,
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
  -- 舊欄位名稱只為現有資料相容；對外名稱與功能皆為「電池」。
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

-- 2.1 一個音檔可對應 1 位主要演講者 + 最多 4 位共同演講者。
-- tracks.speaker 保留作為舊介面相容的 A&B 顯示字串。
CREATE TABLE IF NOT EXISTS track_speakers (
  trackId TEXT NOT NULL,
  speakerName TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0 AND position < 5),
  PRIMARY KEY (trackId, position),
  UNIQUE (trackId, speakerName)
);
CREATE INDEX IF NOT EXISTS track_speakers_name ON track_speakers(speakerName);

-- 2.2 私秘 VIP 短網址密碼
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

-- 7. 電池經濟：會員的庫存、獲得、消費與完整交易歷史已永久移至
-- Starry ID 中央資料庫的 battery_transactions / battery_accounts。
-- EchoStars 不再建立任何會員電池交易帳本；以下只保留本 App 專屬狀態與規則。
-- legacy sticker_* 表名為資料相容名稱，不是會員資產帳本，也不作為跨 App 餘額來源。
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

-- App 專屬電池規則、待結算獎勵與上手名單。
CREATE TABLE IF NOT EXISTS sticker_text_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sticker_lucky_draws (operationId TEXT PRIMARY KEY,userId TEXT NOT NULL,trackId TEXT NOT NULL,rewardUnits INTEGER NOT NULL,day TEXT NOT NULL,createdAt INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sticker_lucky_member ON sticker_lucky_draws(userId,day);
CREATE TABLE IF NOT EXISTS upline_names (kind TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(kind,name));
CREATE TABLE IF NOT EXISTS upline_owners (kind TEXT NOT NULL,name TEXT NOT NULL,userId TEXT NOT NULL,PRIMARY KEY(kind,name));

-- v102 canonical shared-business organization. Personal member data remains independent.
CREATE TABLE IF NOT EXISTS organization_groups (
  id TEXT PRIMARY KEY,
  dealerId TEXT NOT NULL UNIQUE,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS organization_members (
  groupId TEXT NOT NULL,
  userId TEXT NOT NULL UNIQUE,
  memberOrder INTEGER NOT NULL DEFAULT 0,
  joinedAt INTEGER NOT NULL,
  PRIMARY KEY(groupId,userId)
);
CREATE INDEX IF NOT EXISTS organization_members_group ON organization_members(groupId,memberOrder);
CREATE TABLE IF NOT EXISTS upline_bindings (
  memberId TEXT NOT NULL,
  kind TEXT NOT NULL,
  groupId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(memberId,kind)
);
CREATE INDEX IF NOT EXISTS upline_bindings_group ON upline_bindings(groupId,kind);
