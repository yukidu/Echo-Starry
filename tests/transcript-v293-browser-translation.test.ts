import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('public/transcript-ui-v293.js', 'utf8');
const client = readFileSync('public/transcript-client-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const gateway = readFileSync('worker/transcriptV281Gateway.ts', 'utf8');
const scheduler = readFileSync('worker/transcriptSequentialSchedulerV293.ts', 'utf8');
const entry = readFileSync('worker/starryMainV293Router.ts', 'utf8');
const wrangler = readFileSync('wrangler.toml', 'utf8');
const workflow = readFileSync('worker/transcriptWorkflowV282.ts', 'utf8');

test('v293 loads one consolidated transcript client and one UI layer', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.match(html, /transcript-client-v290\.js\?v=293[\s\S]*transcript-ui-v293\.js\?v=293/);
  assert.doesNotMatch(html, /transcript-ui-v292|transcript-presentation-v28[4589]|transcript-client\.js/);
});

test('v293 allows browser page translation instead of blocking it', () => {
  assert.doesNotMatch(html, /translate="no"/);
  assert.doesNotMatch(html, /name="google"\s+content="notranslate"/);
  assert.match(ui, /Browser Translate/);
  assert.match(ui, /Chrome.*翻譯/);
  assert.match(ui, /Safari.*翻譯網站/);
});

test('v293 disables paid foreign-language Cloudflare AI translation', () => {
  assert.doesNotMatch(gateway, /handleTranscriptTranslationV285/);
  assert.match(gateway, /aiTranslationDisabled:\s*true/);
  assert.match(gateway, /外語 AI 翻譯目前已停用/);
  assert.match(ui, /stopImmediatePropagation/);
  assert.doesNotMatch(ui, /\/api\/v281\/transcripts\/.*translate/);
});

test('v293 permanently orders transcript then player then keywords', () => {
  assert.match(ui, /root\.insertBefore\(timeline, panel\.nextSibling\)/);
  assert.match(ui, /root\.insertBefore\(keyword, timeline\.nextSibling\)/);
  assert.match(ui, /永久順序：逐字稿 → 播放器 → 網友關鍵字/);
});

test('v293 keeps centered tools original translation icon and two-line auto fit', () => {
  assert.match(ui, /\.v290-title\{display:none!important\}/);
  assert.match(ui, /\.v290-tools\{margin-left:0!important;width:100%!important;justify-content:center!important/);
  assert.match(ui, /class="v293-translate-icon"/);
  assert.match(ui, /height:4\.65rem!important/);
  assert.match(ui, /function fitTranscriptLine/);
  assert.match(ui, /while \(size > minPx && line\.scrollHeight > availableHeight \+ 1\)/);
});

test('v293 transcript scheduler runs only one workflow at a time every 15 minutes', () => {
  assert.match(scheduler, /status IN \('queued','processing'\)/);
  assert.match(scheduler, /LIMIT 1/);
  assert.match(scheduler, /instances:\s*\[\{ id: instanceId, params: \{ trackId: row\.id \} \}\]/);
  assert.match(entry, /queueNextTranscriptV293/);
  assert.match(wrangler, /main = "worker\/starryMainV293Router\.ts"/);
  assert.match(wrangler, /crons = \["\*\/15 \* \* \* \*"\]/);
});

test('Chinese transcription still normalizes Chinese to Traditional Chinese before R2 storage', () => {
  assert.match(workflow, /@cf\/openai\/whisper-large-v3-turbo/);
  assert.match(workflow, /TRADITIONAL_MODEL/);
  assert.match(workflow, /likelyChineseTranscript/);
  assert.match(workflow, /if \(isChinese\) await traditionalizeSegments/);
  assert.match(workflow, /zh-Hant-TW/);
});

test('v290 playback isolation remains intact', () => {
  assert.match(client, /clearTranscriptForTrack/);
  assert.match(client, /generation!==state\.generation\|\|trackId!==state\.trackId/);
  assert.match(client, /Promise\.race/);
  assert.match(client, /15000/);
});
