import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DEFAULT_CLEANUP_POLICY,cleanTranscriptText,semanticCandidates,validateCleanupPolicy} from '../shared/transcriptCleanupPolicy';

const read=(path:string)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('C1 removes only unambiguous fillers and threefold stutters',()=>{
  assert.equal(cleanTranscriptText('呃，我我我覺得，那個問題非常非常重要',DEFAULT_CLEANUP_POLICY),'我覺得，那個問題非常非常重要');
  assert.equal(cleanTranscriptText('厄運不是運氣，嗯，對。',DEFAULT_CLEANUP_POLICY),'厄運不是運氣，嗯，對。');
  assert.equal(cleanTranscriptText('呃逆需要診治',DEFAULT_CLEANUP_POLICY),'呃逆需要診治');
  assert.equal(cleanTranscriptText('好好好我們一起去',DEFAULT_CLEANUP_POLICY),'好好好我們一起去');
});
test('ambiguous words are left untouched unless AI selects specific bounded ids',()=>{
  const line='那個，然後我們開始';
  assert.equal(cleanTranscriptText(line,DEFAULT_CLEANUP_POLICY),line);
  assert.deepEqual(semanticCandidates(line,DEFAULT_CLEANUP_POLICY).map(x=>x.id),['0:那個']);
  assert.equal(cleanTranscriptText(line,DEFAULT_CLEANUP_POLICY,['0:那個']),'然後我們開始');
  assert.equal(cleanTranscriptText('就是這樣',DEFAULT_CLEANUP_POLICY),'就是這樣');
});
test('admin-controlled protected words take precedence and unsafe lists are rejected',()=>{
  const p=validateCleanupPolicy({...DEFAULT_CLEANUP_POLICY,fillerWords:['嗯'],keepWords:['嗯']});
  assert.equal(cleanTranscriptText('嗯，我知道',p),'嗯，我知道');
  assert.throws(()=>validateCleanupPolicy({...DEFAULT_CLEANUP_POLICY,fillerWords:['(.*)+']}),/不支援/);
  assert.throws(()=>validateCleanupPolicy({...DEFAULT_CLEANUP_POLICY,keepWords:Array.from({length:41},(_,i)=>String(i))}),/最多 40/);
});
test('raw originals, timecodes and past rewards are separated from display-only cleanup',()=>{
  const workflow=read('worker/transcriptWorkflowV282.ts');
  const legacy=read('worker/transcriptRouter.ts');
  const moderation=read('worker/transcriptModerationRouter.ts');
  assert.match(workflow,/cleanedSegments/);
  assert.match(workflow,/cleanupVersion/);
  assert.match(workflow,/text: fullText/);
  assert.match(workflow,/segments,/);
  assert.match(legacy,/cleanedBaseline/);
  assert.match(moderation,/cleanedBaseline/);
  assert.doesNotMatch(workflow,/DELETE FROM transcript_correction|DELETE FROM battery_transactions/);
});
test('C1 management is under Ai 逐字稿 and admin-only with editable preview, history and defaults',()=>{
  const qa=read('src/components/TranscriptQaAdmin.tsx');
  const admin=read('src/components/TranscriptCleanupAdmin.tsx');
  const gateway=read('worker/transcriptV281Gateway.ts');
  const policy=read('worker/transcriptCleanupService.ts');
  assert.match(qa,/<TranscriptCleanupAdmin \/>/);
  assert.match(admin,/口語淨化規則/);
  for(const keyword of ['自動刪除詞','保留詞','語意判斷詞','預覽','恢復 C1 預設','設定版本紀錄','還原此版本']) assert.ok(admin.includes(keyword));
  assert.match(gateway,/superAdmin\(request,env\)/);
  assert.match(policy,/transcript_cleanup_versions/);
  assert.match(policy,/expectedVersion/);
  assert.match(policy,/temperature:0/);
  assert.match(policy,/never during playback/);
});
