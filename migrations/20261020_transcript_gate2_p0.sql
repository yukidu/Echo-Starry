-- Gate2 P0: additive schema only. Never run against production without separate approval.
-- No R2 objects or existing transcript_index rows are rewritten.
ALTER TABLE transcript_index ADD COLUMN activeVersionId TEXT;
ALTER TABLE transcript_index ADD COLUMN workingRunId TEXT;
CREATE TABLE transcript_runs (
  runId TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  intent TEXT NOT NULL CHECK(intent IN ('first','relisten')),
  requestKey TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('pending','queued','processing','awaiting_review','published','failed')),
  generation INTEGER NOT NULL DEFAULT 0,
  leaseUntil INTEGER NOT NULL DEFAULT 0,
  sourceAudioKey TEXT NOT NULL,
  expectedActiveR2Key TEXT,
  candidateVersionId TEXT,
  approvedBy TEXT,
  approvedAt INTEGER,
  approvedMaxSeconds REAL NOT NULL DEFAULT 0,
  error TEXT,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX transcript_runs_one_active ON transcript_runs(trackId)
 WHERE state IN ('pending','queued','processing','awaiting_review');
CREATE INDEX transcript_runs_schedulable ON transcript_runs(state,createdAt);
CREATE TABLE transcript_versions (
  versionId TEXT PRIMARY KEY,
  trackId TEXT NOT NULL,
  runId TEXT NOT NULL UNIQUE,
  jsonKey TEXT NOT NULL,
  txtKey TEXT NOT NULL,
  vttKey TEXT NOT NULL,
  rawKey TEXT NOT NULL,
  manifestKey TEXT NOT NULL,
  checksum TEXT NOT NULL,
  sourceAudioKey TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX transcript_versions_by_track ON transcript_versions(trackId,createdAt);
