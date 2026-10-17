import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Keep both browser login entry points and central SSO in step; otherwise a
// background login can overwrite the account picked in the Google dialog.
const code = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('foreground Google login excludes an in-flight background ecosystem exchange', () => {
  const sso = code('../src/ecosystemSsoClient.ts');
  const exchange = code('../src/googleCredentialExchange.ts');
  assert.match(exchange, /setInteractiveGoogleLoginActive\(true\)/);
  assert.match(exchange, /finally\(\(\) => \{[^}]*setInteractiveGoogleLoginActive\(false\)/);
  assert.match(sso, /const generation = interactiveLoginGeneration/);
  assert.match(sso, /interruptedByLogin\(\)/);
  assert.match(sso, /if \(interactiveGoogleLoginActive\) return syncInFlight/);
});

test('successful interactive sign-in records the central member identity', () => {
  const bridge = code('../src/googleIdentityBridge.ts');
  const share = code('../src/shareAuthRecovery.ts');
  assert.match(bridge, /_starryUserId: String\(data\.starryUserId \|\| ''\)/);
  assert.match(share, /_starryUserId: String\(data\.starryUserId\)/);
});

test('temporary central membership or session failure is retryable, not Google rejection', () => {
  const central = code('../worker/starryIdCentralRouter.ts');
  assert.match(central, /stage = 'member'/);
  assert.match(central, /stage = 'session'/);
  assert.match(central, /temporary \? 503 : 401/);
  assert.match(central, /LOGIN_SERVICE_UNAVAILABLE/);
  assert.match(central, /conflict \? 409 : unsupported \|\| restricted \? 403/);
});
