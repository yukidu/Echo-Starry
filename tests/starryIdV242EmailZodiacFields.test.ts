import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const client = readFileSync(join(root, 'worker/starryIdV230ClientRouter.ts'), 'utf8');

test('v242 moves email out of the identity header and into the unified field area', () => {
  assert.match(client, /\.identity-main #displayEmail\{display:none!important\}/);
  assert.match(client, /upsertV242Field\(root,'email','Email',email,'email',own\)/);
  assert.match(client, /data-v242-extra/);
});

test('v242 renders zodiac as a readonly unified field calculated from birthday', () => {
  assert.match(client, /function zodiacFromBirthday/);
  assert.match(client, /upsertV242Field\(root,'zodiac','星座',zodiac,'zodiac',own/);
  assert.match(client, /依生日自動計算，無法手動修改/);
  assert.doesNotMatch(client, /button\.edit[^\n]+v242Zodiac/);
});

test('v242 email and zodiac both use the immediate v241 visibility eye flow', () => {
  assert.match(client, /makeV242Eye\(visibilityField,label,visible\)/);
  assert.match(client, /field==='email'\|\|field==='zodiac'/);
  assert.match(client, /toggleV241Eye\(b,e\)/);
});

test('v242 removes the duplicate zodiac text from the numerology summary', () => {
  assert.match(client, /function stripZodiacFromSummary/);
  assert.match(client, /replace\(\/\^星座：/);
});
