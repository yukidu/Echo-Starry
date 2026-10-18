import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Q1 R2: manual relistening queues the ORIGINAL audio via existing Workflow', () => {
  const gateway = read('worker/transcriptV281Gateway.ts');
  const workflow = read('worker/transcriptWorkflowV282.ts');
  const entry = read('worker/starryMainInlineLoginRouter.ts');
  assert.match(entry, /transcript-management\\/relisten/);
  assert.match(gateway, /transcript-management\\/relisten/);
  assert.match(gateway, /await superAdmin\\(request, env\\)/);
  assert.match(gateway, /WHERE transcript_index.status IN \\('ready','failed'\\)/);
  assert.match(gateway, /RETURNING trackId/);
  assert.match(gateway, /queueNextTranscriptV293\\(env as any, \\{ includeFailed: false \\}\\)/);
  assert.match(workflow, /getAudioSegment\\(this.env/);
  assert.match(workflow, /task: 'transcribe'/);
  assert.match(workflow, /Language identification hint/);
});

test('Q2 H1: action is on actual audio management list, not an automatic old-file batch', () => {
  const list = read('src/v161AudioManagementNavigation.tsx');
  assert.match(list, /aria-label="音檔管理"/);
  assert.match(list, /重聽逐字稿/);
  assert.match(list, /relistenBusy/);
  assert.match(list, /disabled=\\{relistenBusy\\}/);
  assert.match(list, /transcriptProgressPresentation/);
  assert.match(list, /管理音檔/);
  assert.match(read('src/components/Navbar.tsx'), /上傳音檔/);
});

test('Retains correction history and issued battery rewards without applying stale text', () => {
  const legacy = read('worker/transcriptRouter.ts');
  const moderation = read('worker/transcriptModerationRouter.ts');
  const gateway = read('worker/transcriptV281Gateway.ts');
  assert.match(legacy, /transcript\\.createdAt/);
  assert.match(moderation, /createdAt>=\\?/);
  assert.match(gateway, /createdAt>=\\?/);
  assert.doesNotMatch(gateway, /DELETE FROM transcript_correction/);
  assert.doesNotMatch(gateway, /DELETE FROM battery_transactions/);
});

test('Original source subtitle is the first default and hints are not forced translations', () => {
  const client = read('public/transcript-client-v290.js');
  const form = read('src/components/UploadModal.tsx');
  const workflow = read('worker/transcriptWorkflowV282.ts');
  assert.match(client, /\\['zh-Hant','原音字幕'\\]/);
  assert.match(form, /自動辨識／混合語言（預設）/);
  assert.match(form, /其他語言/);
  assert.match(workflow, /preserving arbitrary mixed-language code switching/);
  assert.match(workflow, /do not translate or unify languages/);
});
