import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const router = readFileSync('worker/starryIdNotificationsRouter.ts', 'utf8');
const sso = readFileSync('worker/downloadStarryCentralSso.ts', 'utf8');
const migration = readFileSync('starry-id/migrations/20261014_notifications.sql', 'utf8');

test('v230 notifications are a dedicated full page with mobile notification setup', () => {
  assert.match(router, /url\.pathname === '\/notifications'/);
  assert.match(router, /新訊息通知我/);
  assert.match(router, /serviceWorker\.register\('\/starry-id-sw\.js'/);
  assert.match(router, /pushManager\.subscribe/);
  assert.match(router, /showNotification/);
});

test('v230 notification schema stores feed, card visits and push subscriptions', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS starry_notifications/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS card_visit_events/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS starry_push_subscriptions/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS starry_push_vapid/);
});

test('v230 card visit history captures requested privacy and device fields', () => {
  assert.match(router, /CF-Connecting-IP/);
  assert.match(router, /regionOf\(request\)/);
  assert.match(router, /deviceOs\(ua\)/);
  assert.match(router, /viewerName/);
  assert.match(router, /viewerRank/);
  assert.match(router, /card_visit_events/);
});

test('v230 supports upline and super-admin rank review', () => {
  assert.match(router, /session\?\.isSuperAdmin/);
  assert.match(router, /platinum_upline/);
  assert.match(router, /diamond_upline/);
  assert.match(router, /upline-review/);
  assert.match(router, /super-admin-review/);
  assert.match(router, /核准 \/ 修改獎銜/);
});

test('v230 creates rank and spouse notifications and wires hooks before generic Starry ID routes', () => {
  assert.match(router, /獎銜變更已送出/);
  assert.match(router, /夫妻關係已解除/);
  assert.match(router, /夫妻關係已建立/);
  assert.match(sso, /captureSpouseNotificationContext/);
  assert.match(sso, /notifySpouseMutation/);
  assert.match(sso, /notifyRankMutation/);
  assert.match(sso, /observeStarryIdPublicCardVisit/);
});
