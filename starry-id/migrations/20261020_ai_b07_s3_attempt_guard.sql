-- S3-B07 STAGING-ONLY ADDITIVE migration. DO NOT APPLY TO PRODUCTION.
-- Requires 20261020_ai_b07_budget_guard.sql in this isolated test database.
-- No source AI, member, Echo, Workflow, backup or existing B07 schema changed.
CREATE TABLE IF NOT EXISTS starry_ai_b07_s3_run_plans (
  request_id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  segment_count INTEGER NOT NULL CHECK(segment_count BETWEEN 1 AND 10000),
  max_attempts_per_segment INTEGER NOT NULL CHECK(max_attempts_per_segment BETWEEN 1 AND 5),
  max_units_per_attempt INTEGER NOT NULL CHECK(max_units_per_attempt BETWEEN 1 AND 1000000000),
  created_at INTEGER NOT NULL
);
CREATE TRIGGER IF NOT EXISTS b07_s3_plan_insert_guard
BEFORE INSERT ON starry_ai_b07_s3_run_plans
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM starry_ai_b07_calls c
    WHERE c.id=NEW.request_id AND c.status='reserved'
      AND c.fingerprint=NEW.fingerprint
      AND c.max_units=NEW.segment_count*NEW.max_attempts_per_segment*NEW.max_units_per_attempt
  ) THEN RAISE(ABORT,'b07_s3_invalid_run_reservation') END;
END;
CREATE TRIGGER IF NOT EXISTS b07_s3_plan_no_update
BEFORE UPDATE ON starry_ai_b07_s3_run_plans
BEGIN SELECT RAISE(ABORT,'b07_s3_plan_immutable'); END;
CREATE TRIGGER IF NOT EXISTS b07_s3_plan_no_delete
BEFORE DELETE ON starry_ai_b07_s3_run_plans
BEGIN SELECT RAISE(ABORT,'b07_s3_plan_immutable'); END;

CREATE TABLE IF NOT EXISTS starry_ai_b07_s3_attempts (
  attempt_key TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  segment_index INTEGER NOT NULL CHECK(segment_index>=0),
  attempt_ordinal INTEGER NOT NULL CHECK(attempt_ordinal>=0),
  max_units INTEGER NOT NULL CHECK(max_units>0),
  status TEXT NOT NULL DEFAULT 'may_have_sent'
    CHECK(status IN ('may_have_sent','settled','uncertain')),
  actual_units INTEGER NOT NULL DEFAULT 0 CHECK(actual_units>=0),
  receipt_digest TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(request_id,segment_index,attempt_ordinal)
);
CREATE INDEX IF NOT EXISTS b07_s3_attempt_run ON starry_ai_b07_s3_attempts(request_id,status);
-- SQLite serializes INSERT writers. This is the ONLY one-time send ticket;
-- a successful INSERT counts as *possibly sent* even if Worker dies before network IO.
CREATE TRIGGER IF NOT EXISTS b07_s3_attempt_guard
BEFORE INSERT ON starry_ai_b07_s3_attempts
BEGIN
 SELECT CASE WHEN NOT EXISTS (
   SELECT 1 FROM starry_ai_b07_s3_run_plans p
   JOIN starry_ai_b07_calls c ON c.id=p.request_id
   WHERE p.request_id=NEW.request_id AND c.status='reserved'
     AND NEW.segment_index<p.segment_count
     AND NEW.attempt_ordinal<p.max_attempts_per_segment
     AND NEW.max_units=p.max_units_per_attempt
     AND (SELECT COALESCE(SUM(a.max_units),0) FROM starry_ai_b07_s3_attempts a
          WHERE a.request_id=NEW.request_id)+NEW.max_units<=c.max_units
 ) THEN RAISE(ABORT,'b07_s3_missing_or_insufficient_reservation') END;
 -- No automatic retry of an unknown/settled model invocation for a segment.
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM starry_ai_b07_s3_attempts a
   WHERE a.request_id=NEW.request_id AND
     (a.segment_index=NEW.segment_index OR a.status IN ('may_have_sent','uncertain'))
 ) THEN RAISE(ABORT,'b07_s3_attempt_already_used_or_unresolved') END;
END;
CREATE TRIGGER IF NOT EXISTS b07_s3_attempt_immutable_transition
BEFORE UPDATE ON starry_ai_b07_s3_attempts
WHEN OLD.status<>'may_have_sent'
 OR NEW.status NOT IN ('settled','uncertain')
 OR NEW.attempt_key<>OLD.attempt_key OR NEW.request_id<>OLD.request_id
 OR NEW.segment_index<>OLD.segment_index OR NEW.attempt_ordinal<>OLD.attempt_ordinal
 OR NEW.max_units<>OLD.max_units OR NEW.created_at<>OLD.created_at
 OR NEW.actual_units>OLD.max_units
 OR (NEW.status='uncertain' AND (NEW.actual_units<>0 OR NEW.receipt_digest<>''))
 OR (NEW.status='settled' AND length(NEW.receipt_digest)<>64)
BEGIN SELECT RAISE(ABORT,'b07_s3_attempt_immutable'); END;
CREATE TRIGGER IF NOT EXISTS b07_s3_attempt_no_delete
BEFORE DELETE ON starry_ai_b07_s3_attempts
BEGIN SELECT RAISE(ABORT,'b07_s3_attempt_immutable'); END;

-- Original uncertain call remains forever unchanged. Reconciliation is an
-- append-only COMPENSATING entry; it updates scoped accounting exactly once.
CREATE TABLE IF NOT EXISTS starry_ai_b07_s3_reconciliations (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  evidence_source TEXT NOT NULL CHECK(evidence_source IN ('provider_invoice','account_meter_verified')),
  evidence_digest TEXT NOT NULL CHECK(length(evidence_digest)=64),
  first_reviewer TEXT NOT NULL CHECK(length(first_reviewer) BETWEEN 8 AND 150),
  second_reviewer TEXT NOT NULL CHECK(length(second_reviewer) BETWEEN 8 AND 150),
  actual_units INTEGER NOT NULL CHECK(actual_units>=0),
  settled_micro_twd INTEGER NOT NULL CHECK(settled_micro_twd>=0),
  released_micro_twd INTEGER NOT NULL CHECK(released_micro_twd>=0),
  created_at INTEGER NOT NULL,
  CHECK(first_reviewer<>second_reviewer)
);
CREATE TRIGGER IF NOT EXISTS b07_s3_reconcile_guard
BEFORE INSERT ON starry_ai_b07_s3_reconciliations
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM starry_ai_b07_calls c
  WHERE c.id=NEW.request_id AND c.status='uncertain'
    AND NEW.actual_units<=c.max_units
    AND NEW.settled_micro_twd=NEW.actual_units*c.unit_micro_twd
    AND NEW.released_micro_twd=c.held_micro_twd-NEW.settled_micro_twd
 ) THEN RAISE(ABORT,'b07_s3_reconciliation_not_authorized') END;
END;
CREATE TRIGGER IF NOT EXISTS b07_s3_reconcile_accounting
AFTER INSERT ON starry_ai_b07_s3_reconciliations
BEGIN
 UPDATE starry_ai_b07_usage SET
   held_micro_twd=held_micro_twd-(
     SELECT c.held_micro_twd FROM starry_ai_b07_calls c WHERE c.id=NEW.request_id),
   settled_micro_twd=settled_micro_twd+NEW.settled_micro_twd
 WHERE (day,scope_key) IN (
   SELECT c.day,'global' FROM starry_ai_b07_calls c WHERE c.id=NEW.request_id
   UNION ALL SELECT c.day,'app:'||c.app_id FROM starry_ai_b07_calls c WHERE c.id=NEW.request_id
   UNION ALL SELECT c.day,'task:'||c.app_id||':'||c.task_id FROM starry_ai_b07_calls c WHERE c.id=NEW.request_id
   UNION ALL SELECT c.day,'member:'||c.member_key FROM starry_ai_b07_calls c WHERE c.id=NEW.request_id
 );
 UPDATE starry_ai_b07_usage SET free_units=free_units-(
     SELECT c.max_units-NEW.actual_units FROM starry_ai_b07_calls c WHERE c.id=NEW.request_id)
 WHERE (day,scope_key) IN (
   SELECT c.day,'free:'||c.model_id FROM starry_ai_b07_calls c
   WHERE c.id=NEW.request_id AND c.billing_class='free_verified'
 );
END;
CREATE TRIGGER IF NOT EXISTS b07_s3_reconcile_no_update
BEFORE UPDATE ON starry_ai_b07_s3_reconciliations
BEGIN SELECT RAISE(ABORT,'b07_s3_reconciliation_immutable'); END;
CREATE TRIGGER IF NOT EXISTS b07_s3_reconcile_no_delete
BEFORE DELETE ON starry_ai_b07_s3_reconciliations
BEGIN SELECT RAISE(ABORT,'b07_s3_reconciliation_immutable'); END;
