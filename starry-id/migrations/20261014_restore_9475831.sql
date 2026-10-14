-- A1 confirmed repair: restore the central Starry ID distributor number for 杜杜龍.
-- Safety preconditions are enforced by 20261014_restore_9475831.sh before this file runs.
-- This SQL is intentionally idempotent and scoped to the exact historical state.

INSERT OR IGNORE INTO profile_audit_logs
  (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt)
SELECT
  'a1-restore-9475831-20261014',
  p.userId,
  'starry-id',
  p.userId,
  'amwayId',
  'n8405265',
  '9475831',
  CAST(strftime('%s','now') AS INTEGER) * 1000
FROM profiles p
WHERE TRIM(COALESCE(p.name,''))='杜杜龍'
  AND TRIM(COALESCE(p.amwayId,''))='n8405265'
  AND NOT EXISTS (
    SELECT 1 FROM profiles other
    WHERE TRIM(COALESCE(other.amwayId,''))='9475831'
      AND other.userId<>p.userId
  )
  AND NOT EXISTS (
    SELECT 1 FROM spouse_links sl
    WHERE (sl.userA=p.userId OR sl.userB=p.userId)
      AND sl.status IN ('pending','active','unlink_pending')
  );

UPDATE profiles
SET amwayId='9475831',
    updatedAt=CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE userId=(
  SELECT userId FROM profile_audit_logs
  WHERE id='a1-restore-9475831-20261014'
  LIMIT 1
)
  AND TRIM(COALESCE(amwayId,''))='n8405265';

DELETE FROM non_distributor_ids
WHERE userId=(
  SELECT userId FROM profile_audit_logs
  WHERE id='a1-restore-9475831-20261014'
  LIMIT 1
);
