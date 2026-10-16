import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const central=readFileSync('worker/starryIdCentralRouter.ts','utf8');
const center=readFileSync('worker/starryIdMemberCenterPage.ts','utf8');
const publicRouter=readFileSync('worker/starryIdV211Router.ts','utf8');
const bridge=readFileSync('worker/starryIdV212PublicCardBridge.ts','utf8');

test('v274 central member responses carry the active spouse name',()=>{
  assert.match(central,/AS spouseName/);
  assert.match(central,/spouseName: row\.spouseName \|\| ''/);
  assert.match(central,/sl\.status='active'/);
});

test('v274 member center places spouse directly below the member number',()=>{
  assert.match(center,/field==='amwayId'&&user\.spouseName/);
  assert.match(center,/夫妻綁定：/);
  assert.match(center,/className='spouse-link'/);
});

test('v274 public page accepts cardNumber and shows spouse under the identifier',()=>{
  assert.match(publicRouter,/WHERE cardNumber=\? LIMIT 1/);
  assert.match(publicRouter,/data\.spouseName=text\(partner\?\.name\)/);
  assert.match(publicRouter,/key==='amwayId'\|\|key==='cardNumber'/);
  assert.match(publicRouter,/夫妻綁定：/);
  assert.doesNotMatch(publicRouter,/\['spouse','夫妻關係'\]/);
});

test('v274 shared distributor number is accepted only for exactly two active spouses',()=>{
  assert.match(bridge,/rows\.length !== 2/);
  assert.match(bridge,/spouse_links/);
  assert.match(bridge,/status='active'/);
  assert.match(bridge,/LIMIT 3/);
  assert.match(bridge,/CASE WHEN LOWER\(slug\)=LOWER\(\?\)/);
});
