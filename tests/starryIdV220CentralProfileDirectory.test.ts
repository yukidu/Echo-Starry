import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PROFILE_OPTIONS } from '../worker/starryIdProfileDirectoryRouter';

const root = process.cwd();
const directory = readFileSync(join(root, 'worker/starryIdProfileDirectoryRouter.ts'), 'utf8');
const rankRouter = readFileSync(join(root, 'worker/starryIdRankUpdateRouter.ts'), 'utf8');
const sso = readFileSync(join(root, 'worker/downloadStarryCentralSso.ts'), 'utf8');
const enhancer = readFileSync(join(root, 'worker/starryIdV218ResponseEnhancer.ts'), 'utf8');
const migration = readFileSync(join(root, 'starry-id/migrations/20261014_profile_options.sql'), 'utf8');

test('Echo member profile dropdowns are centralized in Starry ID', () => {
  assert.equal(PROFILE_OPTIONS.residence.length, 21);
  assert.ok(PROFILE_OPTIONS.residence.includes('苗栗'));
  assert.ok(PROFILE_OPTIONS.center.includes('新竹'));
  assert.ok(PROFILE_OPTIONS.rank.includes('創辦人白金'));
  assert.ok(PROFILE_OPTIONS.rank.includes('鑽石級以上'));
  assert.ok(PROFILE_OPTIONS.joinReason.includes('參加營養課'));
  assert.ok(PROFILE_OPTIONS.stayReason.includes('打造自己的事業與團隊'));
  assert.match(directory, /CREATE TABLE IF NOT EXISTS profile_option_values/);
  assert.match(directory, /sourceApp TEXT NOT NULL DEFAULT 'starry-id'/);
  assert.match(migration, /'residence','苗栗'/);
  assert.match(migration, /'center','新竹'/);
  assert.match(migration, /'rank','創辦人白金'/);
});

test('central options API is routed before generic Starry ID handlers', () => {
  assert.match(sso, /handleStarryIdProfileDirectory/);
  assert.match(sso, /profileDirectoryResponse/);
  assert.match(directory, /\/api\/profile-options/);
  assert.match(directory, /source: 'starry-id-central'/);
});

test('upline search uses central members and approved-rank qualification', () => {
  assert.match(directory, /\/api\/profile-directory/);
  assert.match(directory, /LOWER\(COALESCE\(p\.name,''\)\) LIKE LOWER\(\?\)/);
  assert.match(directory, /LOWER\(COALESCE\(p\.amwayId,''\)\) LIKE LOWER\(\?\)/);
  assert.match(directory, /PLATINUM_PLUS/);
  assert.match(directory, /DIAMOND_PLUS/);
  assert.match(directory, /Number\(row\.rankApproved \|\| 0\) === 1/);
  assert.match(enhancer, /只顯示已審核白金以上會員/);
  assert.match(enhancer, /只顯示已審核鑽石以上會員/);
});

test('selecting an upline stores relatedUserId while manual labels remain possible', () => {
  assert.match(directory, /relatedUserId=excluded\.relatedUserId/);
  assert.match(directory, /resolutionStatus='resolved'/);
  assert.match(directory, /resolutionStatus='unresolved'/);
  assert.match(directory, /不能把自己設定成自己的上線或推薦人/);
  assert.match(enhancer, /input\.dataset\.relatedUserId=candidate\.id\|\|''/);
  assert.match(enhancer, /legacyLabel:label/);
});

test('rank updates preserve audit semantics and only accept central rank values', () => {
  assert.match(rankRouter, /PROFILE_OPTIONS\.rank/);
  assert.match(rankRouter, /rankAuditStatus='pending'/);
  assert.match(rankRouter, /rankAuditStatus='approved'/);
  assert.match(rankRouter, /rankApproved=0/);
  assert.match(rankRouter, /rankApproved=1/);
  assert.match(sso, /handleStarryIdRankUpdate/);
});

test('member UI uses central selects, relationship autocomplete and keeps manual checkmark save', () => {
  assert.match(enhancer, /SELECT_FIELDS=new Set\(\['residence','center','rank','joinReason','stayReason'\]\)/);
  assert.match(enhancer, /RELATION_FIELDS=new Set\(\['sponsor','platinumUpline','diamondUpline'\]\)/);
  assert.match(enhancer, /button\.textContent='✓'/);
  assert.match(enhancer, /\/api\/profile-options/);
  assert.match(enhancer, /\/api\/profile-directory\?field=/);
  assert.match(enhancer, /\/api\/profile-relationship/);
});

test('theme switch is removed from top toolbar and kept in hamburger menu', () => {
  assert.match(enhancer, /document\.getElementById\('v211Theme'\)\?\.remove\(\)/);
  assert.match(enhancer, /v220-theme/);
  assert.match(enhancer, /淺色模式/);
  assert.match(enhancer, /深色模式/);
  assert.match(enhancer, /\.top-actions #v211Theme\{display:none!important\}/);
});

test('v220 remains Web First and does not add native stacks', () => {
  assert.doesNotMatch(directory + rankRouter + enhancer, /@capacitor|firebase/i);
});
