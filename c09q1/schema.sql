-- S45A C09/C10-Q1 offline-only migration proposal; NOT APPLIED to any D1.
-- Entirely ordinary SQLite tables: no FTS5/virtual table, no request-time DDL.
-- Not wired into Echo routes and not an authority on current member permissions.
CREATE TABLE IF NOT EXISTS q1_source_state (
  trackId TEXT PRIMARY KEY,
  activeGeneration TEXT NOT NULL,
  sourceVersion TEXT NOT NULL,
  sourceKey TEXT NOT NULL,
  sourceUpdatedAt INTEGER NOT NULL,
  permissionsRevision TEXT NOT NULL,
  authorityEpoch TEXT NOT NULL,
  invalidated INTEGER NOT NULL DEFAULT 1 CHECK(invalidated IN (0,1)),
  sourceRevision INTEGER NOT NULL DEFAULT 0,
  updatedAt INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS q1_paragraphs (
  id INTEGER PRIMARY KEY,
  trackId TEXT NOT NULL,
  generation TEXT NOT NULL,
  sourceVersion TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  fromSegment TEXT NOT NULL,
  toSegment TEXT NOT NULL,
  startMs INTEGER NOT NULL,
  endMs INTEGER NOT NULL,
  content TEXT NOT NULL,
  UNIQUE(trackId,generation,ordinal)
);
CREATE INDEX IF NOT EXISTS q1_paragraphs_by_version ON q1_paragraphs(trackId,generation);
CREATE TABLE IF NOT EXISTS q1_postings (
  term TEXT NOT NULL,
  paragraphId INTEGER NOT NULL,
  PRIMARY KEY(term,paragraphId)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS q1_postings_by_paragraph ON q1_postings(paragraphId);
-- Segments are derived; the original audio, transcripts and user correction events
-- never get rewritten, deleted or automatically re-transcribed by this schema.
-- Source edits/revocations MUST atomically mark q1_source_state.invalidated=1
-- using the upstream integration (not available in this OFF prototype).
-- A restored Echo DB snapshot cannot vouch for current membership or epoch:
-- missing external authority => deny all results at the application boundary.
