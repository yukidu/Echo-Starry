import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing pattern: ${label}`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`replace failed: ${label}`);
  return next;
}

function replaceAfterAnchor(source, anchor, from, to, label) {
  const anchorIndex = source.indexOf(anchor);
  if (anchorIndex < 0) throw new Error(`missing anchor: ${label}`);
  const before = source.slice(0, anchorIndex);
  const tail = source.slice(anchorIndex);
  if (!tail.includes(from)) throw new Error(`missing pattern after anchor: ${label}`);
  return before + tail.replace(from, to);
}

const uploadPath = 'src/components/UploadModal.tsx';
let upload = fs.readFileSync(uploadPath, 'utf8');
const coverAnchor = '          {/* 2. Cover Photo Area */}';
upload = replaceAfterAnchor(upload, coverAnchor,
  '<div className="space-y-2">',
  '<div className="space-y-2" data-upload-cover-section="1">',
  'cover section marker');
upload = replaceAfterAnchor(upload, coverAnchor,
  '<label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">',
  '<label data-upload-cover-label="1" className="block font-bold text-slate-700 dark:text-slate-300 mb-1">',
  'cover label marker');
upload = replaceAfterAnchor(upload, coverAnchor,
  '<div className="flex items-center gap-3">',
  '<div className="flex items-center gap-3" data-upload-cover-selected="1">',
  'cover selected marker');
upload = replaceAfterAnchor(upload, coverAnchor,
  '<div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">',
  '<div data-upload-cover-library="1" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">',
  'cover library marker');
fs.writeFileSync(uploadPath, upload);

const policyPath = 'src/uploadModalPresentationPolicy.ts';
let policy = fs.readFileSync(policyPath, 'utf8');
policy = replaceOnce(policy,
`  form.querySelectorAll<HTMLElement>('[data-upload-cover-library="1"] span').forEach(span => {\n    if (span.closest('button')) return;\n    const text = normalizeText(span.textContent);\n    const count = text.match(/(\\d+)\\s*張/);\n    if (count && text.includes('點照片可快速套用')) span.textContent = \`${'${count[1]}'} 張\`;\n  });\n\n  form.querySelectorAll<HTMLElement>('[data-upload-cover-library="1"] div').forEach(div => {\n    const text = normalizeText(div.textContent);\n    if (text === '正在讀取 R2 cover/ 圖庫…') div.textContent = '讀取中…';\n    if (text.includes('R2 cover/ 目前沒有可選照片')) div.textContent = '尚無照片';\n  });`,
`  // R2 cover library text belongs to React. Never rewrite its text nodes here:\n  // selecting a cover or refreshing the list causes React reconciliation, and\n  // external textContent mutations can invalidate those nodes and blank the modal.`,
'cover library text mutation removal');

policy = replaceOnce(policy,
`      const clean = normalizeText(label.textContent).replace(/^✓\\s*/, '');\n      if (label.textContent !== clean) label.textContent = clean;\n\n      label.style.whiteSpace = 'nowrap';`,
`      // Style only. Do not mutate React-owned label.textContent.\n      label.style.whiteSpace = 'nowrap';`,
'cover name mutation removal');

policy = replaceOnce(policy,
`  const cover = directChildren.find(child => directLabelText(child).startsWith('主講者封面照片'));`,
`  const cover = directChildren.find(child => child.dataset.uploadCoverSection === '1' || directLabelText(child).startsWith('主講者封面照片'));`,
'cover section lookup');
policy = replaceOnce(policy,
`    const coverLabel = coverChildren.find(child => child.tagName === 'LABEL');\n    const coverSelected = coverChildren.find(child => child !== coverLabel && child.classList.contains('flex'));\n    const coverLibrary = coverChildren.find(child => normalizeText(child.textContent).includes('R2 已有演講者照片'));`,
`    const coverLabel = coverChildren.find(child => child.dataset.uploadCoverLabel === '1' || child.tagName === 'LABEL');\n    const coverSelected = coverChildren.find(child => child.dataset.uploadCoverSelected === '1' || (child !== coverLabel && child.classList.contains('flex')));\n    const coverLibrary = coverChildren.find(child => child.dataset.uploadCoverLibrary === '1' || normalizeText(child.textContent).includes('R2 已有演講者照片'));`,
'cover child lookups');

policy = replaceOnce(policy,
`  const relevant = mutations.some(mutation =>\n    mutation.type === 'childList' ||\n    (mutation.type === 'characterData' && mutation.target.parentElement?.closest('#track-upload-form'))\n  );`,
`  // React changes selected-cover text and loading/count text frequently. Watching\n  // characterData here used to create a DOM tug-of-war with React. Layout only\n  // needs to react when elements are added/removed.\n  const relevant = mutations.some(mutation => mutation.type === 'childList');`,
'observer relevance');
policy = replaceOnce(policy,
`uploadPresentationObserver.observe(document.documentElement, {\n  childList: true,\n  subtree: true,\n  characterData: true\n});`,
`uploadPresentationObserver.observe(document.documentElement, {\n  childList: true,\n  subtree: true\n});`,
'observer options');
fs.writeFileSync(policyPath, policy);

const workerPath = 'worker/index.ts';
let worker = fs.readFileSync(workerPath, 'utf8');
const coversAnchor = "    if (path === '/api/r2/covers' && method === 'GET') {";
worker = replaceAfterAnchor(worker, coversAnchor,
`      try {\n        const listed = await env.R2_BUCKET.list({ prefix: 'cover/', limit: 1000 });`,
`      try {\n        const forceRefresh = url.searchParams.has('refresh');\n        const listed = await env.R2_BUCKET.list({ prefix: 'cover/', limit: 1000 });`,
'force refresh flag');
worker = replaceAfterAnchor(worker, coversAnchor,
`            'Cache-Control': 'public, max-age=300'`,
`            'Cache-Control': forceRefresh ? 'no-store' : 'public, max-age=300'`,
'force refresh cache control');
fs.writeFileSync(workerPath, worker);

const swPath = 'public/sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceOnce(sw, "const CACHE_NAME = 'echostars-shell-v94';", "const CACHE_NAME = 'echostars-shell-v95';", 'sw cache v95');
fs.writeFileSync(swPath, sw);

const releasePath = 'tests/releaseIntegrity.test.ts';
let release = fs.readFileSync(releasePath, 'utf8');
release = replaceOnce(release,
  "test('v94 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v94'/);",
  "test('v95 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v95'/);",
  'release cache v95');
fs.writeFileSync(releasePath, release);

const changelogPath = 'src/changelogReleaseNotes.ts';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const changelogAnchor = "    '音檔播放與真正離線儲存重新分流：拖曳時間軸造成的短暫緩衝不再反覆蓋住整頁；完整音檔仍會實際寫入瀏覽器 Cache Storage，成功寫入並驗證後才算離線保存。背景下載延後並降低優先級、同時只下載一個音檔，減少和播放搶網路；聽完後不再立刻刪除，改為 15 天未使用才清理，並在瀏覽器支援時申請持久儲存。',";
changelog = replaceOnce(changelog, changelogAnchor,
`${changelogAnchor}\n    '上傳／編輯音檔的 R2 封面圖庫修正：點選既有縮圖不再因舊版 DOM 外掛和 React 重繪衝突而白屏；封面圖庫文字改回由 React 自己管理。R2「重新整理」會明確使用 no-store 重新列出 cover/，可同步 R2 新增或刪除的照片。',`,
'changelog cover fix');
fs.writeFileSync(changelogPath, changelog);

const testPath = 'tests/uploadCoverLibraryBehavior.test.ts';
const test = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nconst upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');\nconst policy = readFileSync(new URL('../src/uploadModalPresentationPolicy.ts', import.meta.url), 'utf8');\nconst worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');\n\ntest('cover library is marked in React and manual refresh bypasses caches', () => {\n  assert.match(upload, /data-upload-cover-library="1"/);\n  assert.match(upload, /data-upload-cover-section="1"/);\n  assert.match(upload, /refresh=\\$\\{Date\\.now\\(\\)\\}/);\n  assert.match(upload, /cache: 'no-store'/);\n});\n\ntest('upload presentation policy never rewrites React-owned R2 cover text', () => {\n  const fitStart = policy.indexOf('function fitCoverLibraryNames');\n  const fitEnd = policy.indexOf('function updateKeywordCandidates', fitStart);\n  const fitSection = policy.slice(fitStart, fitEnd);\n  assert.doesNotMatch(fitSection, /label\\.textContent\\s*=/);\n\n  const hideStart = policy.indexOf('function hideExplanatoryNotes');\n  const hideEnd = policy.indexOf('function fitCoverLibraryNames', hideStart);\n  const hideSection = policy.slice(hideStart, hideEnd);\n  assert.doesNotMatch(hideSection, /\\[data-upload-cover-library="1"\\][\\s\\S]*textContent\\s*=/);\n});\n\ntest('upload presentation observer does not watch characterData changes', () => {\n  const observerStart = policy.indexOf('const uploadPresentationObserver');\n  const observerSection = policy.slice(observerStart);\n  assert.match(observerSection, /mutation\\.type === 'childList'/);\n  assert.doesNotMatch(observerSection, /characterData:\\s*true/);\n});\n\ntest('R2 cover force refresh is explicitly no-store on the worker response', () => {\n  assert.match(worker, /const forceRefresh = url\\.searchParams\\.has\\('refresh'\\)/);\n  assert.match(worker, /'Cache-Control': forceRefresh \\? 'no-store' : 'public, max-age=300'/);\n});\n`;
fs.writeFileSync(testPath, test);

// Remove one-shot tooling so final PR contains only production files and tests.
fs.rmSync('.github/scripts/apply-cover-library-fix-v95.mjs', { force: true });
fs.rmSync('.github/workflows/apply-cover-library-fix-v95.yml', { force: true });
