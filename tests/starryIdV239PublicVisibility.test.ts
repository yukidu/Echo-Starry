import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/starryIdV211Router.ts', import.meta.url), 'utf8');

test('v239: every member-center visibility field is supported by public card settings', () => {
  for (const field of ['joinReason', 'stayReason', 'talentNumber', 'lifeNumber']) {
    assert.match(source, new RegExp(`PUBLIC_FIELDS[^\\n]*['\"]${field}['\"]`), `${field} must be accepted by /api/card-settings visibility`);
  }
});

test('v239: public card reads and renders the previously missing fields', () => {
  assert.match(source, /p\.joinReason/);
  assert.match(source, /p\.stayReason/);
  assert.match(source, /joinReason:\s*member\.joinReason/);
  assert.match(source, /stayReason:\s*member\.stayReason/);
  assert.match(source, /\['joinReason','初次如何認識安麗？'\]/);
  assert.match(source, /\['stayReason','什麼原因留在安麗？'\]/);
  assert.match(source, /\['talentNumber','天賦數'\]/);
  assert.match(source, /\['lifeNumber','生命靈數'\]/);
});

test('v239: public settings uses friendly labels for added visibility fields', () => {
  assert.match(source, /joinReason:'初次如何認識安麗？'/);
  assert.match(source, /stayReason:'什麼原因留在安麗？'/);
});
