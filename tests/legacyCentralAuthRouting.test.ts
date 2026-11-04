import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const code = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8');

test('legacy EchoStars browser Google login never contacts v2 Starry ID', () => {
  const login = code('../src/googleCredentialExchange.ts');
  assert.match(login, /fetcher\('\/api\/users\/google-sync'/);
  assert.match(login, /credentials: 'same-origin'/);
  assert.doesNotMatch(login, /https:\/\/id\.starry\.phd/);
  const sso = code('../src/ecosystemSsoClient.ts');
  assert.match(sso, /legacyStandaloneHost/);
  assert.match(sso, /&& !legacyStandaloneHost/);
});

test('verified Google identities keep the existing Echo and legacy central memberships', () => {
  const auth = code('../worker/authRouter.ts');
  const central = code('../worker/echoCentralProfileGateway.ts');
  assert.match(auth, /verifyGoogleCredential\(String\(body\.credential \|\| ''\)\)/);
  assert.match(auth, /syncVerifiedMember\(env\.DB, identity\)/);
  assert.match(auth, /centralUserId = await ensureCentralEchoMember\(env,/);
  assert.match(auth, /starryUserId: centralUserId/);
  assert.match(central, /INSERT INTO legacy_links/);
  assert.match(central, /INSERT INTO app_memberships/);
});

test('iOS on the workers.dev legacy host creates only first-party secure session', () => {
  const redirect = code('../worker/iosGoogleRedirectRouter.ts');
  assert.match(redirect, /legacyStandaloneHost && !\(env as any\)\.STARRY_ID_DB/);
  assert.match(redirect, /const cookie = response\.headers\.get\('Set-Cookie'\)/);
  assert.match(redirect, /'Set-Cookie': cookie/);
  assert.match(redirect, /status: 303/);
  const firstParty = code('../worker/sessionCookieRouter.ts');
  assert.match(firstParty, /HttpOnly; Secure; SameSite=Lax/);
});
