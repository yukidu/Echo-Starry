-- v281: 同步逐字稿、電池解鎖、會員修錯與獎勵。
CREATE TABLE IF NOT EXISTS transcript_index (
  trackId TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  r2Key TEXT,
  model TEXT NOT NULL DEFAULT '@cf/openai/whisper-large-v3-turbo',
  chunkCount INTEGER NOT NULL DEFAULT 0,
  segmentCount INTEGER NOT NULL DEFAULT 0,
  wordCount INTEGER NOT NULL DEFAULT 0,
  durationSeconds REAL NOT NULL DEFAULT 0,
  error TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transcript_index_status ON transcript_index(status,updatedAt);

CREATE TABLE IF NOT EXISTS transcript_unlocks (
  userId TEXT NOT NULL,
  trackId TEXT NOT NULL,
  costUnits INTEGER NOT NULL,
  transactionId TEXT,
  createdAt INTEGER NOT NULL,
  PRIMARY KEY(userId,trackId)
);

CREATE TABLE IF NOT EXISTS transcript_corrections (
  id TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  segmentId TEXT NOT NULL,
  oldText TEXT NOT NULL,
  newText TEXT NOT NULL,
  userId TEXT NOT NULL,
  rewardUnits INTEGER NOT NULL DEFAULT 0,
  rewarded INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transcript_corrections_segment ON transcript_corrections(trackId,segmentId,createdAt DESC);

CREATE TABLE IF NOT EXISTS transcript_settings (
  key TEXT PRIMARY KEY,
  valueUnits INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL,
  updatedBy TEXT
);
INSERT OR IGNORE INTO transcript_settings(key,valueUnits,updatedAt,updatedBy)
VALUES ('unlock_cost_units',10,unixepoch()*1000,'system');
INSERT OR IGNORE INTO transcript_settings(key,valueUnits,updatedAt,updatedBy)
VALUES ('correction_reward_units',1,unixepoch()*1000,'system');
