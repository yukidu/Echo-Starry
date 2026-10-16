import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicKey } from 'node:crypto';

const workflow = readFileSync('.github/workflows/starry-id-private-report-export.yml','utf8');
const exporter = readFileSync('starry-id/exportDuplicateAmwayReport.mjs','utf8');
const body = readFileSync('starry-id/repair-report-public-key.txt','utf8').trim();

test('v272 public encryption key reconstructs as a valid PEM key', () => {
  const lines = body.match(/.{1,64}/g) || [];
  const pem = `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`;
  assert.doesNotThrow(() => createPublicKey(pem));
});

test('v272 export is read-only and reports duplicate distributor IDs without mutation', () => {
  assert.match(exporter, /SELECT amwayId,COUNT\(\*\)/);
  assert.match(exporter, /SELECT p\.userId,p\.name,u\.primaryEmail/);
  assert.doesNotMatch(exporter, /\b(?:INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE)\b/i);
});

test('v272 workflow validates key, inserts PEM newline, encrypts and removes plaintext', () => {
  assert.match(workflow, /fold -w64 starry-id\/repair-report-public-key\.txt\n\s+echo\n\s+echo '-----END PUBLIC KEY-----'/);
  assert.match(workflow, /openssl pkey -pubin -in \/tmp\/report-public\.pem -noout/);
  assert.match(workflow, /openssl enc -aes-256-cbc/);
  assert.match(workflow, /openssl pkeyutl -encrypt/);
  assert.match(workflow, /rm -f "\$private"/);
  assert.doesNotMatch(workflow, /starry-id\/audit-output\/duplicate-amway-private\.json\s*$/m);
});
