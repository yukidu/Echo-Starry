-- v320: five-track, admin-reviewed pilot. Does not modify original transcripts, comments or Starry ID.
CREATE TABLE IF NOT EXISTS ai_story_pilots (
  trackId TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',
  revision TEXT NOT NULL DEFAULT '',
  cursor INTEGER NOT NULL DEFAULT 0,
  r2Key TEXT NOT NULL DEFAULT '',
  error TEXT,
  reviewer TEXT NOT NULL DEFAULT '',
  approvedAt INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ai_story_facts (
  trackId TEXT NOT NULL,
  factId TEXT NOT NULL,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  narrator TEXT NOT NULL,
  segmentId TEXT NOT NULL,
  text TEXT NOT NULL,
  start REAL NOT NULL DEFAULT 0,
  sourceRevision TEXT NOT NULL,
  PRIMARY KEY (trackId,factId,owner)
);
CREATE INDEX IF NOT EXISTS ai_story_facts_owner ON ai_story_facts(owner,trackId);
INSERT OR IGNORE INTO ai_story_pilots(trackId) VALUES
  ('t-8465a416-0985-4e47-ade8-d1ba8f2f8661'),
  ('t-aaca6f2a-cb05-493e-ab19-b915773812c4'),
  ('t-7f537dd2-38f2-4d47-8f0b-ff15f3f22d95'),
  ('t-a8db1b4f-6dfa-4c0b-9f3e-e3a49c15af6a'),
  ('t-31a78e3b-4334-49b0-bb74-23aef4113817');
