import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const provision = readFileSync(join(root, 'starry-id/provision-and-audit.sh'), 'utf8');
const verify = readFileSync(join(root, 'starry-id/verify-schema.mjs'), 'utf8');

test('Starry ID provisioning applies central profile option migration before schema verification', () => {
  const migration = 'starry-id/migrations/20261014_profile_options.sql';
  assert.ok(provision.includes(`--file=${migration}`));
  assert.ok(provision.indexOf(`--file=${migration}`) < provision.indexOf('starry-id/verify-schema.mjs'));
});

test('central schema verification requires profile_option_values', () => {
  assert.match(verify, /'profile_option_values'/);
});
