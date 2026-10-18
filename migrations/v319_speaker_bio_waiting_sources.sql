-- Correct only legacy false-positive 'ready' rows where no eligible public
-- transcript exists. Preserve biographies, error records and member permissions.
-- Idempotent: safe to rerun, never invokes AI or changes recording data.
UPDATE ai_speaker_profiles
SET bioStatus = 'waiting_sources',
    bioUpdatedAt = 0,
    sourceRevision = '',
    error = NULL,
    updatedAt = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE bioStatus = 'ready'
  AND length(trim(COALESCE(biography,''))) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM track_speakers ts
    JOIN tracks t ON t.id = ts.trackId
    JOIN transcript_index i ON i.trackId = t.id
    WHERE ts.speakerName = ai_speaker_profiles.displayName
      AND i.status = 'ready'
      AND i.r2Key IS NOT NULL
      AND trim(i.r2Key) != ''
      AND COALESCE(t.isPrivateVip,0) = 0
      AND COALESCE(t.authorizedOnlyVisible,0) = 0
      AND COALESCE(t.stickerUnlockCost,0) = 0
      AND trim(COALESCE(t.requiredRank,'')) IN ('','無','公開')
  );
