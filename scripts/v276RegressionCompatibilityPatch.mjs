import fs from 'node:fs';

function regexOnce(path,pattern,replacement,label){let text=fs.readFileSync(path,'utf8');const matches=[...text.matchAll(new RegExp(pattern.source,pattern.flags.includes('g')?pattern.flags:pattern.flags+'g'))];if(matches.length!==1)throw new Error(`${label}: expected 1 match, got ${matches.length}`);text=text.replace(pattern,replacement);fs.writeFileSync(path,text);}

regexOnce('worker/authRouter.ts',/    stage = 'central-profile';\n    await ensureCentralEchoMember\(env, \{ \.\.\.data\.user, googleSubject: identity\.subject \}\);\n    const canonicalUser = await overlayEchoMemberWithCentral\(env, \{ \.\.\.data\.user, googleSubject: identity\.subject \}\);/,
`    stage = 'central-profile';
    let canonicalUser = data.user;
    if ((env as any).STARRY_ID_DB) {
      await ensureCentralEchoMember(env, { ...data.user, googleSubject: identity.subject });
      canonicalUser = await overlayEchoMemberWithCentral(env, { ...data.user, googleSubject: identity.subject });
    }`,'login central compatibility');
regexOnce('worker/authRouter.ts',/user: canonicalUser,\n\s*profileSource:\s*'starry-id-central'/,
"user: canonicalUser,\n      profileSource: (env as any).STARRY_ID_DB ? 'starry-id-central' : 'echo-local-compat'",'login profile source marker');
regexOnce('worker/authRouter.ts',/if \(centralProfileWrite && method === 'PUT'\) \{/,
"if (centralProfileWrite && method === 'PUT' && (env as any).STARRY_ID_DB) {",'central write production gate');

regexOnce('worker/batteryRouter.ts',/if\(method==='PUT'&&actor&&path===`\/api\/users\/\$\{encodeURIComponent\(actor\.id\)\}`\)\{const saved:any=await appDb\.prepare\('SELECT \* FROM users WHERE id=\?'\)\.bind\(actor\.id\)\.first\(\),rules=await settingMap\(appDb\),missing=missingProfileFields\(saved\|\|\{\}\);if\(!missing\.length&&rules\.profile_reward_units>0\)await addBatteryTransaction\(appDb,central,\{userId:actor\.id,deltaUnits:rules\.profile_reward_units,type:'profile_reward',sourceId:actor\.id,relatedUserId:actor\.id,description:'完整填寫個人資料',actorUserId:actor\.id,uniqueKey:`profile-complete:\$\{actor\.id\}`\}\);const data:any=await response\.clone\(\)\.json\(\);return jsonFromBase\(\{\.\.\.data,profileCompletion:\{complete:!missing\.length,missing,settings:settingsForClient\(rules\)\}\},response\);\}/,
"if(method==='PUT'&&actor&&path===`/api/users/${encodeURIComponent(actor.id)}`){const data:any=await response.clone().json().catch(()=>({})),localSaved:any=await appDb.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first(),saved:any=data?.user||localSaved,rules=await settingMap(appDb),missing=missingProfileFields(saved||{});if(!missing.length&&rules.profile_reward_units>0)await addBatteryTransaction(appDb,central,{userId:actor.id,deltaUnits:rules.profile_reward_units,type:'profile_reward',sourceId:actor.id,relatedUserId:actor.id,description:'完整填寫個人資料',actorUserId:actor.id,uniqueKey:`profile-complete:${actor.id}`});return jsonFromBase({...data,profileCompletion:{complete:!missing.length,missing,settings:settingsForClient(rules)}},response);}",'battery central profile completion');

regexOnce('tests/starryIdProfileSchema.test.ts',/test\('central validation is enforced but central sync cannot turn a successful Echo save into 503',[\s\S]*?\n\}\);/,
`test('central validation is enforced and production Echo saves write Starry ID directly',()=>{
  assert.match(auth,/validateCentralProfilePatch/);
  assert.match(auth,/schemaVersion: validation\\.version/);
  assert.match(auth,/writeEchoProfileToCentral\\(env, user, target, patch\\)/);
  assert.match(auth,/STARRY_ID_DB/);
  assert.match(privacy,/handleStarryProfileSchema/);
  assert.doesNotMatch(privacy,/member-profile-update/);
  assert.doesNotMatch(privacy,/member-profile-update-retry/);
  assert.match(privacy,/member-membership-update/);
});`,'profile schema legacy sync test');

regexOnce('tests/v271ProfileNativeMottoFinal.test.ts',/test\('profile save preserves the current Starry ID synchronization contract',[\s\S]*?\n\}\);/,
`test('profile save no longer uses asynchronous Starry ID profile synchronization', () => {
  assert.doesNotMatch(router, /member-profile-update/);
  assert.doesNotMatch(router, /member-profile-update-retry/);
  assert.match(router, /member-membership-update/);
  assert.match(router, /Shared member profile PUT is already a direct Starry ID write/);
});`,'motto legacy sync contract test');

console.log('v276 regression compatibility patch applied');
