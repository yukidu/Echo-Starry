-- B07-01 STAGING ONLY. No AI provider calls; no production runtime attachment.
-- Tenant-scoped finite budgets, exclusive request idempotency, transactional reservations.
CREATE TABLE IF NOT EXISTS starry_ai_b07_policies (
  scope_key TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  max_calls INTEGER NOT NULL DEFAULT 0 CHECK(max_calls BETWEEN 0 AND 1000000),
  max_micro_twd INTEGER NOT NULL DEFAULT 0 CHECK(max_micro_twd BETWEEN 0 AND 100000000000000),
  revision INTEGER NOT NULL DEFAULT 1,
  actor_id TEXT NOT NULL DEFAULT 'system',
  updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS starry_ai_b07_policy_history (
  id TEXT PRIMARY KEY,
  scope_key TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('save','restore')),
  before_json TEXT,
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  actor_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  restored_from TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_ai_b07_policy_history_scope
ON starry_ai_b07_policy_history(scope_key,revision DESC);
-- Price verification is separate from registry metadata and cannot be inferred
-- from "free_eligibility=eligible" without a verified, unexpired proof.
CREATE TABLE IF NOT EXISTS starry_ai_b07_tariffs (
  model_id TEXT PRIMARY KEY,
  billing_class TEXT NOT NULL CHECK(billing_class IN ('priced','free_verified')),
  micro_twd_per_unit INTEGER NOT NULL CHECK(micro_twd_per_unit BETWEEN 0 AND 1000000000000),
  daily_free_units INTEGER NOT NULL DEFAULT 0 CHECK(daily_free_units BETWEEN 0 AND 100000000000),
  proof_url TEXT NOT NULL,
  verified_at INTEGER NOT NULL,
  valid_until INTEGER NOT NULL,
  CHECK(valid_until>verified_at),
  CHECK((billing_class='priced' AND micro_twd_per_unit>0 AND daily_free_units=0)
     OR (billing_class='free_verified' AND micro_twd_per_unit=0 AND daily_free_units>0))
);
CREATE TABLE IF NOT EXISTS starry_ai_b07_circuits (
  model_id TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  blocked_until INTEGER NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS starry_ai_b07_calls (
  id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL,
  day TEXT NOT NULL CHECK(length(day)=10),
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  member_key TEXT NOT NULL,
  model_id TEXT NOT NULL,
  billing_class TEXT NOT NULL CHECK(billing_class IN ('priced','free_verified')),
  status TEXT NOT NULL DEFAULT 'reserved'
    CHECK(status IN ('reserved','settled','uncertain','void')),
  max_units INTEGER NOT NULL CHECK(max_units BETWEEN 1 AND 1000000000),
  unit_micro_twd INTEGER NOT NULL CHECK(unit_micro_twd BETWEEN 0 AND 1000000000000),
  held_micro_twd INTEGER NOT NULL CHECK(held_micro_twd BETWEEN 0 AND 100000000000000),
  actual_units INTEGER NOT NULL DEFAULT 0 CHECK(actual_units>=0),
  actual_micro_twd INTEGER NOT NULL DEFAULT 0 CHECK(actual_micro_twd>=0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK(actual_micro_twd<=held_micro_twd),
  CHECK(actual_units<=max_units),
  CHECK((billing_class='free_verified' AND held_micro_twd=0) OR billing_class='priced')
);
CREATE INDEX IF NOT EXISTS starry_ai_b07_calls_day ON starry_ai_b07_calls(day,app_id,task_id,status);
CREATE INDEX IF NOT EXISTS starry_ai_b07_calls_member ON starry_ai_b07_calls(member_key,day);
CREATE TABLE IF NOT EXISTS starry_ai_b07_usage (
  day TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0 CHECK(calls>=0),
  held_micro_twd INTEGER NOT NULL DEFAULT 0 CHECK(held_micro_twd>=0),
  settled_micro_twd INTEGER NOT NULL DEFAULT 0 CHECK(settled_micro_twd>=0),
  free_units INTEGER NOT NULL DEFAULT 0 CHECK(free_units>=0),
  PRIMARY KEY(day,scope_key)
);
CREATE TABLE IF NOT EXISTS starry_ai_b07_events (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  day TEXT NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('reserve','settle','uncertain','void')),
  held_micro_twd INTEGER NOT NULL,
  settled_micro_twd INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_ai_b07_events_report
ON starry_ai_b07_events(day,app_id,task_id,action);
-- Every scope is DENY by default until explicitly configured.
INSERT OR IGNORE INTO starry_ai_b07_policies(scope_key,enabled,max_calls,max_micro_twd,actor_id,updated_at)
VALUES('global',1,0,0,'b07-safety-default',0),
      ('member:default',1,0,0,'b07-safety-default',0);
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_usage_guard_insert
BEFORE INSERT ON starry_ai_b07_usage
BEGIN
  SELECT CASE WHEN (NEW.scope_key NOT LIKE 'free:%' AND
  (COALESCE(
 (SELECT enabled FROM starry_ai_b07_policies WHERE scope_key=NEW.scope_key),
 (SELECT enabled FROM starry_ai_b07_policies WHERE scope_key='member:default'
    AND NEW.scope_key LIKE 'member:%' AND NEW.scope_key<>'member:default'),0)<>1 OR
   NEW.calls>COALESCE(
 (SELECT max_calls FROM starry_ai_b07_policies WHERE scope_key=NEW.scope_key),
 (SELECT max_calls FROM starry_ai_b07_policies WHERE scope_key='member:default'
    AND NEW.scope_key LIKE 'member:%' AND NEW.scope_key<>'member:default'),0) OR
   NEW.held_micro_twd+NEW.settled_micro_twd>COALESCE(
 (SELECT max_micro_twd FROM starry_ai_b07_policies WHERE scope_key=NEW.scope_key),
 (SELECT max_micro_twd FROM starry_ai_b07_policies WHERE scope_key='member:default'
    AND NEW.scope_key LIKE 'member:%' AND NEW.scope_key<>'member:default'),0)))
 OR (NEW.scope_key LIKE 'free:%' AND
  (NEW.free_units>COALESCE((SELECT daily_free_units FROM starry_ai_b07_tariffs
     WHERE model_id=substr(NEW.scope_key,6) AND billing_class='free_verified'
       AND valid_until>CAST(strftime('%s','now') AS INTEGER)*1000),0))) THEN RAISE(ABORT,'b07_budget_or_free_quota_exceeded') END;
END;
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_usage_guard_update
BEFORE UPDATE ON starry_ai_b07_usage
BEGIN
  -- Permit releasing prior holds even if administrators later tighten limits.
  SELECT CASE WHEN (NEW.calls>OLD.calls OR NEW.held_micro_twd+NEW.settled_micro_twd>OLD.held_micro_twd+OLD.settled_micro_twd OR NEW.free_units>OLD.free_units) AND ((NEW.scope_key NOT LIKE 'free:%' AND
  (COALESCE(
 (SELECT enabled FROM starry_ai_b07_policies WHERE scope_key=NEW.scope_key),
 (SELECT enabled FROM starry_ai_b07_policies WHERE scope_key='member:default'
    AND NEW.scope_key LIKE 'member:%' AND NEW.scope_key<>'member:default'),0)<>1 OR
   NEW.calls>COALESCE(
 (SELECT max_calls FROM starry_ai_b07_policies WHERE scope_key=NEW.scope_key),
 (SELECT max_calls FROM starry_ai_b07_policies WHERE scope_key='member:default'
    AND NEW.scope_key LIKE 'member:%' AND NEW.scope_key<>'member:default'),0) OR
   NEW.held_micro_twd+NEW.settled_micro_twd>COALESCE(
 (SELECT max_micro_twd FROM starry_ai_b07_policies WHERE scope_key=NEW.scope_key),
 (SELECT max_micro_twd FROM starry_ai_b07_policies WHERE scope_key='member:default'
    AND NEW.scope_key LIKE 'member:%' AND NEW.scope_key<>'member:default'),0)))
 OR (NEW.scope_key LIKE 'free:%' AND
  (NEW.free_units>COALESCE((SELECT daily_free_units FROM starry_ai_b07_tariffs
     WHERE model_id=substr(NEW.scope_key,6) AND billing_class='free_verified'
       AND valid_until>CAST(strftime('%s','now') AS INTEGER)*1000),0)))) THEN RAISE(ABORT,'b07_budget_or_free_quota_exceeded') END;
END;

CREATE TRIGGER IF NOT EXISTS starry_ai_b07_request_guard
BEFORE INSERT ON starry_ai_b07_calls
BEGIN
 SELECT CASE WHEN NOT EXISTS (
  SELECT 1 FROM starry_ai_models m JOIN starry_ai_b07_tariffs p ON p.model_id=m.model_id
  WHERE m.model_id=NEW.model_id AND m.registry_status='verified'
    AND p.billing_class=NEW.billing_class
    AND p.valid_until>NEW.created_at
    AND NEW.unit_micro_twd=p.micro_twd_per_unit
    AND NEW.held_micro_twd=NEW.max_units*p.micro_twd_per_unit
    AND (NEW.billing_class='priced' AND m.free_eligibility='not_eligible'
         OR NEW.billing_class='free_verified' AND m.free_eligibility='eligible')
    AND EXISTS(SELECT 1 FROM json_each(m.tasks_json) WHERE value=NEW.task_id)
 ) THEN RAISE(ABORT,'b07_model_or_tariff_not_verified') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM starry_ai_b07_circuits c
  WHERE c.model_id=NEW.model_id AND c.blocked_until>NEW.created_at
 ) THEN RAISE(ABORT,'b07_circuit_open') END;
END;
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_reserve
AFTER INSERT ON starry_ai_b07_calls
BEGIN
  INSERT INTO starry_ai_b07_usage(day,scope_key,calls,held_micro_twd,settled_micro_twd,free_units)
  VALUES(NEW.day,'global',1,NEW.held_micro_twd,0,0)
  ON CONFLICT(day,scope_key) DO UPDATE SET
    calls=calls+1,held_micro_twd=held_micro_twd+excluded.held_micro_twd;
  INSERT INTO starry_ai_b07_usage(day,scope_key,calls,held_micro_twd,settled_micro_twd,free_units)
  VALUES(NEW.day,'app:' || NEW.app_id,1,NEW.held_micro_twd,0,0)
  ON CONFLICT(day,scope_key) DO UPDATE SET
    calls=calls+1,held_micro_twd=held_micro_twd+excluded.held_micro_twd;
  INSERT INTO starry_ai_b07_usage(day,scope_key,calls,held_micro_twd,settled_micro_twd,free_units)
  VALUES(NEW.day,'task:' || NEW.app_id || ':' || NEW.task_id,1,NEW.held_micro_twd,0,0)
  ON CONFLICT(day,scope_key) DO UPDATE SET
    calls=calls+1,held_micro_twd=held_micro_twd+excluded.held_micro_twd;
  INSERT INTO starry_ai_b07_usage(day,scope_key,calls,held_micro_twd,settled_micro_twd,free_units)
  VALUES(NEW.day,'member:' || NEW.member_key,1,NEW.held_micro_twd,0,0)
  ON CONFLICT(day,scope_key) DO UPDATE SET
    calls=calls+1,held_micro_twd=held_micro_twd+excluded.held_micro_twd;

  INSERT INTO starry_ai_b07_usage(day,scope_key,calls,held_micro_twd,settled_micro_twd,free_units)
  SELECT NEW.day,'free:'||NEW.model_id,0,0,0,NEW.max_units
  WHERE NEW.billing_class='free_verified'
  ON CONFLICT(day,scope_key) DO UPDATE SET free_units=free_units+excluded.free_units;
  INSERT INTO starry_ai_b07_events
    (id,request_id,day,app_id,task_id,model_id,action,held_micro_twd,settled_micro_twd,created_at)
  VALUES ('reserve:'||NEW.id,NEW.id,NEW.day,NEW.app_id,NEW.task_id,NEW.model_id,
    'reserve',NEW.held_micro_twd,0,NEW.created_at);
END;
-- Provider timeout is UNCERTAIN: never refund the reserved cost automatically.
-- Settled costs are bounded by the prior hold (including all retries).
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_complete
AFTER UPDATE OF status ON starry_ai_b07_calls
WHEN OLD.status='reserved' AND NEW.status IN ('settled','uncertain','void')
BEGIN
  UPDATE starry_ai_b07_usage SET
   calls=calls-(CASE WHEN NEW.status='void' THEN 1 ELSE 0 END),
   held_micro_twd=held_micro_twd-(CASE WHEN NEW.status IN ('settled','void') THEN OLD.held_micro_twd ELSE 0 END),
   settled_micro_twd=settled_micro_twd+(CASE WHEN NEW.status='settled' THEN NEW.actual_micro_twd ELSE 0 END)
  WHERE day=NEW.day AND scope_key IN
    ('global','app:'||NEW.app_id,'task:'||NEW.app_id||':'||NEW.task_id,'member:'||NEW.member_key)
    AND NEW.status<>'uncertain';
  UPDATE starry_ai_b07_usage SET
    free_units=free_units-(CASE WHEN NEW.status='void' THEN OLD.max_units
       WHEN NEW.status='settled' THEN OLD.max_units-NEW.actual_units ELSE 0 END)
  WHERE day=NEW.day AND scope_key='free:'||NEW.model_id
    AND OLD.billing_class='free_verified' AND NEW.status<>'uncertain';
  INSERT INTO starry_ai_b07_events
    (id,request_id,day,app_id,task_id,model_id,action,held_micro_twd,settled_micro_twd,created_at)
  VALUES(NEW.status||':'||NEW.id,NEW.id,NEW.day,NEW.app_id,NEW.task_id,NEW.model_id,
    CASE WHEN NEW.status='settled' THEN 'settle' WHEN NEW.status='void' THEN 'void'
    ELSE 'uncertain' END,OLD.held_micro_twd,NEW.actual_micro_twd,NEW.updated_at);
END;
-- Prevent an accidental future caller from changing reserved amounts, model,
-- member, fingerprint, request key or dates outside a valid state transition.
-- Otherwise counters and idempotency could silently diverge.
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_immutable_call
BEFORE UPDATE ON starry_ai_b07_calls
WHEN NEW.id<>OLD.id OR NEW.request_key<>OLD.request_key
 OR NEW.fingerprint<>OLD.fingerprint OR NEW.day<>OLD.day
 OR NEW.app_id<>OLD.app_id OR NEW.task_id<>OLD.task_id
 OR NEW.member_key<>OLD.member_key OR NEW.model_id<>OLD.model_id
 OR NEW.billing_class<>OLD.billing_class OR NEW.max_units<>OLD.max_units
 OR NEW.unit_micro_twd<>OLD.unit_micro_twd OR NEW.held_micro_twd<>OLD.held_micro_twd
 OR NEW.created_at<>OLD.created_at
 OR (NEW.status='settled' AND NEW.actual_micro_twd<>NEW.actual_units*OLD.unit_micro_twd)
 OR (NEW.status IN ('void','uncertain') AND (NEW.actual_units<>0 OR NEW.actual_micro_twd<>0))
BEGIN SELECT RAISE(ABORT,'b07_immutable_charge_data'); END;
-- Never delete a request ID: deleting it would make replay chargeable again.
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_no_call_delete
BEFORE DELETE ON starry_ai_b07_calls
BEGIN SELECT RAISE(ABORT,'b07_request_history_cannot_be_deleted'); END;

-- All terminals and UNKNOWN outcomes are final; unknowns require manual reconciliation.
CREATE TRIGGER IF NOT EXISTS starry_ai_b07_terminal
BEFORE UPDATE OF status ON starry_ai_b07_calls
WHEN OLD.status<>'reserved' OR NEW.status NOT IN ('settled','uncertain','void')
BEGIN SELECT RAISE(ABORT,'b07_illegal_status_transition'); END;
