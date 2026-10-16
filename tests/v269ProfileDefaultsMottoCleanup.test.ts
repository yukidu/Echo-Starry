import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bridge = readFileSync(new URL('../src/memberProfileSchemaBridge.ts', import.meta.url), 'utf8');
const mottoUi = readFileSync(new URL('../src/v264ProfileMotto.ts', import.meta.url), 'utf8');
const schemaService = readFileSync(new URL('../worker/starryProfileSchemaService.ts', import.meta.url), 'utf8');
const memberRepository = readFileSync(new URL('../worker/memberRepository.ts', import.meta.url), 'utf8');

test('new-member selects start unselected instead of inventing profile answers', () => {
  assert.match(bridge, /const initializedSelects = new WeakSet<HTMLSelectElement>\(\)/);
  assert.match(bridge, /const stored = storedNativeValue\(field\.fieldKey\)/);
  assert.match(bridge, /next = stored && values\.includes\(stored\) \? stored : ''/);
  assert.match(bridge, /const desired = \['',\.\.\.values\.filter/);
  assert.match(bridge, /option\.textContent = index === 0 \? placeholder : value/);
  assert.match(bridge, /dispatchNativeChange\(control\)/);
  assert.doesNotMatch(bridge, /\[current,\.\.\.values\]/);
  assert.doesNotMatch(bridge, /desired\[0\] \|\| ''/);
});

test('a brand-new unreviewed member does not get a pretend rank selection', () => {
  assert.match(bridge, /fieldKey === 'rank'/);
  assert.match(bridge, /String\(user\.rank \|\| ''\) === '無'/);
  assert.match(bridge, /Number\(user\.profileEditCount \|\| 0\) === 0/);
  assert.match(memberRepository, /birthday: '', residence: '', center: '', motto: ''/);
});

test('central select validation remains enabled while stale UI choices are discarded', () => {
  assert.match(schemaService, /請使用中央最新選項/);
  assert.match(bridge, /else if \(next && !values\.includes\(next\)\)/);
  assert.match(bridge, /next = ''/);
});

test('Echo removes every duplicate motto field and keeps only the Quotes Starry primary editor', () => {
  assert.match(mottoUi, /removeDuplicateMottoFields/);
  assert.match(mottoUi, /data-starry-extension-field=\"motto\"/);
  assert.match(mottoUi, /data-starry-field=\"motto\"/);
  assert.match(mottoUi, /dataset\.profileMottoPrimary = '1'/);
  assert.match(mottoUi, /🎲 隨機一句/);
  assert.match(mottoUi, /\/api\/random-motto/);
  assert.doesNotMatch(mottoUi, /function makeDisplayCard/);
  assert.doesNotMatch(mottoUi, /function ensureDisplay/);
});
