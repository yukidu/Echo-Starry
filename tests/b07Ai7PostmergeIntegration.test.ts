import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/**
 * Staged cross-agent merge guard. After AI7 #457 merges, BOTH admin surfaces
 * must remain available and independent. Never changes main, D1 or R2.
 *
 * Set B07_REQUIRE_AI7_MERGED=1 after the authorized merge in the review worktree;
 * missing AI7 files then FAIL rather than silently skipping integration.
 */
const ai7SourcePresent=existsSync('worker/starryBackupPolicy.ts')
 && existsSync('starry-id/migrations/20261020_backup_policy_i31_i32.sql');
const required=process.env.B07_REQUIRE_AI7_MERGED==='1';
test('B07+AI7 merge presence gate: fail if a required agent result is missing',()=>{
 if(required) assert.ok(ai7SourcePresent,
  'AI7 #457 must be present in the combined worktree; never overwrite its branch results');
});
test('B07+AI7 post-merge router retains both private admin APIs and both UI paths',
 {skip:!ai7SourcePresent&&!required?'AI7 #457 not yet merged; run with B07_REQUIRE_AI7_MERGED=1 in combined worktree':false},()=>{
 const src=readFileSync('worker/starryIdCentralRouter.ts','utf8');
 for(const endpoint of [
   "path === '/api/ai-budget'", "path === '/api/admin/backups'",
   "url.pathname === '/ai-budget'", "url.pathname === '/backup-management'",
   "path === '/api/ai-routing'"]){
   assert.ok(src.includes(endpoint),'Missing merged route '+endpoint);
 }
 assert.ok(src.includes('!session.isSuperAdmin'),'central admin auth must remain present');
 assert.ok(src.includes("origin !== 'https://id.starry.phd'"),'same-origin guard required');
 // Budget calls must stay disconnected from any live Echo QA/Whisper path.
 const budget=readFileSync('worker/starryAiB07Budget.ts','utf8');
 const backup=readFileSync('worker/starryBackupPolicy.ts','utf8');
 assert.doesNotMatch(budget,/env\.AI\.run|battery_transactions|qa_claims/);
 assert.doesNotMatch(backup,/cloudflare\.request|time_travel\/restore|\.put\(|\.delete\(/);
});
test('B07+AI7 post-merge additive D1 schema coexists without running production migration',
 {skip:!ai7SourcePresent&&!required?'AI7 #457 not yet merged; run with B07_REQUIRE_AI7_MERGED=1 in combined worktree':false},()=>{
 const result=spawnSync('python3',['-c',String.raw`
import sqlite3, pathlib
connection=sqlite3.connect(':memory:')
connection.execute("CREATE TABLE starry_ai_models(model_id TEXT PRIMARY KEY,registry_status TEXT,free_eligibility TEXT,tasks_json TEXT)")
a=pathlib.Path('starry-id/migrations/20261020_ai_b07_budget_guard.sql').read_text()
b=pathlib.Path('starry-id/migrations/20261020_backup_policy_i31_i32.sql').read_text()
for sql in [a,b]: connection.executescript(sql)
names={x[0] for x in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
for name in ['starry_ai_b07_calls','starry_ai_b07_usage','starry_ai_b07_events',
             'starry_backup_policies','starry_backup_runs','starry_backup_policy_revisions']:
    assert name in names,name
connection.execute("INSERT INTO starry_backup_policies VALUES(?,?,?,?,?,?,?,?)",
    ('d1:starry_id_db','d1',1,7,1,'fake-admin',0,0))
assert connection.execute("SELECT enabled FROM starry_backup_policies").fetchone()[0]==0
assert connection.execute("SELECT max_calls FROM starry_ai_b07_policies WHERE scope_key='global'").fetchone()[0]==0
print('B07_AI7_COMBINED_DDL_OK')
`],{encoding:'utf8',timeout:10000,maxBuffer:1024*1024});
 assert.equal(result.status,0,result.stderr);
 assert.match(result.stdout,/B07_AI7_COMBINED_DDL_OK/);
});
