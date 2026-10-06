import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app=readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const stickers=readFileSync(new URL('../src/components/StickersModal.tsx',import.meta.url),'utf8');
const profile=readFileSync(new URL('../src/components/ProfileModal.tsx',import.meta.url),'utf8');
const changelog=readFileSync(new URL('../src/changelogReleaseNotes.ts',import.meta.url),'utf8');

test('manual sticker page exposes the approved-leader downline invite actions',()=>{
  assert.match(stickers,/綁定成為我下線/);
  assert.match(stickers,/複製網址/);
  assert.match(stickers,/傳 LINE 或 APP/);
  assert.match(stickers,/\/api\/organization\/invite-link/);
  assert.match(stickers,/navigator\.share/);
  assert.match(stickers,/onRequireProfileEdit/);
});

test('profile keeps personal edit name while showing the canonical couple display name',()=>{
  assert.match(profile,/organizationDisplayName \|\| currentUser\.name/);
  assert.match(profile,/value=\{name\}/);
  assert.match(profile,/\/api\/organization\/me/);
  assert.match(profile,/forceEdit/);
  assert.match(profile,/直銷商編號/);
});

test('profile save confirms duplicate dealer ID and direct invite route auto binds signed-in members',()=>{
  assert.match(app,/couple-candidate\?dealerId=/);
  assert.match(app,/是否要綁定與\$\{partnerName\}為夫妻關係嗎/);
  assert.match(app,/\/api\/organization\/couple-bind/);
  assert.match(app,/pathname\.match\(\^?[^\n]*upline/);
  assert.match(app,/\/api\/organization\/invite-accept/);
  assert.match(app,/forceEdit=\{profileEditRequested\}/);
});

test('v4.2 explains shared organization but independent personal behavior',()=>{
  assert.match(changelog,/version: 'v4\.2'/);
  assert.match(changelog,/貼紙、播放進度、心得、按讚、評價、通知與其他個人紀錄全部維持各自獨立/);
});
