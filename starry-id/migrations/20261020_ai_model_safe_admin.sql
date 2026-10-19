-- A02/A05: append-only model audit and safe credential *reference* metadata.
-- No secrets are stored in D1, no new Cloudflare services, no inference calls.
CREATE TABLE IF NOT EXISTS starry_ai_model_revisions (
  revision_id TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('baseline','create','update','disable','restore')),
  before_json TEXT,
  after_json TEXT NOT NULL CHECK(json_valid(after_json)),
  restored_from TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS starry_ai_model_revisions_lookup ON starry_ai_model_revisions(model_id,created_at DESC);
-- References to existing Cloudflare Worker secret *names* only; never their values.
CREATE TABLE IF NOT EXISTS starry_ai_model_secret_refs (
  model_id TEXT PRIMARY KEY,
  secret_binding TEXT NOT NULL DEFAULT 'none' CHECK(secret_binding IN ('none','OPENAI_API_KEY')),
  reviewed_at INTEGER NOT NULL
);
-- Preserve existing nine models as initial, immutable audit checkpoints.
INSERT OR IGNORE INTO starry_ai_model_revisions
(revision_id,model_id,actor_id,action,before_json,after_json,restored_from,created_at)
SELECT 'baseline:'||model_id,model_id,'system-migration','baseline',NULL,
  json_object(
    'modelId',model_id,'name',display_name,'provider',provider,'version',coalesce(model_version,''),
    'capabilities',json(capabilities_json),'tasks',json(tasks_json),
    'routeKind',route_kind,'registryStatus',registry_status,'updatedAt',updated_at
  ),NULL,updated_at
FROM starry_ai_models;
