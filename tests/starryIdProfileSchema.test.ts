import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateCentralProfilePatch } from '../worker/starryProfileSchemaService';

const root=process.cwd();
const migration=readFileSync(join(root,'starry-id/migrations/20261014_profile_schema.sql'),'utf8');
const service=readFileSync(join(root,'worker/starryProfileSchemaService.ts'),'utf8');
const router=readFileSync(join(root,'worker/starryProfileSchemaRouter.ts'),'utf8');
const privacy=readFileSync(join(root,'worker/privacyCrawlerRouter.ts'),'utf8');
const auth=readFileSync(join(root,'worker/authRouter.ts'),'utf8');
const bridge=readFileSync(join(root,'src/memberProfileSchemaBridge.ts'),'utf8');
const main=readFileSync(join(root,'src/main.tsx'),'utf8');
const provision=readFileSync(join(root,'starry-id/provision-and-audit.sh'),'utf8');
const verify=readFileSync(join(root,'starry-id/verify-schema.mjs'),'utf8');

test('central schema has versioned field metadata and extension storage',()=>{
  assert.match(migration,/CREATE TABLE IF NOT EXISTS profile_field_schema/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS profile_extension_values/);
  assert.match(migration,/CREATE TABLE IF NOT EXISTS profile_schema_meta/);
  assert.match(migration,/profile_schema_field_update/);
  assert.match(migration,/profile_schema_option_update/);
  assert.match(migration,/version=version\+1/);
  assert.match(service,/storageMode: 'native' \| 'extension'/);
  assert.match(service,/validationJson/);
});

test('production provision installs and audits the new central schema tables',()=>{
  assert.match(provision,/20261014_profile_schema\.sql/);
  assert.match(verify,/profile_field_schema/);
  assert.match(verify,/profile_extension_values/);
  assert.match(verify,/profile_schema_meta/);
});

test('schema endpoint uses edge/browser cache instead of polling D1',()=>{
  assert.match(router,/SCHEMA_TTL_SECONDS = 300/);
  assert.match(router,/caches as any/);
  assert.match(router,/stale-while-revalidate=86400/);
  assert.match(router,/X-Starry-Schema-Version/);
  assert.match(bridge,/starry_profile_schema_cache_v1/);
  assert.match(bridge,/cache:'default'/);
  assert.doesNotMatch(bridge,/setInterval|MutationObserver/);
});

test('Echo profile UI consumes central options without changing existing ProfileModal structure',()=>{
  assert.match(main,/memberProfileSchemaBridge/);
  assert.match(bridge,/replaceArray\(mutable\(RESIDENCE_OPTIONS\),schema\.options\?\.residence\)/);
  assert.match(bridge,/replaceArray\(mutable\(CENTER_OPTIONS\),schema\.options\?\.center\)/);
  assert.match(bridge,/replaceArray\(mutable\(RANK_ORDER\),schema\.options\?\.rank\)/);
  assert.match(bridge,/replaceArray\(mutable\(JOIN_REASONS\),schema\.options\?\.joinReason\)/);
  assert.match(bridge,/replaceArray\(mutable\(STAY_REASONS\),schema\.options\?\.stayReason\)/);
  assert.match(bridge,/data-starry-extension-fields|starryExtensionFields/);
  assert.match(bridge,/\/api\/starry\/profile-values/);
});

test('central validation is enforced but central sync cannot turn a successful Echo save into 503',()=>{
  assert.match(auth,/validateCentralProfilePatch/);
  assert.match(auth,/schemaVersion: validation\.version/);
  assert.match(privacy,/handleStarryProfileSchema/);
  assert.match(privacy,/member-profile-update/);
  assert.match(privacy,/member-profile-update-retry/);
  assert.doesNotMatch(privacy,/Starry ID 中央同步暫時失敗/);
  assert.match(privacy,/return withPrivacyHeaders\(response\)/);
});

test('fallback rules validate old clients even when central D1 is not bound in tests/previews',async()=>{
  const tooLong=await validateCentralProfilePatch({} as any,{name:'x'.repeat(51)});
  assert.equal(tooLong.ok,false);
  if(!tooLong.ok) assert.equal(tooLong.field,'name');
  const invalidDate=await validateCentralProfilePatch({} as any,{birthday:'2026-02-31'});
  assert.equal(invalidDate.ok,false);
  const invalidCenter=await validateCentralProfilePatch({} as any,{center:'不存在的中央選項'});
  assert.equal(invalidCenter.ok,false);
  const valid=await validateCentralProfilePatch({} as any,{name:'繁星夥伴',center:'台中',birthday:'2000-02-29'});
  assert.equal(valid.ok,true);
});
