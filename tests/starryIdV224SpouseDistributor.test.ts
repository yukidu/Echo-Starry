import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file=(p:string)=>readFileSync(p,'utf8');
const central=file('worker/starryIdCentralRouter.ts');
const directory=file('worker/starryIdProfileDirectoryRouter.ts');
const schema=file('worker/starryIdSpouseSchema.ts');
const spouse=file('worker/starryIdSpouseRouter.ts');
const page=file('worker/starryIdV222Enhancer.ts');
const publicCard=file('worker/starryIdV211Router.ts');
const sso=file('worker/downloadStarryCentralSso.ts');

test('central distributor ID validation and no pre-allocation of synthetic IDs',()=>{
  assert.match(spouse,/synthetic=\/\^n\[0-9\]\{7\}\$\//);
  assert.match(spouse,/numeric=\/\^\[0-9\]\+\$\//);
  assert.match(spouse,/crypto\.getRandomValues/);
  assert.match(spouse,/INSERT INTO non_distributor_ids/);
  assert.match(spouse,/DELETE FROM non_distributor_ids/);
  assert.match(spouse,/UPDATE profiles SET amwayId/);
  assert.match(central,/distributor_number_requires_dedicated_endpoint/);
  assert.match(sso,/handleStarryIdSpouse/);
});

test('spouse link is only active after the other account confirms',()=>{
  assert.match(spouse,/status='pending'/);
  assert.match(spouse,/status='active'/);
  assert.match(spouse,/if\(l\.requestedBy===id\)return json\(\{error:'必須由另一位會員確認'/);
  assert.match(spouse,/third\?\.count/);
  assert.match(spouse,/request-unlink/);
  assert.match(spouse,/approve-unlink/);
  assert.match(spouse,/keepUserId/);
  assert.match(schema,/CREATE TABLE IF NOT EXISTS spouse_links/);
  assert.match(schema,/spouse_slots \(userId TEXT PRIMARY KEY/);
  assert.match(spouse,/INSERT INTO spouse_slots/);
  assert.match(spouse,/DELETE FROM spouse_slots/);
  assert.match(schema,/non_distributor_history/);
  assert.match(spouse,/synthetic\.test\(prior\)/);
});

test('upline couples are displayed with ampersand, sponsors stay individual',()=>{
  assert.match(directory,/field === 'sponsor' \? text\(row\.name\)/);
  assert.match(directory,/spouseName/);
  assert.match(central,/sl\.status='active'/);
  assert.match(publicCard,/sl\.status='active'/);
  assert.match(page,/field==='sponsor'\?m\.name:m\.displayName/);
});

test('spouse profile is read-only, unlink via action, public card opt-in',()=>{
  assert.match(page,/已與 .* 綁定夫妻/);
  assert.match(page,/解除夫妻綁定/);
  assert.match(page,/api\/spouse-action/);
  assert.match(page,/visibility:\{spouse:toggle\.checked\}/);
  assert.match(publicCard,/DEFAULT_HIDDEN = new Set\(\['phone','birthday','spouse'\]\)/);
  assert.match(publicCard,/\['spouse','夫妻關係'\]/);
});
