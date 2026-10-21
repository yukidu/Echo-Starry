-- AI3 A03: disposable LOCAL SQLITE TEST SCHEMA ONLY.
-- NEVER apply to Production D1. No Provider network and no secrets.
PRAGMA foreign_keys=ON;
CREATE TABLE ai3_a03_budget_authority (
  scope_key TEXT PRIMARY KEY CHECK(scope_key='global'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  epoch INTEGER NOT NULL CHECK(epoch>0),
  max_micro_twd INTEGER NOT NULL DEFAULT 0 CHECK(max_micro_twd>=0)
);
CREATE TABLE ai3_a03_subject_watermarks (
  subject_id TEXT NOT NULL,
  app_id TEXT NOT NULL,
  grant_revision INTEGER NOT NULL CHECK(grant_revision>0),
  permission_revision INTEGER NOT NULL CHECK(permission_revision>0),
  active INTEGER NOT NULL CHECK(active IN(0,1)),
  PRIMARY KEY(subject_id,app_id)
);
CREATE TABLE ai3_a03_resource_watermarks (
  resource_key TEXT NOT NULL,
  app_id TEXT NOT NULL,
  resource_revision INTEGER NOT NULL CHECK(resource_revision>0),
  source_revision INTEGER NOT NULL CHECK(source_revision>0),
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch>0),
  active INTEGER NOT NULL CHECK(active IN(0,1)),
  PRIMARY KEY(resource_key,app_id)
);
CREATE TABLE ai3_a03_holds (
  job_key TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL,
  app_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  grant_revision INTEGER NOT NULL CHECK(grant_revision>0),
  permission_revision INTEGER NOT NULL CHECK(permission_revision>0),
  resource_revision INTEGER NOT NULL CHECK(resource_revision>0),
  source_revision INTEGER NOT NULL CHECK(source_revision>0),
  restore_epoch INTEGER NOT NULL CHECK(restore_epoch>0),
  authority_epoch INTEGER NOT NULL CHECK(authority_epoch>0),
  max_micro_twd INTEGER NOT NULL CHECK(max_micro_twd>0),
  created_at INTEGER NOT NULL CHECK(created_at>0)
);
CREATE INDEX ai3_a03_holds_app ON ai3_a03_holds(app_id);
CREATE TABLE ai3_a03_send_claims (
  job_key TEXT PRIMARY KEY REFERENCES ai3_a03_holds(job_key),
  claim_key TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL CHECK(created_at>0)
);
-- No UPDATE/DELETE of any committed holds or SEND claims. A lost ACK must
-- never make a persisted claim reusable. No compensation in this prototype.
CREATE TRIGGER ai3_a03_hold_no_update BEFORE UPDATE ON ai3_a03_holds
BEGIN SELECT RAISE(ABORT,'A03_HOLD_IMMUTABLE'); END;
CREATE TRIGGER ai3_a03_hold_no_delete BEFORE DELETE ON ai3_a03_holds
BEGIN SELECT RAISE(ABORT,'A03_HOLD_IMMUTABLE'); END;
CREATE TRIGGER ai3_a03_claim_no_update BEFORE UPDATE ON ai3_a03_send_claims
BEGIN SELECT RAISE(ABORT,'A03_CLAIM_IMMUTABLE'); END;
CREATE TRIGGER ai3_a03_claim_no_delete BEFORE DELETE ON ai3_a03_send_claims
BEGIN SELECT RAISE(ABORT,'A03_CLAIM_IMMUTABLE'); END;
