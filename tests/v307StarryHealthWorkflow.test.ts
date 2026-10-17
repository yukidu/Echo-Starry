import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/starry-id-health-repair.yml', 'utf8');
const publicKey = readFileSync('starry-id/repair-report-public-key.txt', 'utf8').trim();

test('v307 health workflow installs both structural and semantic D1 protections', () => {
  assert.match(workflow, /20261016_central_health_guards\.sql/);
  assert.match(workflow, /20261017_profile_semantic_guards\.sql/);
  assert.match(workflow, /Install central database protections/);
});

test('v307 private repair report uses DER-decoded public key and validates it before encryption', () => {
  assert.match(workflow, /base64 --decode starry-id\/repair-report-public-key\.txt > \/tmp\/report-public\.der/);
  assert.match(workflow, /openssl pkey -pubin -inform DER -in \/tmp\/report-public\.der -noout/);
  assert.match(workflow, /openssl pkeyutl -encrypt -pubin -keyform DER -inkey \/tmp\/report-public\.der/);
  assert.doesNotMatch(workflow, /BEGIN PUBLIC KEY/);
});

test('repair report public key remains valid base64 DER data', () => {
  assert.match(publicKey, /^[A-Za-z0-9+/]+=*$/);
  const der = Buffer.from(publicKey, 'base64');
  assert.ok(der.length > 400);
  assert.equal(der[0], 0x30);
});
