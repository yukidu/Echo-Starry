import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync('public/transcript-ui-v297.js', 'utf8');
const client = readFileSync('public/transcript-client-v290.js', 'utf8');
const html = readFileSync('index.html', 'utf8');
const gateway = readFileSync('worker/transcriptV281Gateway.ts', 'utf8');
const scheduler = readFileSync('worker/transcriptSequentialSchedulerV293.ts', 'utf8');
const bulkScheduler = readFileSync('worker/transcriptBulkScheduler.ts', 'utf8');
const audioManagement = readFileSync('src/v161AudioManagementNavigation.tsx', 'utf8');
const entry = readFileSync('worker/starryMainInlineLoginRouter.ts', 'utf8');
const wrangler = readFileSync('wrangler.toml', 'utf8');
const workflow = readFileSync('worker/transcriptWorkflowV282.ts', 'utf8');
const batteryUi = readFileSync('public/transcript-battery-settings-v301.js', 'utf8');
const memberRouter = readFileSync('worker/transcriptMemberNotificationsRouter.ts', 'utf8');

test('v302 loads one consolidated transcript client, stable UI layer and refreshed battery settings', () => {
  assert.doesNotThrow(() => new Function(ui));
  assert.doesNotThrow(() => new Function(batteryUi));
  assert.match(html, /transcript-client-v290\.js\?v=293[\s\S]*transcript-ui-v297\.js\?v=301[\s\S]*transcript-battery-settings-v301\.js\?v=302/);
  assert.doesNotMatch(html, /transcript-ui-v293\.js\?v=296|transcript-ui-v292|transcript-presentation-v28[4589]|transcript-client\.js/);
});

test('v301 hides only selected sentence-ending punctuation while preserving question marks', () => {
  assert.match(ui, /DISPLAY_END_PUNCTUATION = new Set\(\['、','，','！','。',',','!','\.'\]\)/);
  assert.match(ui, /function displaySubtitleText/);
  assert.match(ui, /DISPLAY_END_PUNCTUATION\.has\(last\) \? parts\.slice\(0, -1\)\.join\(''\) : raw/);
  assert.doesNotMatch(ui, /DISPLAY_END_PUNCTUATION = new Set\([^\n]*[？?]/);
  assert.match(ui, /guardSubtitleDisplay\(line\)/);
  assert.match(ui, /guardSubtitleDisplay\(overlayLine\)/);
});

test('v301 enlarged transcript uses darker fixed two-line box and auto-shrinks to fit', () => {
  assert.match(ui, /background:rgba\(0,0,0,\.72\)!important/);
  assert.match(ui, /height:7\.15rem!important;min-height:7\.15rem!important;max-height:7\.15rem!important/);
  assert.match(ui, /function fitOverlayLine/);
  assert.match(ui, /line\.scrollHeight > availableHeight \+ 1 \|\| line\.scrollWidth > availableWidth \+ 1/);
  assert.match(ui, /const maxPx = window\.innerWidth <= 420 \? 43 : 57/);
});

test('v301 prevents enlarged subtitle flicker by keeping one writer and fitting on text assignment', () => {
  assert.match(ui, /let logicalValue = initialRaw/);
  assert.match(ui, /get\(\) \{ return logicalValue; \}/);
  assert.match(ui, /fitOverlayLine\(this, true\)/);
  assert.match(ui, /fitTranscriptLine\(this, true\)/);
  assert.match(ui, /v297FitSignature/);
  assert.doesNotMatch(ui, /paintFloatingOverlay/);
  assert.doesNotMatch(ui, /window\.setInterval\(\(\) => \{ void paintFloatingOverlay\(\); \}, 150\)/);
  assert.match(client, /state\.paintTimer=setInterval\(\(\)=>paint\(false\),160\)/);
});

test('v301 provides default-expanded transcript collapse control beside enlarge subtitle', () => {
  assert.match(ui, /data-v301-collapse/);
  assert.match(ui, /expanded \? '▲收起' : '▼展開'/);
  assert.match(ui, /panel\.dataset\.v301Expanded = '1'/);
  assert.match(ui, /expand\.insertAdjacentElement\('afterend', button\)/);
  assert.match(ui, /setTranscriptExpanded/);
  assert.match(ui, /\[data-v290-body\]/);
});

test('v301 has exactly one detail layout policy: transcript, player, keywords, audio info', () => {
  assert.match(ui, /function stabilizeDetailLayout/);
  assert.match(ui, /timeline\.insertAdjacentElement\('beforebegin', panel\)/);
  assert.match(ui, /timeline\.insertAdjacentElement\('afterend', keywordBlock\)/);
  assert.match(ui, /const infoAnchor = keywordBlock \|\| timeline/);
  assert.match(ui, /infoAnchor\.insertAdjacentElement\('afterend', info\)/);
  assert.doesNotMatch(ui, /function anchorTranscriptAbovePlayer/);
  assert.doesNotMatch(ui, /function placeAudioInfoBelowPlayer/);
  assert.doesNotMatch(ui, /function moveKeywordsAboveReferences/);
  assert.doesNotMatch(ui, /function findRoundedBlockByText/);
});

test('v302 mounts transcript battery rules inside My Battery Book Other tab with browser translation wording', () => {
  assert.match(batteryUi, /button\[role="tab"\]\[aria-selected="true"\]/);
  assert.match(batteryUi, /includes\('其他'\)/);
  assert.match(batteryUi, /form\.prepend\(section\)/);
  assert.match(batteryUi, /解鎖逐字稿的花費/);
  assert.match(batteryUi, /協助訂正錯字的獎勵/);
  assert.match(batteryUi, /使用逐字稿瀏覽器翻譯的花費/);
  assert.match(batteryUi, /不是 Cloudflare AI 費用/);
  assert.match(batteryUi, /\/api\/v281\/transcript-settings/);
});

test('v302 Echo-host transcript settings use the already logged-in Echo super-admin session', () => {
  assert.match(memberRouter, /async function echoTranscriptSettingsApi/);
  assert.match(memberRouter, /const actor = await verifiedActor\(request, env\)/);
  assert.match(memberRouter, /isEchoSuperAdmin\(actor\)/);
  assert.match(memberRouter, /請先登入繁星回聲/);
  assert.match(memberRouter, /url\.hostname\.toLowerCase\(\) !== 'id\.starry\.phd'/);
  assert.match(memberRouter, /unlock_cost_units/);
  assert.match(memberRouter, /correction_reward_units/);
});

test('audio management list exposes four transcript progress labels without opening edit mode', () => {
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

test('v301 automatically uses the browser Translator API for the whole page when supported', () => {
  assert.doesNotMatch(html, /translate="no"/);
  assert.doesNotMatch(html, /name="google"\s+content="notranslate"/);
  assert.match(ui, /globalThis\.Translator/);
  assert.match(ui, /TranslatorApi\.availability/);
  assert.match(ui, /TranslatorApi\.create/);
  assert.match(ui, /translator\.translate\(raw\)/);
  assert.match(ui, /collectTextNodes\(document\.body\)/);
  assert.match(ui, /watchDynamicTranslation/);
  assert.match(ui, /瀏覽器整頁翻譯/);
});

test('v301 falls back to browser full-page translation UI when direct launch is unavailable', () => {
  assert.match(ui, /Safari 網址列的「頁面選單／aA」→「翻譯網站」/);
  assert.match(ui, /這台瀏覽器目前不允許網站直接按下內建翻譯/);
  assert.match(ui, /瀏覽器選單「翻譯」/);
  assert.match(ui, /if \(!automatic\)/);
  assert.match(ui, /browserInstruction\(label\)/);
});

test('browser translation prompt treats selected language labels as text only', () => {
  assert.match(ui, /instruction\.textContent = String\(value \|\| ''\)/);
  assert.doesNotMatch(ui, /instruction\.innerHTML/);
  assert.doesNotMatch(ui, /innerHTML\s*=\s*browserInstruction/);
});

test('paid foreign-language Cloudflare AI translation remains disabled', () => {
  assert.doesNotMatch(gateway, /handleTranscriptTranslationV285/);
  assert.match(gateway, /aiTranslationDisabled:\s*true/);
  assert.match(gateway, /外語 AI 翻譯目前已停用/);
  assert.match(ui, /stopImmediatePropagation/);
  assert.doesNotMatch(ui, /\/api\/v281\/transcripts\/.*translate/);
});

test('v301 keeps centered tools original translation icon and normal two-line auto fit', () => {
  assert.match(ui, /\.v290-title\{display:none!important\}/);
  assert.match(ui, /\.v290-tools\{margin-left:0!important;width:100%!important;justify-content:center!important/);
  assert.match(ui, /class="v297-translate-icon"/);
  assert.match(ui, /height:4\.65rem!important/);
  assert.match(ui, /function fitTranscriptLine/);
  assert.match(ui, /while \(size > minPx && line\.scrollHeight > availableHeight \+ 1\)/);
});

test('v299 production transcript scheduler keeps five-way concurrency with a 15-minute watchdog', () => {
  assert.match(scheduler, /MAX_CONCURRENT_TRANSCRIPTS\s*=\s*5/);
  assert.match(scheduler, /status IN \('queued','processing'\)/);
  assert.match(scheduler, /LIMIT \(SELECT MAX\(0, \? - COUNT\(\*\)\) FROM transcript_index WHERE status IN \('queued','processing'\)\)/);
  assert.match(scheduler, /instances:\s*\[\{ id: instanceId, params: \{ trackId \} \}\]/);
  assert.match(entry, /queueNextTranscriptV293/);
  assert.match(entry, /ctx\.waitUntil\(queueNextTranscriptV293\(env as any\)\)/);
  assert.match(wrangler, /main = "worker\/starryMainInlineLoginRouter\.ts"/);
  assert.match(wrangler, /\[triggers\]/);
  assert.match(wrangler, /crons\s*=\s*\["\*\/15 \* \* \* \*"\]/);
  assert.match(wrangler, /只用於產生繁體中文逐字稿，不做外語翻譯/);
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
