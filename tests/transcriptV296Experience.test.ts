import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v301 transcript UI keeps the requested visual and fixed layout rules', () => {
  const ui = read('public/transcript-ui-v297.js');
  const index = read('index.html');

  assert.match(index, /transcript-ui-v297\.js\?v=301/);
  assert.match(index, /transcript-battery-settings-v301\.js\?v=302/);
  assert.match(ui, /放大字幕/);
  assert.match(ui, /\[data-v290-expand\][\s\S]*var\(--color-primary/);
  assert.match(ui, /background:rgba\(0,0,0,\.72\)/);
  assert.match(ui, /height:7\.15rem/);
  assert.match(ui, /function fitOverlayLine/);
  assert.match(ui, /function stabilizeDetailLayout/);
  assert.match(ui, /findDetailKeywordBlock/);
  assert.match(ui, /findAudioInfoCard/);
  assert.doesNotMatch(ui, /function anchorTranscriptAbovePlayer/);
  assert.doesNotMatch(ui, /function placeAudioInfoBelowPlayer/);
  assert.doesNotMatch(ui, /paintFloatingOverlay/);
  assert.match(ui, /DISPLAY_END_PUNCTUATION/);
  assert.doesNotMatch(ui, /new Set\([^\n]*['"]？['"]/);
});

test('v301 transcript starts expanded and has a collapse toggle beside enlarge subtitle', () => {
  const ui = read('public/transcript-ui-v297.js');
  assert.match(ui, /data-v301-collapse/);
  assert.match(ui, /expanded \? '▲收起' : '▼展開'/);
  assert.match(ui, /if \(!panel\.dataset\.v301Expanded\) panel\.dataset\.v301Expanded = '1'/);
  assert.match(ui, /expand\.insertAdjacentElement\('afterend', button\)/);
  assert.match(ui, /aria-expanded/);
});

test('v301 pins detail order to transcript, timeline, keywords, then audio info', () => {
  const ui = read('public/transcript-ui-v297.js');
  assert.match(ui, /timeline\.insertAdjacentElement\('beforebegin', panel\)/);
  assert.match(ui, /timeline\.insertAdjacentElement\('afterend', keywordBlock\)/);
  assert.match(ui, /const infoAnchor = keywordBlock \|\| timeline/);
  assert.match(ui, /infoAnchor\.insertAdjacentElement\('afterend', info\)/);
  assert.match(ui, /詳細頁只保留這一個版面排序器/);
});

test('v297 translation icon remains an original contained SVG without overflowing text glyphs', () => {
  const ui = read('public/transcript-ui-v297.js');
  const iconStart = ui.indexOf('const TRANSLATE_ICON');
  const iconEnd = ui.indexOf('const style', iconStart);
  const icon = ui.slice(iconStart, iconEnd);
  assert.match(icon, /viewBox="0 0 30 26"/);
  assert.match(icon, /<rect/);
  assert.match(icon, /<path/);
  assert.doesNotMatch(icon, /<text/);
});

test('v297 subtitle guard preserves logical text and performs fitting synchronously', () => {
  const ui = read('public/transcript-ui-v297.js');
  assert.match(ui, /let logicalValue = initialRaw/);
  assert.match(ui, /get\(\) \{ return logicalValue; \}/);
  assert.match(ui, /nativeTextContent\.set\.call\(this, displaySubtitleText\(logicalValue\)\)/);
  assert.match(ui, /fitOverlayLine\(this, true\)/);
  assert.match(ui, /fitTranscriptLine\(this, true\)/);
  assert.match(ui, /v297FitSignature/);
});

test('v300 backend uses semantic punctuation, Whisper VAD pauses, then a 12-character fallback while preserving correction mapping', () => {
  const gateway = read('worker/transcriptV281Gateway.ts');
  assert.match(gateway, /MAX_SENTENCE_CHARS = 12/);
  assert.match(gateway, /PAUSE_BREAK_SECONDS = 0\.35/);
  assert.match(gateway, /hardBreaks: '。！？!\?；;'/);
  assert.match(gateway, /softBreaks: '，,、：:'/);
  assert.match(gateway, /order:\s*\['semantic-punctuation','whisper-vad-pause-boundary','12-character-fallback'\]/);
  assert.match(gateway, /語意標點優先/);
  assert.match(gateway, /sourcePauseBoundary/);
  assert.match(gateway, /sourceSegmentId/);
  assert.match(gateway, /remapDerivedCorrection/);
  assert.match(gateway, /sentencePolicy/);
});

test('v302 battery settings are mounted inside Other tab with clear browser translation wording', () => {
  const battery = read('public/transcript-battery-settings-v301.js');
  assert.match(battery, /button\[role="tab"\]\[aria-selected="true"\]/);
  assert.match(battery, /includes\('其他'\)/);
  assert.match(battery, /解鎖逐字稿的花費/);
  assert.match(battery, /協助訂正錯字的獎勵/);
  assert.match(battery, /使用逐字稿瀏覽器翻譯的花費/);
  assert.match(battery, /不是 Cloudflare AI 費用/);
  assert.match(battery, /\/api\/v281\/transcript-settings/);
  assert.match(battery, /form\.prepend\(section\)/);
});

test('v302 accepts Echo super-admin session for transcript battery settings on echo host', () => {
  const memberRouter = read('worker/transcriptMemberNotificationsRouter.ts');
  assert.match(memberRouter, /function isEchoSuperAdmin/);
  assert.match(memberRouter, /async function echoTranscriptSettingsApi/);
  assert.match(memberRouter, /請先登入繁星回聲/);
  assert.match(memberRouter, /url\.pathname === '\/api\/v281\/transcript-settings'/);
  assert.match(memberRouter, /url\.hostname\.toLowerCase\(\) !== 'id\.starry\.phd'/);
  assert.match(memberRouter, /unlock_cost_units/);
  assert.match(memberRouter, /correction_reward_units/);
});

test('v296 battery ledger backend still exposes all three transcript game rules', () => {
  const gateway = read('worker/transcriptV281Gateway.ts');
  const injector = read('worker/transcriptLedgerSettingsInjector.ts');
  assert.match(gateway, /translation_cost_units/);
  assert.match(gateway, /translation-use/);
  assert.match(gateway, /transcript_translation_cost/);
  assert.match(injector, /解鎖逐字稿的花費/);
  assert.match(injector, /協助訂正錯字的獎勵/);
  assert.match(injector, /使用逐字稿翻譯功能的花費/);
  assert.match(injector, /translationCost/);
});

test('audio management keeps the four user-facing transcript states', () => {
  const manager = read('src/components/AudioTrackList.tsx');
  assert.match(manager, /正在撰寫逐字稿/);
  assert.match(manager, /已完成逐字稿/);
  assert.match(manager, /逐字稿異常/);
  assert.match(manager, /排隊中逐字稿/);
});
