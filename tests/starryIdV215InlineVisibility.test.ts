import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Starry ID places inline visibility controls next to editable profile fields', async () => {
  const page = await read('worker/starryIdMemberCenterPage.ts');
  assert.match(page, /function makeVisibilityButton\(field,titleText,className\)/);
  assert.match(page, /className='field-eye'/);
  assert.match(page, /\/api\/card-settings/);
  assert.match(page, /visibility:\{\[field\]:next\}/);
  assert.match(page, /眼睛可控制該欄位是否顯示在公開名片/);
});

test('Starry ID avatar can be edited and has its own public visibility control', async () => {
  const page = await read('worker/starryIdMemberCenterPage.ts');
  const central = await read('worker/starryIdCentralRouter.ts');
  assert.match(page, /makeVisibilityButton\('avatar','照片','avatar-tool'\)/);
  assert.match(page, /input\.type='file'/);
  assert.match(page, /input\.accept='image\/\*'/);
  assert.match(page, /canvas\.toDataURL\('image\/jpeg',0\.88\)/);
  assert.match(page, /JSON\.stringify\(\{avatar\}\)/);
  assert.match(central, /'name', 'avatar', 'amwayId'/);
});

test('public card privacy remains server-side including avatar', async () => {
  const router = await read('worker/starryIdV211Router.ts');
  assert.match(router, /profile_field_visibility/);
  assert.match(router, /visibility\[key\]!==false/);
  assert.match(router, /visibility\.avatar!==false/);
  assert.match(router, /visibility\.numerology!==false/);
});

test('visibility controls are restricted to the signed-in owner', async () => {
  const page = await read('worker/starryIdMemberCenterPage.ts');
  assert.match(page, /function isOwnProfile\(\)/);
  assert.match(page, /if\(isOwnProfile\(\)\)\{/);
  assert.match(page, /if\(!isOwnProfile\(\)\) return/);
});
