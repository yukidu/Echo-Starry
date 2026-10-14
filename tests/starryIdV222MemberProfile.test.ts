import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateNumerology } from '../src/utils/numerology';
import { extractQuotes } from '../worker/starryIdRandomMottoRouter';

const root = process.cwd();
const ui = readFileSync(join(root,'worker/starryIdV222Enhancer.ts'),'utf8');
const central = readFileSync(join(root,'worker/starryIdCentralRouter.ts'),'utf8');
const directory = readFileSync(join(root,'worker/starryIdProfileDirectoryRouter.ts'),'utf8');
const sso = readFileSync(join(root,'worker/downloadStarryCentralSso.ts'),'utf8');
const response = readFileSync(join(root,'worker/starryIdV218ResponseEnhancer.ts'),'utf8');
const publicCard = readFileSync(join(root,'worker/starryIdV211Router.ts'),'utf8');

test('quotes source follows yukidu/quotes category columns, excludes photo and uncategorized',()=>{
  const csv = 'ID,Photo,希望,未分類,人生\n1,https://image,勇敢去做,skip,活在當下\n2,https://image,明天更好,skip,勇敢去做';
  assert.deepEqual(extractQuotes(csv),['勇敢去做','明天更好','活在當下']);
  assert.deepEqual(extractQuotes('A,B,C\n1,photo,"一句,有逗號"'),['一句,有逗號']);
  assert.match(sso,/handleStarryIdRandomMotto/);
  assert.match(ui,/\/api\/random-motto/);
  assert.match(ui,/🎲 隨機/);
  assert.match(ui,/按 ✓ 才會儲存/);
});

test('only birthday is editable, server derives zodiac talent and life from Echo algorithm',()=>{
  assert.doesNotMatch(central,/\'birthday\', \'motto\', \'zodiac\', \'talentNumber\', \'lifeNumber\'/);
  assert.match(central,/calculateNumerology\(raw\)/);
  assert.match(central,/allowed\.zodiac = result\?\.zodiac/);
  assert.match(central,/allowed\.talentNumber = result\?\.talentNumber/);
  assert.match(central,/allowed\.lifeNumber = result\?\.lifeNumber/);
  assert.match(central,/生日格式不正確/);
  assert.match(ui,/DERIVED=new Set\(\['talentNumber','lifeNumber','zodiac'\]\)/);
  assert.match(ui,/input\.type='date'/);
  assert.match(ui,/updateChart\(input\.value\)/);
  assert.match(ui,/v222-num-grid/);
  assert.match(publicCard,/const grid=visibility\.numerology!==false&&data\.birthday/);
  assert.doesNotMatch(publicCard,/\['talentNumber','天賦數'\],\['lifeNumber','生命靈數'\]/);
  assert.equal(calculateNumerology('1985-07-03')?.zodiac,'巨蟹座');
});

test('one editor at a time; dirty switch asks save and retains checkmark-only commit',()=>{
  assert.match(ui,/let active=null,busy=false/);
  assert.match(ui,/if\(active\.button===b\)\{await save\(\);return\}/);
  assert.match(ui,/window\.confirm\('上一個欄位尚未儲存/);
  assert.match(ui,/if\(!await save\(\)\)return/);
  assert.match(ui,/button\.textContent='✓'/);
  assert.match(response,/if\(window\.__starryV222\)return/);
  assert.match(response,/enhanceStarryIdV222MemberCenter\(html\)/);
});

test('central dropdowns use custom listbox, not browser native select',()=>{
  assert.match(ui,/v222-combobox/);
  assert.match(ui,/v222-options/);
  assert.match(ui,/\/api\/profile-options/);
  assert.doesNotMatch(ui,/document\.createElement\('select'\)/);
});

test('sponsor suggestions show central center and approved rank and bind exact member id',()=>{
  assert.match(directory,/p\.center,p\.rank,p\.approvedRank/);
  assert.match(directory,/center: text\(row\.center\)/);
  assert.match(ui,/會場：/);
  assert.match(ui,/獎銜：/);
  assert.match(ui,/active\.relatedUserId=m\.id/);
  assert.match(ui,/\/api\/profile-relationship/);
  assert.match(ui,/同名中央會員/);
});

test('topbar is full-width max-content, mobile card button enlarged, light theme fixed',()=>{
  assert.match(ui,/width:100%!important/);
  assert.match(ui,/box-sizing:border-box!important/);
  assert.match(ui,/\.topbar \.brand\{flex:1 1 auto!important/);
  assert.match(ui,/calc\(\(100vw - 1060px\)\/2\)/);
  assert.match(ui,/border-radius:0!important/);
  assert.match(ui,/#myCardBtn\{font-size:15px!important;min-width:96px/);
  assert.match(ui,/html\[data-starry-theme="light"\]/);
  assert.doesNotMatch(ui,/@capacitor|firebase/i);
});
