import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing pattern: ${label}`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`replace failed: ${label}`);
  return next;
}

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');

const oldLuckyAfterSearch = `              </div>\n\n              <button\n                type="button"\n                onClick={event => handleLuckyDraw(event.currentTarget)}\n                disabled={luckyPhase === 'spin'}\n                className="h-[46px] px-3.5 sm:px-4 py-0 rounded-2xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1 shadow-2xs hover:brightness-105 shrink-0 active:scale-95 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-80"\n                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}\n                title="從目前條件下可播放的音檔中抽一張好手氣"\n              >\n                <span>{luckyPhase === 'spin' ? '🫵轉運中' : '🫵好手氣'}</span>\n              </button>\n            </div>`;
app = replaceOnce(app, oldLuckyAfterSearch, `              </div>\n            </div>`, 'remove lucky button from search right side');

const searchRowStart = `            <div className="flex items-center gap-2">\n              <div ref={searchContainerRef} className="relative flex-1">`;
const luckyBeforeSearch = `            <div className="flex items-center gap-2">\n              <button\n                type="button"\n                onClick={event => handleLuckyDraw(event.currentTarget)}\n                disabled={luckyPhase === 'spin'}\n                className="h-[46px] px-3.5 sm:px-4 py-0 rounded-2xl text-white font-black text-xs sm:text-sm flex items-center justify-center gap-1 shadow-2xs hover:brightness-105 shrink-0 active:scale-95 transition-all cursor-pointer disabled:cursor-wait disabled:opacity-80"\n                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}\n                title="從目前條件下可播放的音檔中抽一張好手氣"\n              >\n                <span>{luckyPhase === 'spin' ? '🫵轉運中' : '🫵好手氣'}</span>\n              </button>\n\n              <div ref={searchContainerRef} className="relative flex-1">`;
app = replaceOnce(app, searchRowStart, luckyBeforeSearch, 'move lucky button before search field');

app = replaceOnce(
  app,
  '<span className="font-bold">網友關鍵字(可複選多個)</span>',
  '<span className="font-bold">網友關鍵字<span className="ml-0.5 text-[9px] font-semibold">(可複選多個)</span></span>',
  'home keyword small parenthetical'
);
fs.writeFileSync(appPath, app);

const detailPath = 'src/components/DetailView.tsx';
let detail = fs.readFileSync(detailPath, 'utf8');
detail = replaceOnce(
  detail,
  '<span className="font-bold">網友關鍵字(登入可自訂新增)</span>',
  '<span className="font-bold">網友關鍵字<span className="ml-0.5 text-[9px] font-semibold">{currentUser ? \'(可自訂新增)\' : \'(登入可自訂新增)\'}</span></span>',
  'detail keyword login-aware small parenthetical'
);
fs.writeFileSync(detailPath, detail);

const homeKeywordTestPath = 'tests/homeKeywordCounts.test.ts';
let homeKeywordTest = fs.readFileSync(homeKeywordTestPath, 'utf8');
homeKeywordTest = homeKeywordTest.replaceAll(
  '  assert.match(app, /網友關鍵字\\(可複選多個\\)/);',
  '  assert.match(app, /網友關鍵字/);\n  assert.match(app, /\\(可複選多個\\)/);\n  assert.match(app, /text-\\[9px\\]/);'
);
fs.writeFileSync(homeKeywordTestPath, homeKeywordTest);

const luckyTestPath = 'tests/homeLuckyDrawUi.test.ts';
let luckyTest = fs.readFileSync(luckyTestPath, 'utf8');
luckyTest = replaceOnce(
  luckyTest,
  `test('home keyword expand and collapse control is integrated into the heading', () => {`,
  `test('lucky draw sits to the left of the search field', () => {\n  const luckyIndex = app.indexOf('title="從目前條件下可播放的音檔中抽一張好手氣"');\n  const searchIndex = app.indexOf('ref={searchContainerRef}');\n  assert.ok(luckyIndex >= 0 && searchIndex >= 0 && luckyIndex < searchIndex);\n});\n\ntest('home keyword expand and collapse control is integrated into the heading', () => {`,
  'lucky before search test'
);
luckyTest = replaceOnce(
  luckyTest,
  '  assert.match(app, /網友關鍵字\\(可複選多個\\)/);',
  '  assert.match(app, /網友關鍵字/);\n  assert.match(app, /\\(可複選多個\\)/);',
  'home lucky keyword split label test'
);
fs.writeFileSync(luckyTestPath, luckyTest);

const uiTestPath = 'tests/keywordHeaderDetailLayout.test.ts';
let uiTest = fs.readFileSync(uiTestPath, 'utf8');
uiTest = replaceOnce(
  uiTest,
  '  assert.match(app, /網友關鍵字\\(可複選多個\\)/);',
  '  assert.match(app, /網友關鍵字/);\n  assert.match(app, /\\(可複選多個\\)/);\n  assert.match(app, /text-\\[9px\\]/);',
  'home split parenthetical test'
);
uiTest = replaceOnce(
  uiTest,
  '  assert.match(detail, /網友關鍵字\\(登入可自訂新增\\)/);',
  '  assert.match(detail, /網友關鍵字/);\n  assert.match(detail, /currentUser \\? \'\\(可自訂新增\\)\' : \'\\(登入可自訂新增\\)\'/);\n  assert.match(detail, /text-\\[9px\\]/);',
  'detail login-aware parenthetical test'
);
fs.writeFileSync(uiTestPath, uiTest);

const changelogPath = 'src/changelogReleaseNotes.ts';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const anchor = `    '網友關鍵字與詳細播放頁再壓縮：首頁與詳細頁的標題列改成「按此 ▼展開」，展開後自動變成「▲收起」；首頁移除展開區右側 X。詳細頁收起時縮短關鍵字外框並更靠近頁首，評價／心得／按讚移除底部圓角襯框，長音檔標題的多行行距也同步收緊。',`;
changelog = replaceOnce(
  changelog,
  anchor,
  `${anchor}\n    '網友關鍵字提示再精簡：詳細播放頁未登入時維持「(登入可自訂新增)」，登入會員後自動縮成「(可自訂新增)」；首頁與詳細頁括號提示字再縮小。首頁「🫵好手氣」移到搜尋框左邊，搜尋框改到右側。',`,
  'changelog v97 keyword and search order'
);
fs.writeFileSync(changelogPath, changelog);

const swPath = 'public/sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceOnce(sw, "const CACHE_NAME = 'echostars-shell-v96';", "const CACHE_NAME = 'echostars-shell-v97';", 'pwa v97');
fs.writeFileSync(swPath, sw);

const releasePath = 'tests/releaseIntegrity.test.ts';
let release = fs.readFileSync(releasePath, 'utf8');
release = replaceOnce(release, "test('v96 is the single current PWA cache version', () => {", "test('v97 is the single current PWA cache version', () => {", 'release test v97');
release = replaceOnce(release, "assert.match(sw, /const CACHE_NAME = 'echostars-shell-v96'/);", "assert.match(sw, /const CACHE_NAME = 'echostars-shell-v97'/);", 'release cache v97');
fs.writeFileSync(releasePath, release);

console.log('keyword login label/search order v97 patch applied');
