-- v322: five-track auto attribution only; manual corrections take precedence over future AI reruns.
-- Existing transcripts, tracks, comments, members and rewards are not modified.
ALTER TABLE ai_story_pilots ADD COLUMN autoRun INTEGER NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS ai_story_manual_overrides (
  trackId TEXT NOT NULL,
  segmentId TEXT NOT NULL,
  owner TEXT NOT NULL,
  editedBy TEXT NOT NULL DEFAULT '',
  editedAt INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (trackId, segmentId)
);
CREATE TABLE IF NOT EXISTS ai_story_owner_edits (
  id TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  segmentId TEXT NOT NULL,
  factId TEXT NOT NULL,
  oldOwner TEXT NOT NULL,
  newOwner TEXT NOT NULL,
  editedBy TEXT NOT NULL DEFAULT '',
  editedAt INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ai_story_owner_edits_track ON ai_story_owner_edits(trackId, editedAt DESC);
CREATE INDEX IF NOT EXISTS ai_story_pilots_auto_queue ON ai_story_pilots(autoRun,status,updatedAt);
