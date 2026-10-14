import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file=(path:string)=>readFileSync(path,'utf8');
const gateway=file('worker/starryProfileSchemaGateway.ts');
const migration=file('starry-id/migrations/20261014_profile_schema.sql');
const provision=file('starry-id/provision-and-audit.sh');
const verify=file('starry-id/verify-schema.mjs');
const wrangler=file('wrangler.toml');

test('v225 keeps the existing privacy router behind a thin schema gateway',()=>{
  assert.match(wrangler,/main = "worker\/starryProfileSchemaGateway\.ts"/);
  assert.match(gateway,/import appWorker from '\.\/privacyCrawlerRouter'/);
  assert.match(gateway,/appWorker\.fetch\(request,env as any,ctx\)/);
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
  assert.match(gateway,/\/api\/profile-schema/);
  assert.match(gateway,/starry-profile-schema-v\$\{data\.version\}/);
  assert.match(gateway,/If-None-Match/);
  assert.match(gateway,/status:304/);
  assert.match(gateway,/caches\?\.default/);
  assert.match(gateway,/stale-while-revalidate=86400/);
});

test('central rules validate core writes and dynamic fields server-side',()=>{
  assert.match(gateway,/validateCoreWrite/);
  assert.match(gateway,/storageMode!==\'core\'/);
  assert.match(gateway,/field\.fieldType===\'select\'/);
  assert.match(gateway,/中央清單中的選項/);
  assert.match(gateway,/profile_dynamic_values/);
  assert.match(gateway,/Starry ID Super Admin/);
});

test('EchoStars auto-sync client caches schema and adds ordinary dynamic fields without manual trigger',()=>{
  assert.match(gateway,/starry-profile-schema-cache-v1/);
  assert.match(gateway,/localStorage\.setItem\(CACHE_KEY/);
  assert.match(gateway,/data-starry-central-select/);
  assert.match(gateway,/storageMode===\'dynamic\'/);
  assert.match(gateway,/id='starry-schema-dynamic'|section\.id='starry-schema-dynamic'/);
  assert.match(gateway,/\/api\/profile-extra/);
  assert.match(gateway,/txt\(btn\)!==\'儲存\'/);
  assert.match(gateway,/bypass=true;btn\.click\(\)/);
});
