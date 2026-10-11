import type { Env } from './index';

const ready = new WeakMap<object, Promise<void>>();

const PREVIEW_SCHEMA = String.raw`
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
  lifeNumber INTEGER,
  motto TEXT
);

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
  stickerUnlockCost INTEGER DEFAULT 0,
  commentStickerReward INTEGER DEFAULT 0,
  externalVideos TEXT,
  externalPpts TEXT,
  externalFiles TEXT,
  likedBy TEXT,
  ratings TEXT,
  favoritedBy TEXT,
  favoriteCount INTEGER DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS tracks_share_slug_unique
  ON tracks(shareSlug) WHERE shareSlug IS NOT NULL AND shareSlug <> '';

CREATE TABLE IF NOT EXISTS track_speakers (
  trackId TEXT NOT NULL,
  speakerName TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0 AND position < 5),
  PRIMARY KEY(trackId, position)
);
CREATE INDEX IF NOT EXISTS track_speakers_name ON track_speakers(speakerName);
CREATE INDEX IF NOT EXISTS track_speakers_track ON track_speakers(trackId);

CREATE TABLE IF NOT EXISTS vip_share_access (
  trackId TEXT PRIMARY KEY,
  password TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);

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

CREATE TABLE IF NOT EXISTS categories (
  name TEXT PRIMARY KEY,
  createdAt INTEGER
);
INSERT OR IGNORE INTO categories(name, createdAt) VALUES
  ('事業',0),('心態思維',0),('營養',0),('安麗產品',0),('影集',0),('未分類',0);

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

CREATE TABLE IF NOT EXISTS playback_identity_aliases (
  alias TEXT PRIMARY KEY,
  memberId TEXT NOT NULL,
  aliasType TEXT NOT NULL,
  source TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS playback_alias_member ON playback_identity_aliases(memberId);

CREATE TABLE IF NOT EXISTS share_events (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  userEmail TEXT NOT NULL,
  trackId TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS share_events_user ON share_events(userId, userEmail);
CREATE INDEX IF NOT EXISTS share_events_created ON share_events(createdAt);

CREATE TABLE IF NOT EXISTS user_activity_logs (
  id TEXT PRIMARY KEY,
  userEmail TEXT NOT NULL,
  userId TEXT,
  actionType TEXT NOT NULL,
  details TEXT,
  timestamp INTEGER NOT NULL,
  createdAt TEXT NOT NULL
);

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
CREATE TABLE IF NOT EXISTS sticker_comment_rewards (
  commentId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  trackId TEXT NOT NULL,
  rewardUnits INTEGER NOT NULL,
  kind TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sticker_pending_member_track ON sticker_comment_rewards(userId, trackId);
CREATE TABLE IF NOT EXISTS sticker_text_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sticker_lucky_draws (
  operationId TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  trackId TEXT NOT NULL,
  rewardUnits INTEGER NOT NULL,
  day TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sticker_lucky_member ON sticker_lucky_draws(userId, day);
CREATE TABLE IF NOT EXISTS upline_names (kind TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(kind,name));
CREATE TABLE IF NOT EXISTS upline_owners (kind TEXT NOT NULL, name TEXT NOT NULL, userId TEXT NOT NULL, PRIMARY KEY(kind,name));

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
CREATE INDEX IF NOT EXISTS organization_members_group ON organization_members(groupId, memberOrder);
CREATE TABLE IF NOT EXISTS upline_bindings (
  memberId TEXT NOT NULL,
  kind TEXT NOT NULL,
  groupId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(memberId,kind)
);
CREATE INDEX IF NOT EXISTS upline_bindings_group ON upline_bindings(groupId,kind);

CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY);
`;

export async function ensurePreviewBootstrap(env: Env) {
  if (env.ENVIRONMENT !== 'preview' || !env.DB) return;
  const db = env.DB as object;
  let task = ready.get(db);
  if (!task) {
    task = (async () => {
      await env.DB.exec(PREVIEW_SCHEMA);
    })();
    ready.set(db, task);
    task.catch(() => ready.delete(db));
  }
  await task;
}
