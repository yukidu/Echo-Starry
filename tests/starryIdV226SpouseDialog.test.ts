import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('worker/starryIdV222Enhancer.ts','utf8');

test('spouse relationship is positioned immediately after distributor/member number',()=>{
  assert.match(s,/q\('\.field\[data-field="amwayId"\]'\s*,\s*fields\)/);
  assert.match(s,/numberField\.after\(panel\)/);
  assert.match(s,/className='v226-spouse'/);
  assert.doesNotMatch(s,/fields\.after\(panel\)/);
});
test('spouse confirmation uses a themed accessible dialog instead of native confirm',()=>{
  assert.match(s,/function confirmSpousePartner\(partner,number\)/);
  assert.match(s,/await confirmSpousePartner\(partner,next\)/);
  assert.match(s,/setAttribute\('role','dialog'\)/);
  assert.match(s,/setAttribute\('aria-modal','true'\)/);
  assert.match(s,/v226-dialog-overlay/);
  assert.match(s,/v226-dialog-person/);
  assert.match(s,/\['姓名',partner\.name\]/);
  assert.match(s,/\['獎銜',partner\.rank\]/);
  assert.match(s,/\['會場',partner\.center\]/);
  assert.doesNotMatch(s,/window\.confirm\('直銷商編號已有人使用/);
});
test('relationship card mutations do not trigger recursive refresh',()=>{
  assert.match(s,/mutations\.every\(m=>m\.target\.closest\?\.\('#v224Spouse'\)\)/);
});
