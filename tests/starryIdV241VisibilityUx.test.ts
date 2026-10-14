import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const client = readFileSync(join(root, 'worker/starryIdV230ClientRouter.ts'), 'utf8');

test('v241 hides spouse relationship box when there is no spouse binding', () => {
  assert.match(client, /#v224Spouse\.v241-no-spouse/);
  assert.match(client, /copy\.includes\('目前尚未綁定夫妻'\)/);
  assert.match(client, /classList\.toggle\('v241-no-spouse'/);
});

test('v241 visibility eye reacts optimistically before persistence finishes', () => {
  const toggleStart = client.indexOf('function toggleV241Eye');
  assert.notEqual(toggleStart, -1);
  const toggleEnd = client.indexOf('function upgradeEye', toggleStart);
  const body = client.slice(toggleStart, toggleEnd);
  assert.ok(body.indexOf('paintV241Eye(button,next,label)') >= 0);
  assert.ok(body.indexOf("api('/api/card-settings'") >= 0);
  assert.ok(body.indexOf('paintV241Eye(button,next,label)') < body.indexOf("api('/api/card-settings'"));
  assert.match(client, /eyeQueues=new Map/);
});

test('v241 eye status appears beside the pressed position and dismisses quickly', () => {
  assert.match(client, /pop\.textContent=\(visible\?'已開啟':'已關閉'\)\+label/);
  assert.match(client, /event\?\.clientX/);
  assert.match(client, /event\?\.clientY/);
  assert.match(client, /setTimeout\(dismissEyeFeedback,2000\)/);
  assert.match(client, /addEventListener\('pointerdown',dismissEyeFeedback,true\)/);
});

test('v241 upgrades old eye buttons so legacy delayed handler cannot intercept them', () => {
  assert.match(client, /classList\.remove\('field-eye'\)/);
  assert.match(client, /classList\.add\('v241-eye'\)/);
  assert.match(client, /removeAttribute\('data-v216-eye'\)/);
  assert.match(client, /classList\.remove\('avatar-tool'\)/);
  assert.match(client, /classList\.add\('v241-avatar-eye'\)/);
});
