import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const spouse = readFileSync('worker/starryIdSpouseRouter.ts', 'utf8');

test('v229 displays an approved legacy rank even when approvedRank is empty', () => {
  assert.match(spouse, /p\.rank,p\.approvedRank,p\.rankApproved,p\.rankAuditStatus/);
  assert.match(spouse, /Number\(row\?\.rankApproved\|\|0\)===1\?clean\(row\?\.approvedRank\|\|row\?\.rank\):''/);
  assert.match(spouse, /rank:effectiveRank\(other\)\|\|'未審核'/);
});

test('v229 keeps Echo legacy amwayId aligned after Starry ID distributor-number changes', () => {
  assert.match(spouse, /async function syncLegacyNumber\(legacyDb:any,userId:string,number:string\)/);
  assert.match(spouse, /UPDATE users SET amwayId=\? WHERE id=\?/);
  assert.match(spouse, /await syncLegacyNumber\(legacyDb,id,number\)/);
  assert.match(spouse, /await syncLegacyNumber\(legacyDb,other,num\)/);
  assert.match(spouse, /await syncLegacyNumber\(legacyDb,loser,replacement\)/);
});

test('v229 does not rewrite existing divergent production data during read-only status', () => {
  assert.match(spouse, /if\(url\.pathname==='\/api\/spouse-status'&&request\.method==='GET'\)return json\(await status\(db,session\.userId\)\)/);
});
