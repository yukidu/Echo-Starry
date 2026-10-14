import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync('worker/starryIdV230ClientRouter.ts', 'utf8');
const privacy = readFileSync('worker/privacyCrawlerRouter.ts', 'utf8');

test('v230 injects the member-center UX client only into Starry ID member pages', () => {
  assert.match(privacy, /starry-id-v230\.js/);
  assert.match(privacy, /url\.pathname !== '\/' && url\.pathname !== '\/my-card'/);
});

test('v230 shows larger right-aligned field actions in cancel-save-visibility order', () => {
  assert.match(client, /v230-field-actions/);
  assert.match(client, /v230-cancel/);
  assert.match(client, /desired=\[cancel,edit,eye\]/);
  assert.match(client, /cancel\.textContent='×'/);
  assert.match(client, /width:41px!important/);
  assert.match(client, /font-size:18px!important/);
});

test('v230 replaces native unsaved switching with large save or discard dialog', () => {
  assert.match(client, /這個欄位還沒儲存/);
  assert.match(client, /no\.textContent='不儲存'/);
  assert.match(client, /yes\.textContent='儲存'/);
  assert.match(client, /v230-modal-overlay/);
  assert.doesNotMatch(client, /window\.confirm/);
});

test('v230 motto uses Starry inspiration label, fullscreen dice animation and generated game sound', () => {
  assert.match(client, /🎲 招喚繁星給我靈感/);
  assert.match(client, /v230-dice-overlay/);
  assert.match(client, /AudioContext/);
  assert.match(client, /createOscillator/);
});

test('v230 member toolbar exposes a notification bell for everyone after login', () => {
  assert.match(client, /v230NotificationsBtn/);
  assert.match(client, /b\.textContent='🔔'/);
  assert.match(client, /location\.href='\/notifications'/);
});
