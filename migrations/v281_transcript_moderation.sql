-- v281: 逐字稿即時修正、版本追蹤、超級管理員後台檢視與電池撤銷。
CREATE TABLE IF NOT EXISTS transcript_correction_events (
  id TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  segmentId TEXT NOT NULL,
  parentId TEXT,
  segmentStart REAL NOT NULL DEFAULT 0,
  segmentEnd REAL NOT NULL DEFAULT 0,
  oldText TEXT NOT NULL,
  newText TEXT NOT NULL,
  userId TEXT NOT NULL,
  userName TEXT NOT NULL DEFAULT '',
  rewardUnits INTEGER NOT NULL DEFAULT 0,
  rewardTransactionId TEXT,
  rewardReversalTransactionId TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review',
  adminText TEXT,
  reviewedBy TEXT,
  reviewedByName TEXT,
  reviewedAt INTEGER,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS transcript_correction_events_status
  ON transcript_correction_events(status,createdAt DESC);
CREATE INDEX IF NOT EXISTS transcript_correction_events_segment
  ON transcript_correction_events(trackId,segmentId,createdAt DESC);
CREATE INDEX IF NOT EXISTS transcript_correction_events_user
  ON transcript_correction_events(userId,createdAt DESC);
