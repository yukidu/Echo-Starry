-- Non-destructive speaker profile extension; existing tracks, transcript files, comments
-- and central Starry ID member tables are untouched.
CREATE TABLE IF NOT EXISTS ai_speaker_profiles (
  id TEXT PRIMARY KEY,
  nameKey TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,
  biography TEXT NOT NULL DEFAULT '',
  bioStatus TEXT NOT NULL DEFAULT 'pending',
  bioUpdatedAt INTEGER NOT NULL DEFAULT 0,
  sourceRevision TEXT NOT NULL DEFAULT '',
  requestedRevision TEXT NOT NULL DEFAULT '',
  promptKeywords TEXT NOT NULL DEFAULT '',
  promptDirection TEXT NOT NULL DEFAULT '',
  maxChars INTEGER,
  error TEXT,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ai_speaker_profiles_pending ON ai_speaker_profiles(bioStatus,updatedAt);
CREATE TABLE IF NOT EXISTS ai_speaker_summary_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT OR IGNORE INTO ai_speaker_summary_settings (key,value) VALUES
 ('keywords','專業經歷、人生價值、領導風格、重要觀點、事業發展'),
 ('direction','依已公開的逐字稿整理客觀人物摘要，不編造出生年月日、職位或沒有證據的經歷。'),
 ('maxChars','500'),
 ('dailyLimit','3');
CREATE TABLE IF NOT EXISTS ai_speaker_generation_daily (
  day TEXT PRIMARY KEY,
  used INTEGER NOT NULL DEFAULT 0
);
