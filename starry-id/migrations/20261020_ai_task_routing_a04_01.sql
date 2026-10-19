-- A04-01: central, staging-only per-app/per-function model routing selection.
-- Additive tables; NO runtime AI routing or provider requests. Existing QA/Whisper untouched.
CREATE TABLE IF NOT EXISTS starry_ai_task_routes (
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  selection_json TEXT NOT NULL CHECK(json_valid(selection_json)),
  revision INTEGER NOT NULL CHECK(revision>0),
  status TEXT NOT NULL DEFAULT 'staged' CHECK(status='staged'),
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(app_id,task_id)
);
CREATE TABLE IF NOT EXISTS starry_ai_task_route_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('save','restore')),
  actor_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  restored_from TEXT,
  revision INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_ai_task_route_revisions_lookup
ON starry_ai_task_route_revisions(app_id,task_id,revision DESC);
