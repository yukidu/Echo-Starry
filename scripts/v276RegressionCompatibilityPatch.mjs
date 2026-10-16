import fs from 'node:fs';

function replaceOnce(path,before,after,label){let text=fs.readFileSync(path,'utf8');const i=text.indexOf(before);if(i<0)throw new Error(`Missing ${label}`);if(text.indexOf(before,i+1)>=0)throw new Error(`Ambiguous ${label}`);text=text.slice(0,i)+after+text.slice(i+before.length);fs.writeFileSync(path,text);}

replaceOnce('worker/authRouter.ts',
`    stage = 'central-profile';
    await ensureCentralEchoMember(env, { ...data.user, googleSubject: identity.subject });
    const canonicalUser = await overlayEchoMemberWithCentral(env, { ...data.user, googleSubject: identity.subject });`,
`    stage = 'central-profile';
    let canonicalUser = data.user;
    if ((env as any).STARRY_ID_DB) {
      await ensureCentralEchoMember(env, { ...data.user, googleSubject: identity.subject });
      canonicalUser = await overlayEchoMemberWithCentral(env, { ...data.user, googleSubject: identity.subject });
    }`,
'login central compatibility');
replaceOnce('worker/authRouter.ts',
`        profileSource: 'starry-id-central',`,
`        profileSource: (env as any).STARRY_ID_DB ? 'starry-id-central' : 'echo-local-compat',`,
'profile source marker');
replaceOnce('worker/authRouter.ts',
`      if (centralProfileWrite && method === 'PUT') {`,
`      if (centralProfileWrite && method === 'PUT' && (env as any).STARRY_ID_DB) {`,
'central write production gate');

replaceOnce('worker/batteryRouter.ts',
`if(method==='PUT'&&actor&&path===\`/api/users/\${encodeURIComponent(actor.id)}\`){const saved:any=await appDb.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first(),rules=await settingMap(appDb),missing=missingProfileFields(saved||{});if(!missing.length&&rules.profile_reward_units>0)await addBatteryTransaction(appDb,central,{userId:actor.id,deltaUnits:rules.profile_reward_units,type:'profile_reward',sourceId:actor.id,relatedUserId:actor.id,description:'完整填寫個人資料',actorUserId:actor.id,uniqueKey:\`profile-complete:\${actor.id}\`});const data:any=await response.clone().json();return jsonFromBase({...data,profileCompletion:{complete:!missing.length,missing,settings:settingsForClient(rules)}},response);}`,
`if(method==='PUT'&&actor&&path===\`/api/users/\${encodeURIComponent(actor.id)}\`){const data:any=await response.clone().json().catch(()=>({})),localSaved:any=await appDb.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first(),saved:any=data?.user||localSaved,rules=await settingMap(appDb),missing=missingProfileFields(saved||{});if(!missing.length&&rules.profile_reward_units>0)await addBatteryTransaction(appDb,central,{userId:actor.id,deltaUnits:rules.profile_reward_units,type:'profile_reward',sourceId:actor.id,relatedUserId:actor.id,description:'完整填寫個人資料',actorUserId:actor.id,uniqueKey:\`profile-complete:\${actor.id}\`});return jsonFromBase({...data,profileCompletion:{complete:!missing.length,missing,settings:settingsForClient(rules)}},response);}`,
'battery central profile completion');

replaceOnce('tests/starryIdProfileSchema.test.ts',
`test('central validation is enforced but central sync cannot turn a successful Echo save into 503',()=>{
  assert.match(auth,/validateCentralProfilePatch/);
  assert.match(auth,/schemaVersion: validation\\.version/);
  assert.match(privacy,/handleStarryProfileSchema/);
  assert.match(privacy,/member-profile-update/);
  assert.match(privacy,/member-profile-update-retry/);
  assert.doesNotMatch(privacy,/Starry ID 中央同步暫時失敗/);
  assert.match(privacy,/return withPrivacyHeaders\\(response\\)/);
});`,
`test('central validation is enforced and production Echo saves write Starry ID directly',()=>{
  assert.match(auth,/validateCentralProfilePatch/);
  assert.match(auth,/schemaVersion: validation\\.version/);
  assert.match(auth,/writeEchoProfileToCentral\\(env, user, target, patch\\)/);
  assert.match(auth,/STARRY_ID_DB/);
  assert.match(privacy,/handleStarryProfileSchema/);
  assert.doesNotMatch(privacy,/member-profile-update/);
  assert.doesNotMatch(privacy,/member-profile-update-retry/);
  assert.match(privacy,/member-membership-update/);
});`,
'profile schema legacy sync test');

replaceOnce('tests/v271ProfileNativeMottoFinal.test.ts',
`test('profile save preserves the current Starry ID synchronization contract', () => {
  assert.match(router, /const synced = await syncEchoMemberToStarryBestEffort\\(env as any, userId, 'echostars', 'member-profile-update'\\)/);
  assert.match(router, /if \\(\\(env as any\\)\\.STARRY_ID_DB && !synced\\)/);
  assert.match(router, /scheduleStarrySync\\(ctx, env, userId, 'echostars', 'member-profile-update-retry'\\)/);
  assert.match(router, /Never turn that success into an error/);
});`,
`test('profile save no longer uses asynchronous Starry ID profile synchronization', () => {
  assert.doesNotMatch(router, /member-profile-update/);
  assert.doesNotMatch(router, /member-profile-update-retry/);
  assert.match(router, /member-membership-update/);
  assert.match(router, /Shared member profile PUT is already a direct Starry ID write/);
});`,
'motto legacy sync contract test');

console.log('v276 regression compatibility patch applied');
