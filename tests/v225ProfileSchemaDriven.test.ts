import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file=(path:string)=>readFileSync(path,'utf8');
const hooks=file('worker/starryProfileSchemaHooks.ts');
const privacy=file('worker/privacyCrawlerRouter.ts');
const migration=file('starry-id/migrations/20261014_profile_schema.sql');
const provision=file('starry-id/provision-and-audit.sh');
const verify=file('starry-id/verify-schema.mjs');
const wrangler=file('wrangler.toml');

test('v225 preserves the canonical privacy Worker entrypoint and adds hooks inside it',()=>{
  assert.match(wrangler,/main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(privacy,/handleStarryProfileSchemaRequest/);
  assert.match(privacy,/validateStarryProfileCoreWrite/);
  assert.match(privacy,/injectStarryProfileSchemaClient/);
  assert.match(wrangler,/pattern = "echo\.starry\.phd"/);
  assert.match(wrangler,/pattern = "id\.starry\.phd"/);
});

test('central schema has versioning, field metadata and dynamic values',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS profile_schema_meta/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS profile_field_schema/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS profile_dynamic_values/);
  assert.match(migration,/profile_field_schema_version_update/);
  assert.match(migration,/profile_option_values_schema_version_update/);
  assert.match(migration,/version = version \+ 1/);
  assert.match(verify,/profile_schema_meta/);
  assert.match(verify,/profile_field_schema/);
  assert.match(verify,/profile_dynamic_values/);
  assert.match(provision,/20261014_profile_schema\.sql/);
});

test('schema endpoint is lightweight, versioned and cacheable',()=>{
  assert.match(hooks,/\/api\/profile-schema/);
  assert.match(hooks,/starry-profile-schema-v\$\{data\.version\}/);
  assert.match(hooks,/If-None-Match/);
  assert.match(hooks,/status:304/);
  assert.match(hooks,/caches\?\.default/);
  assert.match(hooks,/stale-while-revalidate=86400/);
});

test('central rules validate core writes and dynamic fields server-side',()=>{
  assert.match(hooks,/validateStarryProfileCoreWrite/);
  assert.match(hooks,/field\.storageMode !== 'core'/);
  assert.match(hooks,/field\.fieldType === 'select'/);
  assert.match(hooks,/中央清單中的選項/);
  assert.match(hooks,/profile_dynamic_values/);
  assert.match(hooks,/Starry ID Super Admin/);
});

test('EchoStars auto-sync client caches schema and adds ordinary dynamic fields without manual trigger',()=>{
  assert.match(hooks,/starry-profile-schema-cache-v1/);
  assert.match(hooks,/localStorage\.setItem\(CACHE/);
  assert.match(hooks,/data-starry-central-select/);
  assert.match(hooks,/storageMode==='dynamic'/);
  assert.match(hooks,/sec\.id='starry-schema-dynamic'/);
  assert.match(hooks,/\/api\/profile-extra/);
  assert.match(hooks,/t\(b\)!=='儲存'/);
  assert.match(hooks,/bypass=true;b\.click\(\)/);
});