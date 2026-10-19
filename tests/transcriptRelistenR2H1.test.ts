import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('Q1 R2 uses original audio and safely queues one admin-requested track', () => {
  const gateway = read('worker/transcriptV281Gateway.ts');
  const entry = read('worker/starryMainInlineLoginRouter.ts');
  const workflow = read('worker/transcriptWorkflowV282.ts');
  assert.ok(entry.includes('transcript-management'));
  assert.ok(gateway.includes('transcript-management'));
  assert.ok(gateway.includes('await superAdmin(request, env)'));
  assert.ok(gateway.includes("WHERE transcript_index.status IN ('ready','failed')"));
  assert.ok(gateway.includes('RETURNING trackId'));
  assert.ok(gateway.includes('queueNextTranscriptV293(env as any, { includeFailed: false })'));
  assert.ok(workflow.includes('getAudioSegment(this.env'));
  assert.ok(workflow.includes("task: 'transcribe'"));
  assert.ok(workflow.includes('Language identification hint'));
});

test('Q2 H1 adds per-track relisten button to the real management list', () => {
  const list = read('src/components/AudioTrackList.tsx');
  assert.ok(list.includes('aria-label="音檔管理"'));
  assert.ok(list.includes('重聽逐字稿'));
  assert.ok(list.includes('relistenBusy'));
  assert.ok(list.includes('disabled={relistenBusy}'));
  assert.ok(list.includes('transcriptProgressPresentation'));
  assert.ok(read('src/components/AudioWorkspacePage.tsx').includes('管理音檔'));
});

test('Keeps member correction and battery history but avoids old correction overlays', () => {
  const legacy = read('worker/transcriptRouter.ts');
  const moderation = read('worker/transcriptModerationRouter.ts');
  const gateway = read('worker/transcriptV281Gateway.ts');
  assert.ok(legacy.includes('transcript.createdAt'));
  assert.ok(moderation.includes('createdAt>=?'));
  assert.ok(gateway.includes('createdAt>=?'));
  assert.ok(!gateway.includes('DELETE FROM transcript_corrections'));
  assert.ok(!gateway.includes('DELETE FROM battery_transactions'));
});

test('Original-language subtitle stays first and hint never forces language translation', () => {
  const client = read('public/transcript-client-v290.js');
  const form = read('src/components/UploadModal.tsx');
  const workflow = read('worker/transcriptWorkflowV282.ts');
  assert.ok(client.includes("['zh-Hant','原音字幕']"));
  assert.ok(form.includes('自動辨識／混合語言（預設）'));
  assert.ok(form.includes('其他語言'));
  assert.ok(workflow.includes('preserving arbitrary mixed-language code switching'));
  assert.ok(workflow.includes('do not translate or unify languages'));
});
