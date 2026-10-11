-- v185: one track can have up to five ordered speakers.
-- Runtime migration/backfill is executed idempotently by worker/favoriteRouter.ts.
CREATE TABLE IF NOT EXISTS track_speakers (
  trackId TEXT NOT NULL,
  speakerName TEXT NOT NULL,
  position INTEGER NOT NULL CHECK(position >= 0 AND position < 5),
  PRIMARY KEY (trackId, position),
  UNIQUE (trackId, speakerName)
);

CREATE INDEX IF NOT EXISTS track_speakers_name ON track_speakers(speakerName);
