-- AI7 I31/I32: separate STAGED backup metadata only.
-- No schedule, no live source reads, no backup/restore execution.
CREATE TABLE IF NOT EXISTS starry_backup_policies (
 resource_id TEXT PRIMARY KEY NOT NULL,
 resource_kind TEXT NOT NULL CHECK(resource_kind IN ('d1','r2')),
 interval_days INTEGER NOT NULL CHECK(interval_days IN (1,3,7)),
 retention_days INTEGER NOT NULL CHECK(retention_days IN (7,30,90)),
 revision INTEGER NOT NULL CHECK(revision > 0),
 updated_by TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled=0)
);
CREATE TABLE IF NOT EXISTS starry_backup_policy_revisions (
 id TEXT PRIMARY KEY NOT NULL,
 resource_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action='stage'),
 revision INTEGER NOT NULL,
 actor_id TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 before_json TEXT,
 after_json TEXT NOT NULL CHECK(json_valid(after_json))
);
CREATE INDEX IF NOT EXISTS starry_backup_policy_revisions_lookup
 ON starry_backup_policy_revisions(resource_id, revision DESC);
CREATE TABLE IF NOT EXISTS starry_backup_runs (
 id TEXT PRIMARY KEY NOT NULL,
 resource_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('success','failed','partial')),
 started_at INTEGER NOT NULL,
 completed_at INTEGER,
 object_count INTEGER CHECK(object_count >= 0),
 byte_count INTEGER CHECK(byte_count >= 0),
 integrity_status TEXT NOT NULL CHECK(integrity_status IN ('passed','failed','not_checked')),
 restore_test_status TEXT NOT NULL CHECK(restore_test_status IN ('passed','failed','not_tested')),
 backup_version TEXT,
 storage_label TEXT
);
CREATE INDEX IF NOT EXISTS starry_backup_runs_recent
 ON starry_backup_runs(resource_id, started_at DESC);
