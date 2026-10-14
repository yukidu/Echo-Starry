import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../worker/starryIdV211Router.ts', import.meta.url), 'utf8');

test('v239: join and stay reasons are supported by public card visibility settings', () => {
  for (const field of ['joinReason', 'stayReason']) {
    assert.match(source, new RegExp(`PUBLIC_FIELDS[^\\n]*['\"]${field}['\"]`), `${field} must be accepted by /api/card-settings visibility`);
  }
});

test('v239: public card reads and renders join/stay reasons', () => {
  assert.match(source, /p\.joinReason/);
  assert.match(source, /p\.stayReason/);
  assert.match(source, /joinReason:\s*member\.joinReason/);
  assert.match(source, /stayReason:\s*member\.stayReason/);
  assert.match(source, /\['joinReason','初次如何認識安麗？'\]/);
  assert.match(source, /\['stayReason','什麼原因留在安麗？'\]/);
});

test('v239: derived talent/life numbers stay out of ordinary public-card rows', () => {
  assert.doesNotMatch(source, /\['talentNumber','天賦數'\],\['lifeNumber','生命靈數'\]/);
  assert.match(source, /const grid=visibility\.numerology!==false&&data\.birthday/);
});

test('v239: public settings uses friendly labels for added visibility fields', () => {
  assert.match(source, /joinReason:'初次如何認識安麗？'/);
  assert.match(source, /stayReason:'什麼原因留在安麗？'/);
});
