import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing pattern: ${label}`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`replace failed: ${label}`);
  return next;
}

const appPath = 'src/App.tsx';
let app = fs.readFileSync(appPath, 'utf8');
app = replaceOnce(
  app,
`                <span className="text-sm font-bold text-amber-700 dark:text-amber-300">\n                  網友關鍵字(可複選多個)\n                </span>`,
`                <button\n                  type="button"\n                  onClick={() => setShowKeywordsDrawer(prev => !prev)}\n                  className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-left text-sm text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors cursor-pointer"\n                  aria-expanded={showKeywordsDrawer}\n                >\n                  <span className="font-semibold">按此</span>\n                  <span className="font-black">{showKeywordsDrawer ? '▲收起' : '▼展開'}</span>\n                  <span className="font-bold">網友關鍵字(可複選多個)</span>\n                </button>`,
  'home keyword heading'
);
app = replaceOnce(
  app,
`\n                  <button\n                    type="button"\n                    onClick={() => setShowKeywordsDrawer(prev => !prev)}\n                    className="inline-flex items-center justify-end gap-1 text-sm font-bold text-slate-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors cursor-pointer text-right whitespace-nowrap"\n                  >\n                    <span>{showKeywordsDrawer ? '▲ 收起' : '▼ 展開'}</span>\n                  </button>`,
  '',
  'remove old home keyword toggle'
);
app = replaceOnce(
  app,
`                  <button\n                    type="button"\n                    onClick={() => setShowKeywordsDrawer(false)}\n                    className="absolute top-1 right-1 z-10 w-11 h-11 rounded-full flex items-center justify-center hover:brightness-110 text-4xl font-black leading-none shadow-md border-2 cursor-pointer transition-all"\n                    style={{ backgroundColor: 'var(--color-light-pill, #ffffff)', color: 'var(--color-primary, #c06c84)', borderColor: 'var(--color-primary, #c06c84)' }}\n                    aria-label="收起網友關鍵字"\n                  >\n                    ✕\n                  </button>\n                  <div className="flex flex-wrap gap-0.5 max-h-40 overflow-y-auto pr-5">`,
`                  <div className="flex flex-wrap gap-0.5 max-h-40 overflow-y-auto">`,
  'remove home keyword drawer x'
);
fs.writeFileSync(appPath, app);

const detailPath = 'src/components/DetailView.tsx';
let detail = fs.readFileSync(detailPath, 'utf8');
detail = replaceOnce(
  detail,
  '<div className="max-w-2xl mx-auto px-3.5 py-3 sm:px-6 space-y-3 pb-28 leading-snug">',
  '<div className="max-w-2xl mx-auto px-3.5 pt-1.5 sm:px-6 sm:pt-2 space-y-2.5 pb-28 leading-snug">',
  'detail top spacing'
);
detail = replaceOnce(
  detail,
  '<div className="relative rounded-2xl p-3 sm:p-4 bg-white/80 dark:bg-slate-900/80 border border-amber-200/70 dark:border-slate-800 shadow-2xs backdrop-blur-xs">',
  "<div className={`relative rounded-2xl ${showDetailKeywords ? 'p-3 sm:p-4' : 'px-3 py-1.5 sm:px-4 sm:py-2'} bg-white/80 dark:bg-slate-900/80 border border-amber-200/70 dark:border-slate-800 shadow-2xs backdrop-blur-xs`}>",
  'detail keyword collapsed padding'
);
detail = replaceOnce(
  detail,
`        <div className="mb-2 space-y-1.5">\n          <div className="grid grid-cols-[1fr_auto] items-center gap-2">\n            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-bold text-sm text-amber-700 dark:text-amber-300">\n              <span>網友關鍵字</span>\n              <span className="text-xs text-slate-400 font-normal">({trackKeywords.length}/50 組)</span>\n            </div>\n            <button\n              type="button"\n              onClick={() => setShowDetailKeywords(prev => !prev)}\n              className="w-[4.75rem] justify-self-end text-left text-sm font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer whitespace-nowrap"\n            >\n              {showDetailKeywords ? '▲ 收起' : '▼ 展開'}\n            </button>\n          </div>`,
`        <div className={showDetailKeywords ? 'mb-2 space-y-1.5' : 'mb-0'}>\n          <div className="flex items-center justify-between gap-2">\n            <button\n              type="button"\n              onClick={() => setShowDetailKeywords(prev => !prev)}\n              className="inline-flex min-w-0 flex-wrap items-center gap-x-1 text-left text-sm text-amber-700 dark:text-amber-300 hover:text-amber-800 dark:hover:text-amber-200 transition-colors cursor-pointer"\n              aria-expanded={showDetailKeywords}\n            >\n              <span className="font-semibold">按此</span>\n              <span className="font-black">{showDetailKeywords ? '▲收起' : '▼展開'}</span>\n              <span className="font-bold">網友關鍵字(登入可自訂新增)</span>\n            </button>\n          </div>`,
  'detail keyword heading'
);
detail = replaceOnce(
  detail,
  'className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-snug mb-1 max-w-lg"',
  'className="text-xl sm:text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight leading-[1.02] mb-1 max-w-lg"',
  'detail title line height'
);
detail = replaceOnce(
  detail,
  'className="flex items-center justify-center gap-1.5 sm:gap-2.5 text-xs text-slate-600 dark:text-slate-400 bg-white/85 dark:bg-slate-800/80 py-1 sm:py-1.5 px-2.5 sm:px-3 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-2xs select-none"',
  'className="flex items-center justify-center gap-1.5 sm:gap-2.5 text-xs text-slate-600 dark:text-slate-400 py-0.5 select-none"',
  'detail reaction frame removal'
);
fs.writeFileSync(detailPath, detail);

const cardPath = 'src/components/AudioCard.tsx';
let card = fs.readFileSync(cardPath, 'utf8');
card = replaceOnce(
  card,
  'className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-tight break-words line-clamp-3 group-hover:text-[var(--color-primary,#c06c84)] dark:group-hover:text-rose-400 transition-colors"',
  'className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 leading-[1.02] break-words line-clamp-3 group-hover:text-[var(--color-primary,#c06c84)] dark:group-hover:text-rose-400 transition-colors"',
  'home card title line height'
);
fs.writeFileSync(cardPath, card);

const changelogPath = 'src/changelogReleaseNotes.ts';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const changelogAnchor = `    '上傳／編輯音檔的 R2 封面圖庫修復：點選既有封面不再因畫面腳本與 React 同時改動而白屏；「同步 R2」會強制重新讀取雲端封面清單並更新本機暫存，R2 已刪除的照片也會從清單移除。',`;
changelog = replaceOnce(
  changelog,
  changelogAnchor,
  `${changelogAnchor}\n    '網友關鍵字與詳細播放頁再壓縮：首頁與詳細頁的標題列改成「按此 ▼展開」，展開後自動變成「▲收起」；首頁移除展開區右側 X。詳細頁收起時縮短關鍵字外框並更靠近頁首，評價／心得／按讚移除底部圓角襯框，長音檔標題的多行行距也同步收緊。',`,
  'changelog keyword detail ui'
);
fs.writeFileSync(changelogPath, changelog);

const swPath = 'public/sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceOnce(sw, "const CACHE_NAME = 'echostars-shell-v95';", "const CACHE_NAME = 'echostars-shell-v96';", 'pwa v96');
fs.writeFileSync(swPath, sw);

const releasePath = 'tests/releaseIntegrity.test.ts';
let release = fs.readFileSync(releasePath, 'utf8');
release = replaceOnce(release, "test('v95 is the single current PWA cache version', () => {", "test('v96 is the single current PWA cache version', () => {", 'release test name v96');
release = replaceOnce(release, "assert.match(sw, /const CACHE_NAME = 'echostars-shell-v95'/);", "assert.match(sw, /const CACHE_NAME = 'echostars-shell-v96'/);", 'release cache assertion v96');
fs.writeFileSync(releasePath, release);

const uiTestPath = 'tests/keywordHeaderDetailLayout.test.ts';
fs.writeFileSync(uiTestPath, `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nconst app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');\nconst detail = readFileSync(new URL('../src/components/DetailView.tsx', import.meta.url), 'utf8');\nconst card = readFileSync(new URL('../src/components/AudioCard.tsx', import.meta.url), 'utf8');\n\ntest('home keyword heading owns expand and collapse state without drawer X', () => {\n  assert.match(app, /按此<\\/span>[\\s\\S]{0,180}showKeywordsDrawer \\? '▲收起' : '▼展開'/);\n  assert.match(app, /網友關鍵字\\(可複選多個\\)/);\n  assert.doesNotMatch(app, /aria-label=\\"收起網友關鍵字\\"/);\n});\n\ntest('detail keyword heading is compact, count-free and login-aware', () => {\n  assert.match(detail, /showDetailKeywords \\? 'p-3 sm:p-4' : 'px-3 py-1\\.5 sm:px-4 sm:py-2'/);\n  assert.match(detail, /showDetailKeywords \\? '▲收起' : '▼展開'/);\n  assert.match(detail, /網友關鍵字\\(登入可自訂新增\\)/);\n  assert.doesNotMatch(detail, /\\{trackKeywords\\.length\\}\\/50 組/);\n});\n\ntest('detail reaction strip has no decorative rounded backing frame', () => {\n  assert.doesNotMatch(detail, /bg-white\\/85 dark:bg-slate-800\\/80 py-1 sm:py-1\\.5 px-2\\.5 sm:px-3 rounded-2xl border border-slate-200\\/60/);\n  assert.match(detail, /text-slate-600 dark:text-slate-400 py-0\\.5 select-none/);\n});\n\ntest('long titles use very tight multiline leading on home and detail', () => {\n  assert.match(detail, /tracking-tight leading-\\[1\\.02\\]/);\n  assert.match(card, /font-black text-slate-900 dark:text-slate-100 leading-\\[1\\.02\\]/);\n});\n`);

if (fs.existsSync('package-lock.json')) fs.rmSync('package-lock.json');

console.log('keyword/detail layout v96 patch applied');
