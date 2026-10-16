import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const gateway = readFileSync('worker/echoCentralProfileGateway.ts','utf8');
const start = gateway.indexOf('export async function writeEchoProfileToCentral');
const end = gateway.indexOf('export async function overlayEchoJsonResponse', start);
const saveBlock = gateway.slice(start, end);

test('v277 self profile save resolves the central identity only once on the normal path', () => {
  assert.match(saveBlock, /clean\(echoActor\.id\)===clean\(echoTarget\.id\)\?targetCentralId/);
  assert.doesNotMatch(saveBlock, /const targetCentralId=await ensureCentralEchoMember[\s\S]*const actorCentralId=await ensureCentralEchoMember/);
});

test('v277 unchanged distributor and relationship fields do not trigger extra writes', () => {
  assert.match(saveBlock, /requested!==clean\(before\.amwayId\)/);
  assert.match(saveBlock, /if\(label===oldLabel\)continue/);
});

test('v277 changed profile fields, audits and relationships are committed in one D1 batch', () => {
  assert.match(saveBlock, /const statements:any\[\]=\[\]/);
  assert.match(saveBlock, /if\(statements\.length\)await db\.batch\(statements\)/);
});

test('v277 does not re-read the central profile after a successful save', () => {
  assert.doesNotMatch(saveBlock, /const fresh=await centralProfileById/);
  assert.doesNotMatch(saveBlock, /return overlayEchoMemberWithCentral/);
  assert.match(saveBlock, /return mergeCentralProfileWithEcho\(echoTarget,saved\)/);
});

test('v277 central profile read groups profile, relation and spouse queries into one batch', () => {
  const profileStart = gateway.indexOf('async function centralProfileById');
  const profileEnd = gateway.indexOf('export async function ensureCentralEchoMember', profileStart);
  const profileBlock = gateway.slice(profileStart, profileEnd);
  assert.match(profileBlock, /await db\.batch\(\[/);
});
