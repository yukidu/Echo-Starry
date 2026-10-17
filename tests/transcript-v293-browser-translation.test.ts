import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('public/transcript-ui-v293.js', 'utf8');
const client = readFileSync('public/transcript-client-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const gateway = readFileSync('worker/transcriptV281Gateway.ts', 'utf8');
const scheduler = readFileSync('worker/transcriptSequentialSchedulerV293.ts', 'utf8');
const bulkScheduler = readFileSync('worker/transcriptBulkScheduler.ts', 'utf8');
const audioManagement = readFileSync('src/v161AudioManagementNavigation.tsx', 'utf8');
const entry = readFileSync('worker/starryMainInlineLoginRouter.ts', 'utf8');
const wrangler = readFileSync('wrangler.toml', 'utf8');
const workflow = readFileSync('worker/transcriptWorkflowV282.ts', 'utf8');

test('v294 loads one consolidated transcript client and one UI layer', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.match(html, /transcript-client-v290\.js\?v=293[\s\S]*transcript-ui-v293\.js\?v=294/);
  assert.doesNotMatch(html, /transcript-ui-v292|transcript-presentation-v28[4589]|transcript-client\.js/);
});

test('v294 hides only selected sentence-ending punctuation while preserving question marks', () => {
  assert.match(ui, /DISPLAY_END_PUNCTUATION = new Set\(\['、','，','！','。',',','!','\.'\]\)/);
  assert.match(ui, /function displaySubtitleText/);
  assert.match(ui, /DISPLAY_END_PUNCTUATION\.has\(last\) \? parts\.slice\(0, -1\)\.join\(''\) : raw/);
  assert.doesNotMatch(ui, /DISPLAY_END_PUNCTUATION = new Set\([^\n]*[？?]/);
  assert.match(ui, /guardSubtitleDisplay\(line\)/);
  assert.match(ui, /guardSubtitleDisplay\(overlayLine\)/);
});

test('v294 enlarged transcript uses darker fixed two-line box and auto-shrinks to fit', () => {
  assert.match(ui, /background:rgba\(0,0,0,\.48\)!important/);
  assert.match(ui, /height:8\.8rem!important;min-height:8\.8rem!important;max-height:8\.8rem!important/);
  assert.match(ui, /function fitOverlayLine/);
  assert.match(ui, /line\.scrollHeight > availableHeight \+ 1 \|\| line\.scrollWidth > availableWidth \+ 1/);
  assert.match(ui, /const maxPx = window\.innerWidth <= 420 \? 42 : 56/);
});

test('v294 audio management list exposes four transcript progress labels without opening edit mode', () => {
  assert.match(audioManagement, /\/api\/v281\/transcripts\/bulk-status/);
  assert.match(audioManagement, /正在撰寫逐字稿/);
  assert.match(audioManagement, /已完成逐字稿/);
  assert.match(audioManagement, /逐字稿異常/);
  assert.match(audioManagement, /排隊中逐字稿/);
  assert.match(audioManagement, /v161-transcript-status/);
  assert.match(bulkScheduler, /COALESCE\(i\.status,'pending'\) AS status/);
  assert.match(bulkScheduler, /trackId: text\(item\.trackId\)/);
  assert.match(bulkScheduler, /items/);
});

test('v293 allows browser page translation instead of blocking it', () => {
  assert.doesNotMatch(html, /translate="no"/);
  assert.doesNotMatch(html, /name="google"\s+content="notranslate"/);
  assert.match(ui, /Browser Translate/);
  assert.match(ui, /Chrome.*翻譯/);
  assert.match(ui, /Safari.*翻譯網站/);
});

test('v293 browser translation prompt treats selected language labels as text only', () => {
  assert.match(ui, /instruction\.textContent = String\(value \|\| ''\)/);
  assert.doesNotMatch(ui, /instruction\.innerHTML/);
  assert.doesNotMatch(ui, /innerHTML\s*=\s*browserInstruction/);
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

test('v294 keeps centered tools original translation icon and normal two-line auto fit', () => {
  assert.match(ui, /\.v290-title\{display:none!important\}/);
  assert.match(ui, /\.v290-tools\{margin-left:0!important;width:100%!important;justify-content:center!important/);
  assert.match(ui, /class="v293-translate-icon"/);
  assert.match(ui, /height:4\.65rem!important/);
  assert.match(ui, /function fitTranscriptLine/);
  assert.match(ui, /while \(size > minPx && line\.scrollHeight > availableHeight \+ 1\)/);
});

test('latest main keeps the sequential scheduler code but does not register a production cron trigger', () => {
  assert.match(scheduler, /status IN \('queued','processing'\)/);
  assert.match(scheduler, /LIMIT 1/);
  assert.match(scheduler, /instances:\s*\[\{ id: instanceId, params: \{ trackId: row\.id \} \}\]/);
  assert.match(entry, /queueNextTranscriptV293/);
  assert.match(entry, /ctx\.waitUntil\(queueNextTranscriptV293\(env as any\)\)/);
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.doesNotMatch(wrangler, /\[triggers\]/);
  assert.doesNotMatch(wrangler, /crons\s*=/);
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
