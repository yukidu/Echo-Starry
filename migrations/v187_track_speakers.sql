-- v187: one recording can have one primary speaker plus up to four co-speakers.
-- The Worker creates/backfills this table idempotently for existing production data.
CREATE TABLE IF NOT EXISTS track_speakers (
  trackId TEXT NOT NULL,
  speakerName TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0 AND position < 5),
  PRIMARY KEY (trackId, position),
  UNIQUE (trackId, speakerName)
);

CREATE INDEX IF NOT EXISTS track_speakers_name ON track_speakers(speakerName);
