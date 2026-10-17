import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('v297 transcript UI keeps the requested visual and fixed layout rules', () => {
  const ui = read('public/transcript-ui-v297.js');
  const index = read('index.html');

  assert.match(index, /transcript-ui-v297\.js\?v=297/);
  assert.match(ui, /放大字幕/);
  assert.match(ui, /\[data-v290-expand\][\s\S]*var\(--color-primary/);
  assert.match(ui, /background:rgba\(0,0,0,\.72\)/);
  assert.match(ui, /height:7\.15rem/);
  assert.match(ui, /function fitOverlayLine/);
  assert.match(ui, /anchorTranscriptAbovePlayer/);
  assert.match(ui, /function placeAudioInfoBelowPlayer/);
  assert.match(ui, /timeline\.insertAdjacentElement\('afterend', info\)/);
  assert.doesNotMatch(ui, /moveKeywordsAboveReferences/);
  assert.doesNotMatch(ui, /paintFloatingOverlay/);
  assert.match(ui, /DISPLAY_END_PUNCTUATION/);
  assert.doesNotMatch(ui, /new Set\([^\n]*['"]？['"]/);
});

test('v297 translation icon is an original contained SVG without overflowing text glyphs', () => {
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

test('v296 backend enforces sentence-sized transcript responses and preserves correction mapping', () => {
  const gateway = read('worker/transcriptV281Gateway.ts');
  assert.match(gateway, /MAX_SENTENCE_CHARS = 28/);
  assert.match(gateway, /hardBreaks: '。！？!\?；;'/);
  assert.match(gateway, /softBreaks: '，,、'/);
  assert.match(gateway, /長句沒有標點時仍會依長度切句/);
  assert.match(gateway, /sourceSegmentId/);
  assert.match(gateway, /remapDerivedCorrection/);
  assert.match(gateway, /sentencePolicy/);
});

test('v296 battery ledger exposes all three transcript game rules', () => {
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
  const manager = read('src/v161AudioManagementNavigation.tsx');
  assert.match(manager, /正在撰寫逐字稿/);
  assert.match(manager, /已完成逐字稿/);
  assert.match(manager, /逐字稿異常/);
  assert.match(manager, /排隊中逐字稿/);
});