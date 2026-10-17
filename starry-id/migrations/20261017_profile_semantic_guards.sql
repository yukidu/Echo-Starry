-- v306 Starry ID profile semantic integrity guards
-- Apply only after deterministic health repairs have cleared existing violations.

PRAGMA foreign_keys = ON;

CREATE TRIGGER IF NOT EXISTS guard_profiles_rank_approved_insert
BEFORE INSERT ON profiles
WHEN COALESCE(NEW.rankApproved,0)=1 AND TRIM(COALESCE(NEW.approvedRank,''))=''
BEGIN
  SELECT RAISE(ABORT,'approved rank requires approvedRank');
END;

CREATE TRIGGER IF NOT EXISTS guard_profiles_rank_approved_update
BEFORE UPDATE OF rankApproved,approvedRank ON profiles
WHEN COALESCE(NEW.rankApproved,0)=1 AND TRIM(COALESCE(NEW.approvedRank,''))=''
BEGIN
  SELECT RAISE(ABORT,'approved rank requires approvedRank');
END;

CREATE TRIGGER IF NOT EXISTS guard_profiles_birthday_insert
BEFORE INSERT ON profiles
WHEN TRIM(COALESCE(NEW.birthday,''))<>''
  AND (LENGTH(TRIM(NEW.birthday))<>10 OR TRIM(NEW.birthday) NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(TRIM(NEW.birthday)) IS NULL)
BEGIN
  SELECT RAISE(ABORT,'birthday must use YYYY-MM-DD');
END;

CREATE TRIGGER IF NOT EXISTS guard_profiles_birthday_update
BEFORE UPDATE OF birthday ON profiles
WHEN TRIM(COALESCE(NEW.birthday,''))<>''
  AND (LENGTH(TRIM(NEW.birthday))<>10 OR TRIM(NEW.birthday) NOT GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]' OR date(TRIM(NEW.birthday)) IS NULL)
BEGIN
  SELECT RAISE(ABORT,'birthday must use YYYY-MM-DD');
END;

CREATE TRIGGER IF NOT EXISTS guard_member_relationship_self_insert
BEFORE INSERT ON member_relationships
WHEN NEW.relatedUserId IS NOT NULL AND NEW.relatedUserId=NEW.userId
BEGIN
  SELECT RAISE(ABORT,'member relationship cannot point to self');
END;

CREATE TRIGGER IF NOT EXISTS guard_member_relationship_self_update
BEFORE UPDATE OF relatedUserId,userId ON member_relationships
WHEN NEW.relatedUserId IS NOT NULL AND NEW.relatedUserId=NEW.userId
BEGIN
  SELECT RAISE(ABORT,'member relationship cannot point to self');
END;
