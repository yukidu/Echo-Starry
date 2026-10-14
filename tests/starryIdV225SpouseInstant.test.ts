import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const backend=readFileSync('worker/starryIdSpouseRouter.ts','utf8');
const frontend=readFileSync('worker/starryIdV222Enhancer.ts','utf8');

test('duplicate distributor number previews the partner name rank and center',()=>{
 assert.match(backend,/p\.name,p\.amwayId,p\.center,p\.approvedRank/);
 assert.match(backend,/requiresConfirmation:true/);
 assert.match(backend,/name:clean\(other\.name\)/);
 assert.match(backend,/rank:clean\(other\.approvedRank\)/);
 assert.match(backend,/center:clean\(other\.center\)/);
 assert.match(frontend,/姓名：/);
 assert.match(frontend,/獎銜：/);
 assert.match(frontend,/會場：/);
});
test('single confirming member creates active spouse link, never pending',()=>{
 assert.match(backend,/input\.confirmSpouse!==true/);
 assert.match(backend,/VALUES\(\?,\?,\?,'active'/);
 assert.match(backend,/spouseLinked:true/);
 assert.match(frontend,/confirmSpouse:true/);
 assert.match(frontend,/不需要對方確認/);
});
test('non-distributor number appears immediately on checking',()=>{
 assert.match(frontend,/checkbox\.onchange=async/);
 assert.match(frontend,/input\.value=d\.number/);
 assert.match(frontend,/專屬編號：/);
 assert.match(backend,/nonDistributor===true/);
});
