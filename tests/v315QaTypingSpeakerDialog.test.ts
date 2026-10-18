import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {formatSpeakerUploadDate} from '../src/utils/speakerDate';

const read=(p:string)=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const comments=read('src/components/CommentsSection.tsx');
const speaker=read('src/components/SpeakerProfilePage.tsx');
const release=read('tests/releaseIntegrity.test.ts');
const sw=read('public/sw.js');

test('admin quota never renders negative sentinel values on the QA page',()=>{
  assert.match(comments,/qaStatus\.unlimited \|\| qaStatus\.freeLeft < 0 \|\| qaStatus\.left < 0/);
  assert.match(comments,/超級管理員：網站內召喚不限次數、不扣電池/);
  assert.match(comments,/Math\.max\(0,qaStatus\.freeLeft\)/);
  assert.match(comments,/Math\.max\(0,qaStatus\.left\)/);
});
test('long foreign names wrap naturally and the typing message gets a separate full-width row',()=>{
  assert.match(comments,/min-w-0 max-w-full rounded-xl/);
  assert.match(comments,/SpeakerNameLink name=\{speakerName\} className="break-all/);
  assert.match(comments,/正在輸入訊息中/);
  assert.match(comments,/className="mt-2 leading-normal/);
});
test('speaker recordings show Taiwan local time rather than raw ISO timestamps',()=>{
  assert.equal(formatSpeakerUploadDate('2026-10-02T09:43:55.277Z'),'2026/10/02 17:43');
  assert.equal(formatSpeakerUploadDate('2026-10-02'),'2026/10/02');
  assert.equal(formatSpeakerUploadDate(undefined),'日期未設定');
  assert.equal(formatSpeakerUploadDate('invalid'),'日期未設定');
  assert.match(speaker,/formatSpeakerUploadDate\(t\.uploadDate\)/);
});
test('custom confirmation stays on top of speaker popup and keeps the original player',()=>{
  assert.doesNotMatch(speaker,/window\.confirm/);
  assert.match(speaker,/createPortal\(/);
  assert.match(speaker,/role="alertdialog"/);
  assert.match(speaker,/z-\[250\]/);
  assert.match(speaker,/setConfirmTrack\(null\)/);
  assert.match(speaker,/\(onPlayTrack\|\|onOpenTrack\)\(id\)/);
  assert.match(speaker,/event\.stopPropagation\(\);setConfirmTrack\(null\)/);
});
test('PWA shell is updated so existing mobile browsers receive this fix',()=>{
  assert.match(sw,/const CACHE_NAME = 'echostars-shell-v\d+'/);
  assert.match(release,/single current PWA cache version/);
});
