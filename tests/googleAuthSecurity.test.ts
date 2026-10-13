import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const authRouter = readFileSync(new URL('../worker/authRouter.ts', import.meta.url), 'utf8');
const learningRouter = readFileSync(new URL('../worker/learningCardRouter.ts', import.meta.url), 'utf8');
const playbackRouter = readFileSync(new URL('../worker/playbackOwnerRouter.ts', import.meta.url), 'utf8');
const uiPreferencesRouter = readFileSync(new URL('../worker/uiPreferencesRouter.ts', import.meta.url), 'utf8');
const sessionCookieRouter = readFileSync(new URL('../worker/sessionCookieRouter.ts', import.meta.url), 'utf8');
const categoryRouter = readFileSync(new URL('../worker/categoryIntegrityRouter.ts', import.meta.url), 'utf8');
const organizationRouter = readFileSync(new URL('../worker/organizationRouter.ts', import.meta.url), 'utf8');
const adminUserDeleteRouter = readFileSync(new URL('../worker/adminUserDeleteRouter.ts', import.meta.url), 'utf8');
const favoriteRouter = readFileSync(new URL('../worker/favoriteRouter.ts', import.meta.url), 'utf8');
const privacyRouter = readFileSync(new URL('../worker/privacyCrawlerRouter.ts', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/googleIdentityBridge.ts', import.meta.url), 'utf8');
const recovery = readFileSync(new URL('../src/shareAuthRecovery.ts', import.meta.url), 'utf8');
const profile = readFileSync(new URL('../src/components/ProfileModal.tsx', import.meta.url), 'utf8');
const bootstrap = readFileSync(new URL('../src/categoryIntegrityBootstrap.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('Google identity is verified server-side instead of trusting a submitted email', () => {
  assert.match(authRouter, /jwtVerify\(credential, GOOGLE_JWKS/);
  assert.match(authRouter, /audience:\s*\[\.\.\.GOOGLE_CLIENT_IDS\]/);
  assert.match(authRouter, /issuer:\s*\['https:\/\/accounts\.google\.com', 'accounts\.google\.com'\]/);
  assert.match(authRouter, /payload\.email_verified !== true/);
  assert.match(authRouter, /path === '\/api\/users\/google-sync'/);
  assert.match(authRouter, /String\(body\.credential \|\| ''\)/);
  assert.doesNotMatch(authRouter, /const email = body\.email/);
});

test('super admin is anchored to the single verified Google email', () => {
  assert.match(authRouter, /SUPER_ADMIN_EMAIL = 'yukidu@gmail\.com'/);
  assert.match(authRouter, /normalizeEmail\(user\?\.email\) === SUPER_ADMIN_EMAIL/);
});

test('browser uses Google Identity Services credential flow and authenticated API sessions', () => {
  assert.match(bridge, /google\.accounts\.id\.initialize/);
  assert.match(bridge, /google\.accounts\.id\.renderButton/);
  assert.match(readFileSync(new URL('../src/googleCredentialExchange.ts', import.meta.url), 'utf8'), /JSON\.stringify\(\{ credential \}\)/);
  assert.match(bridge, /headers\.set\('Authorization', `Bearer \$\{token\}`\)/);
  assert.doesNotMatch(bridge, /initTokenClient/);
  assert.match(profile, /initTokenClient/); // old Profile UI remains behind the verified bridge
});

test('first-party session cookie is secure and never placed in a share URL', () => {
  assert.match(sessionCookieRouter, /HttpOnly/);
  assert.match(sessionCookieRouter, /Secure/);
  assert.match(sessionCookieRouter, /SameSite=Lax/);
  assert.match(sessionCookieRouter, /SESSION_COOKIE = 'echostars_session'/);
  assert.match(sessionCookieRouter, /path === '\/api\/auth\/logout'/);
  assert.match(sessionCookieRouter, /requestWithCookieSession/);
  assert.doesNotMatch(recovery, /searchParams\.set\([^)]*(?:auth|token|session)/i);
  assert.doesNotMatch(recovery, /location\.href\s*=.*(?:authToken|session)/i);
});

test('site-defined auth lifetime is persistent instead of expiring after 30 days', () => {
  assert.match(sessionCookieRouter, /PERSISTENT_COOKIE_MAX_AGE_SECONDS = 2147483647/);
  assert.match(sessionCookieRouter, /PERSISTENT_COOKIE_EXPIRES = 'Fri, 31 Dec 9999 23:59:59 GMT'/);
  assert.match(sessionCookieRouter, /PERSISTENT_SESSION_EXPIRES_AT = 253402300799999/);
  assert.match(sessionCookieRouter, /PERSISTENCE_MIGRATION = 'persistent-auth-sessions-v1'/);
  assert.match(sessionCookieRouter, /UPDATE auth_sessions SET expiresAt = \? WHERE expiresAt > \?/);
  assert.match(sessionCookieRouter, /sessionExpiresAt:\s*PERSISTENT_SESSION_EXPIRES_AT/);
  assert.doesNotMatch(sessionCookieRouter, /30\s*\*\s*24\s*\*\s*60\s*\*\s*60/);
});

test('expired sessions are not resurrected when existing sessions are upgraded', () => {
  assert.match(sessionCookieRouter, /DELETE FROM auth_sessions WHERE expiresAt <= \?/);
  assert.match(sessionCookieRouter, /currentExpiry <= Date\.now\(\)/);
  assert.match(sessionCookieRouter, /DELETE FROM auth_sessions WHERE tokenHash = \?/);
});

test('share entry can restore a verified member session and only then falls back to Google', () => {
  assert.match(recovery, /originalFetch\('\/api\/auth\/session'/);
  assert.match(recovery, /credentials:\s*'include'/);
  assert.match(recovery, /storeRecoveredSession/);
  assert.match(recovery, /window\.location\.reload\(\)/);
  assert.match(recovery, /SHARE_PATH/);
  assert.match(recovery, /auto_select:\s*true/);
  assert.match(recovery, /identity\.prompt\(\)/);
  assert.match(recovery, /renderGoogleFallback/);
});

test('sensitive write routes bind identity to the verified session', () => {
  assert.match(authRouter, /uploaderEmail:\s*user\.email/);
  assert.match(authRouter, /uploaderId:\s*user\.id/);
  assert.match(authRouter, /actorEmail:\s*user\.email/);
  assert.match(authRouter, /userEmail:\s*user\.email/);
  assert.match(authRouter, /只有超級管理員可執行此操作/);
});

test('wrapper order preserves privacy, member deletion, categories, organizations, cookie continuity, UI preferences, playback and auth security', () => {
  assert.match(wrangler, /main = "worker\/privacyCrawlerRouter\.ts"/);
  assert.match(privacyRouter, /import appWorker from '\.\/favoriteRouter'/);
  assert.match(favoriteRouter, /import appWorker from '\.\/adminUserDeleteRouter'/);
  assert.match(adminUserDeleteRouter, /import appWorker from '\.\/categoryIntegrityRouter'/);
  assert.match(categoryRouter, /import appWorker from '\.\/organizationRouter'/);
  assert.match(organizationRouter, /import appWorker from '\.\/stickerRouter'/);
  const stickerRouter = readFileSync(new URL('../worker/stickerRouter.ts', import.meta.url), 'utf8');
  assert.match(stickerRouter, /import appWorker from '\.\/sessionCookieRouter'/);
  assert.match(sessionCookieRouter, /import appWorker from '\.\/uiPreferencesRouter'/);
  assert.match(uiPreferencesRouter, /import appWorker from '\.\/playbackOwnerRouter'/);
  assert.match(playbackRouter, /import learningWorker from '\.\/learningCardRouter'/);
  assert.match(learningRouter, /import authWorker from '\.\/authRouter'/);

  const recoveryIndex = index.indexOf('/src/shareAuthRecovery.ts');
  const bridgeIndex = index.indexOf('/src/googleIdentityBridge.ts');
  const bootstrapIndex = index.indexOf('/src/categoryIntegrityBootstrap.ts');
  assert.ok(recoveryIndex >= 0 && bridgeIndex > recoveryIndex && bootstrapIndex > bridgeIndex);
  assert.match(bootstrap, /await import\('\.\/main'\)/);
});

test('no Google OAuth client secret is embedded in the auth implementation', () => {
  assert.doesNotMatch(authRouter, /client[_-]?secret/i);
  assert.doesNotMatch(learningRouter, /client[_-]?secret/i);
  assert.doesNotMatch(sessionCookieRouter, /client[_-]?secret/i);
  assert.doesNotMatch(bridge, /client[_-]?secret/i);
  assert.doesNotMatch(recovery, /client[_-]?secret/i);
});