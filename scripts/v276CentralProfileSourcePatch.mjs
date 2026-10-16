import fs from 'node:fs';

function replaceOnce(text, before, after, label) {
  const first = text.indexOf(before);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (text.indexOf(before, first + before.length) >= 0) throw new Error(`Ambiguous patch anchor: ${label}`);
  return text.slice(0, first) + after + text.slice(first + before.length);
}

let auth = fs.readFileSync('worker/authRouter.ts','utf8');
auth = replaceOnce(auth,
  "import { validateCentralProfilePatch } from './starryProfileSchemaService';\nimport type { Env } from './index';",
  "import { validateCentralProfilePatch } from './starryProfileSchemaService';\nimport { CentralProfileError, ensureCentralEchoMember, overlayEchoJsonResponse, overlayEchoMemberWithCentral, overlayEchoMembersWithCentral, writeEchoProfileToCentral } from './echoCentralProfileGateway';\nimport type { Env } from './index';",
  'auth imports');

auth = replaceOnce(auth,
  "  if (row.isBlocked) return null;\n  return row;",
  "  if (row.isBlocked) return null;\n  return overlayEchoMemberWithCentral(env, row);",
  'session central overlay');

auth = replaceOnce(auth,
  "    const data = await syncVerifiedMember(env.DB, identity);\n\n    stage = 'session';\n    const session = await createSession(env.DB, data.user.id);\n    return json({\n      ...data,\n      authToken: session.token,\n      sessionExpiresAt: session.expiresAt\n    });",
  "    const data = await syncVerifiedMember(env.DB, identity);\n    stage = 'central-profile';\n    await ensureCentralEchoMember(env, { ...data.user, googleSubject: identity.subject });\n    const canonicalUser = await overlayEchoMemberWithCentral(env, { ...data.user, googleSubject: identity.subject });\n\n    stage = 'session';\n    const session = await createSession(env.DB, data.user.id);\n    return json({\n      ...data,\n      user: canonicalUser,\n      profileSource: 'starry-id-central',\n      authToken: session.token,\n      sessionExpiresAt: session.expiresAt\n    });",
  'login central provisioning');

auth = replaceOnce(auth,
  "        return json((results || []).map((member: any) => member.id === user.id ? normalizeMember(user) : member));",
  "        const members = (results || []).map((member: any) => member.id === user.id ? normalizeMember(user) : member);\n        return json(await overlayEchoMembersWithCentral(env, members));",
  'member directory overlay');

auth = replaceOnce(auth,
  "      nextRequest = authorized;\n    } else {",
  "      nextRequest = authorized;\n\n      const centralProfileWrite = path.match(/^\\/api\\/users\\/([^/]+)$/);\n      if (centralProfileWrite && method === 'PUT') {\n        const targetId = decodeURIComponent(centralProfileWrite[1]);\n        const target: any = await env.DB?.prepare('SELECT * FROM users WHERE id=? LIMIT 1').bind(targetId).first();\n        if (!target) return json({ error: '找不到會員' }, 404);\n        const patch = await requestBody(nextRequest);\n        try {\n          const saved = await writeEchoProfileToCentral(env, user, target, patch);\n          return json({ success: true, user: normalizeMember(saved), profileSource: 'starry-id-central' });\n        } catch (error) {\n          if (error instanceof CentralProfileError) return json({ error: error.message, code: error.code, ...error.extra }, error.status);\n          console.error('Central profile write failed', { targetId, code: error instanceof Error ? error.message : 'unknown' });\n          return json({ error: 'Starry ID 中央會員資料儲存失敗，資料未寫入舊會員資料表', code: 'CENTRAL_PROFILE_WRITE_FAILED' }, 503);\n        }\n      }\n    } else {",
  'central profile write interception');

auth = replaceOnce(auth,
  "    return appWorker.fetch(nextRequest, env);\n  }\n};",
  "    const response = await appWorker.fetch(nextRequest, env);\n    if (method === 'GET' && (path === '/api/users' || path === '/api/users/profile' || /^\\/api\\/users\\/[^/]+$/.test(path))) {\n      return overlayEchoJsonResponse(env, response);\n    }\n    return response;\n  }\n};",
  'downstream profile read overlay');
fs.writeFileSync('worker/authRouter.ts',auth);

let privacy = fs.readFileSync('worker/privacyCrawlerRouter.ts','utf8');
privacy = replaceOnce(privacy,
  "    if (url.pathname === '/api/users/google-sync' || url.pathname.startsWith('/api/auth/')) {\n      const response = await sessionWorker.fetch(request, env);\n      if (response.ok && url.pathname === '/api/users/google-sync' && request.method.toUpperCase() === 'POST') {\n        const data: any = await response.clone().json().catch(() => null);\n        const userId = String(data?.user?.id || '');\n        scheduleStarrySync(ctx, env, userId, userId || 'echostars', 'verified-google-login');\n      }\n      return withPrivacyHeaders(response);\n    }",
  "    if (url.pathname === '/api/users/google-sync' || url.pathname.startsWith('/api/auth/')) {\n      // Google login now provisions/reads Starry ID directly inside authRouter.\n      // Do not schedule a second profile copy after login.\n      return withPrivacyHeaders(await sessionWorker.fetch(request, env));\n    }",
  'remove login profile sync');

privacy = replaceOnce(privacy,
  "    if (response.ok && request.method.toUpperCase() === 'PUT') {\n      const directProfileWrite = url.pathname.match(/^\\/api\\/users\\/([^/]+)$/);\n      if (directProfileWrite) {\n        const userId = decodeURIComponent(directProfileWrite[1]);\n        const synced = await syncEchoMemberToStarryBestEffort(env as any, userId, 'echostars', 'member-profile-update');\n        if ((env as any).STARRY_ID_DB && !synced) {\n          // Echo already committed successfully. Never turn that success into an error.\n          // Queue another best-effort central attempt and let the member leave edit mode.\n          scheduleStarrySync(ctx, env, userId, 'echostars', 'member-profile-update-retry');\n        }\n      } else {\n        const membershipWrite = url.pathname.match(/^\\/api\\/users\\/([^/]+)\\/(?:contributor|admin-role|block|audit-rank)$/);\n        if (membershipWrite) {\n          const userId = decodeURIComponent(membershipWrite[1]);\n          scheduleStarrySync(ctx, env, userId, 'echostars', 'member-membership-update');\n        }\n      }\n    }",
  "    if (response.ok && request.method.toUpperCase() === 'PUT') {\n      // Shared member profile PUT is already a direct Starry ID write in authRouter.\n      // Only app-specific membership/permission changes still use the legacy migration bridge.\n      const membershipWrite = url.pathname.match(/^\\/api\\/users\\/([^/]+)\\/(?:contributor|admin-role|block|audit-rank)$/);\n      if (membershipWrite) {\n        const userId = decodeURIComponent(membershipWrite[1]);\n        scheduleStarrySync(ctx, env, userId, 'echostars', 'member-membership-update');\n      }\n    }",
  'remove profile save sync/retry');
fs.writeFileSync('worker/privacyCrawlerRouter.ts',privacy);

console.log('v276 central profile source patch applied');
