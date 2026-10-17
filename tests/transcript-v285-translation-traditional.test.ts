import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const presentation = readFileSync('public/transcript-presentation-v285.js','utf8');
const workflow = readFileSync('worker/transcriptWorkflowV282.ts','utf8');
const translation = readFileSync('worker/transcriptTranslationV285.ts','utf8');
const gateway = readFileSync('worker/transcriptV281Gateway.ts','utf8');
const ledger = readFileSync('worker/transcriptLedgerSettingsInjector.ts','utf8');
const html = readFileSync('index.html','utf8');

test('v285 presentation JavaScript is valid and loads after v284', () => {
  assert.doesNotThrow(() => new Function(presentation));
  assert.match(html, /transcript-presentation-v284\.js\?v=284[\s\S]*transcript-presentation-v285\.js\?v=285/);
});

test('enlarged transcript defaults above floating player and supports long press drag', () => {
  assert.match(presentation, /data-echostars-media-session/);
  assert.match(presentation, /--v285-overlay-bottom/);
  assert.match(presentation, /420/);
  assert.match(presentation, /setPointerCapture/);
  assert.match(presentation, /v285-manual-position/);
  assert.match(presentation, /rgba\(0,0,0,\.36\)/);
});

test('translation menu includes mandatory native-language labels', () => {
  for (const label of ['简体中文','English','Tiếng Việt','Bahasa Indonesia','廣東話','日本語','한국어','Français','हिन्दी']) {
    assert.match(presentation, new RegExp(label));
  }
  assert.match(presentation, /翻譯 ▾/);
  assert.match(presentation, /\?translate=/);
});

test('translations preserve auth via original transcript API and cache in R2', () => {
  assert.match(translation, /transcriptMemberNotificationsRouter/);
  assert.match(translation, /sourceHash/);
  assert.match(translation, /\/translations\//);
  assert.match(translation, /@cf\/openai\/gpt-oss-20b/);
  assert.match(gateway, /handleTranscriptTranslationV285/);
});

test('Chinese transcript is normalized to Taiwan Traditional before R2 storage', () => {
  assert.match(workflow, /language: 'zh-Hant-TW'/);
  assert.match(workflow, /traditionalizeSegments/);
  assert.match(workflow, /Never output Simplified Chinese/);
  assert.match(workflow, /customMetadata: \{ trackId, model: MODEL, format: 'json', language: 'zh-Hant-TW' \}/);
});

test('super admin transcript battery settings are promoted near the top of ledger', () => {
  assert.match(ledger, /逐字稿功能解鎖所需電池/);
  assert.match(ledger, /訂正錯字電池獎勵/);
  assert.match(ledger, /\/api\/v281\/transcript-settings/);
  assert.match(ledger, /box\.hidden=false/);
  assert.match(ledger, /box\.hidden=true/);
  assert.match(ledger, /html\.replace\('<div class="tools">'/);
});