-- v281: 預留逐字稿社群貢獻統計架構。
-- 本版只建立資料結構，不啟用排行榜／徽章／學習進度 UI。
-- 原始事實仍以 transcript_correction_events 為準；此表未來作快速統計快取，可隨時重建。

CREATE TABLE IF NOT EXISTS transcript_contributor_stats (
  userId TEXT PRIMARY KEY,
  correctionCount INTEGER NOT NULL DEFAULT 0,
  correctedTextUnits INTEGER NOT NULL DEFAULT 0,
  correctedTrackCount INTEGER NOT NULL DEFAULT 0,
  acceptedCount INTEGER NOT NULL DEFAULT 0,
  supplementedCount INTEGER NOT NULL DEFAULT 0,
  revokedCount INTEGER NOT NULL DEFAULT 0,
  rewardedCorrectionCount INTEGER NOT NULL DEFAULT 0,
  firstCorrectionAt INTEGER,
  lastCorrectionAt INTEGER,
  updatedAt INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS transcript_contributor_stats_ranking
  ON transcript_contributor_stats(correctedTextUnits DESC, correctedTrackCount DESC, correctionCount DESC);

-- 未來徽章發放紀錄；同一會員同一徽章只會有一筆，避免重複發放。
CREATE TABLE IF NOT EXISTS transcript_contributor_badges (
  userId TEXT NOT NULL,
  badgeKey TEXT NOT NULL,
  awardedAt INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY(userId,badgeKey)
);
CREATE INDEX IF NOT EXISTS transcript_contributor_badges_time
  ON transcript_contributor_badges(awardedAt DESC);

-- 未來個人學習進度可直接引用，不與中央會員固定資料混在一起。
CREATE TABLE IF NOT EXISTS transcript_learning_contribution_daily (
  userId TEXT NOT NULL,
  dayKey TEXT NOT NULL,
  correctionCount INTEGER NOT NULL DEFAULT 0,
  correctedTextUnits INTEGER NOT NULL DEFAULT 0,
  correctedTrackCount INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL,
  PRIMARY KEY(userId,dayKey)
);
CREATE INDEX IF NOT EXISTS transcript_learning_contribution_daily_day
  ON transcript_learning_contribution_daily(dayKey,userId);