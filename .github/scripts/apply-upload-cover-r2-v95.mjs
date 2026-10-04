import fs from 'node:fs';

function replaceOnce(source, from, to, label) {
  if (!source.includes(from)) throw new Error(`missing pattern: ${label}`);
  const next = source.replace(from, to);
  if (next === source) throw new Error(`replace failed: ${label}`);
  return next;
}

const uploadPath = 'src/components/UploadModal.tsx';
let upload = fs.readFileSync(uploadPath, 'utf8');

upload = replaceOnce(upload,
`  const loadCoverLibrary = async (force = false) => {
    // Cloudflare-saving strategy:
    // - First open in a browser session: fetch R2 once.
    // - Later opens: reuse sessionStorage without a timed re-list.
    // - Manual refresh: do one fresh R2 ListObjects request.
    // - Successful uploads update this cache locally, so no extra R2 list is needed.
    if (!force && typeof sessionStorage !== 'undefined') {
      try {
        const cached = JSON.parse(sessionStorage.getItem(COVER_LIBRARY_CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.covers)) {
          setCoverLibrary(cached.covers);
          return;
        }
      } catch {}
    }

    setIsCoverLibraryLoading(true);
    try {
      const url = force
        ? \`/api/r2/covers?refresh=\${Date.now()}\`
        : '/api/r2/covers';
      const res = await fetch(url, force ? { cache: 'no-store' } : undefined);
      if (!res.ok) {
        if (force) setErrorMessage('封面圖庫重新整理失敗，請稍後再試。');
        return;
      }
      const data = await res.json();
      const covers = Array.isArray(data?.covers) ? data.covers : [];
      setCoverLibrary(covers);
      saveCoverLibraryCache(covers);
      if (force) setErrorMessage(null);
    } catch {
      if (force) setErrorMessage('封面圖庫重新整理失敗，請檢查網路連線。');
      // R2 cover library is optional; manual upload remains available.
    } finally {
      setIsCoverLibraryLoading(false);
    }
  };`,
`  const loadCoverLibrary = async (force = false) => {
    // First open reuses a session cache to save R2 list requests. Manual refresh is
    // different: it must always ask the Worker/R2 again and replace the local list.
    if (!force && typeof sessionStorage !== 'undefined') {
      try {
        const cached = JSON.parse(sessionStorage.getItem(COVER_LIBRARY_CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.covers)) {
          setCoverLibrary(cached.covers);
          return;
        }
      } catch {}
    }

    if (force && typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem(COVER_LIBRARY_CACHE_KEY); } catch {}
    }

    setIsCoverLibraryLoading(true);
    try {
      const requestUrl = force
        ? \`/api/r2/covers?refresh=\${Date.now()}\`
        : '/api/r2/covers';
      const res = await fetch(requestUrl, force ? {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      } : { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        if (force) setErrorMessage('R2 照片同步失敗，請稍後再試。');
        return;
      }
      const data = await res.json();
      const covers = (Array.isArray(data?.covers) ? data.covers : [])
        .map((item: any): CoverLibraryItem | null => {
          const key = typeof item?.key === 'string' ? item.key.trim() : '';
          const url = typeof item?.url === 'string' ? item.url.trim() : '';
          if (!key || !url) return null;
          return {
            key,
            url,
            name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : '未命名講者',
            size: typeof item?.size === 'number' ? item.size : undefined,
            uploaded: typeof item?.uploaded === 'string' ? item.uploaded : null
          };
        })
        .filter((item: CoverLibraryItem | null): item is CoverLibraryItem => item !== null);
      setCoverLibrary(covers);
      saveCoverLibraryCache(covers);
      if (force) setErrorMessage(null);
    } catch {
      if (force) setErrorMessage('R2 照片同步失敗，請檢查網路連線。');
    } finally {
      setIsCoverLibraryLoading(false);
    }
  };`,
'cover library loading');

upload = replaceOnce(upload,
`  const handleSelectCoverFromLibrary = (item: CoverLibraryItem) => {
    setErrorMessage(null);
    setCoverFile(null);
    setCoverPreview(item.url);
    if (!speaker.trim()) setSpeaker(item.name);
  };`,
`  const handleSelectCoverFromLibrary = (item: CoverLibraryItem) => {
    const nextUrl = typeof item?.url === 'string' ? item.url.trim() : '';
    if (!nextUrl) {
      setErrorMessage('這張 R2 封面已失效，請按「同步 R2」重新整理照片清單。');
      return;
    }
    setErrorMessage(null);
    setCoverFile(null);
    setCoverPreview(nextUrl);
    const nextName = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!speaker.trim() && nextName) setSpeaker(nextName);
  };`,
'cover selection guard');

upload = replaceOnce(upload,
`                    {isCoverLibraryLoading ? '讀取中…' : \`\${coverLibrary.length} 張・點照片可快速套用\`}`,
`                    {isCoverLibraryLoading ? '同步中…' : \`\${coverLibrary.length} 張\`}`,
'cover count label');

upload = replaceOnce(upload,
`                    title="重新讀取 R2 cover/，同步已新增或已刪除的封面"`,
`                    title="直接重新讀取 R2 cover/，同步已新增或已刪除的封面"`,
'refresh title');

upload = replaceOnce(upload,
`                    重新整理`,
`                    同步 R2`,
'refresh label');

fs.writeFileSync(uploadPath, upload);

const policyPath = 'src/uploadModalPresentationPolicy.ts';
let policy = fs.readFileSync(policyPath, 'utf8');

policy = replaceOnce(policy,
`  form.querySelectorAll<HTMLElement>('[data-upload-cover-library="1"] span').forEach(span => {
    if (span.closest('button')) return;
    const text = normalizeText(span.textContent);
    const count = text.match(/(\\d+)\\s*張/);
    if (count && text.includes('點照片可快速套用')) span.textContent = \`\${count[1]} 張\`;
  });

  form.querySelectorAll<HTMLElement>('[data-upload-cover-library="1"] div').forEach(div => {
    const text = normalizeText(div.textContent);
    if (text === '正在讀取 R2 cover/ 圖庫…') div.textContent = '讀取中…';
    if (text.includes('R2 cover/ 目前沒有可選照片')) div.textContent = '尚無照片';
  });
`,
`  // IMPORTANT: never rewrite text nodes inside the React-owned R2 cover library.
  // Selecting a thumbnail or refreshing the list causes React reconciliation; direct
  // textContent mutations here used to corrupt that subtree and could blank the modal.
`,
'cover library text mutations');

const fitStart = `function fitCoverLibraryNames(coverLibrary: HTMLElement) {`;
const fitEnd = `\nfunction updateKeywordCandidates(keywordSection: HTMLElement) {`;
const startIndex = policy.indexOf(fitStart);
const endIndex = policy.indexOf(fitEnd, startIndex);
if (startIndex < 0 || endIndex < 0) throw new Error('missing pattern: fit cover library function');
policy = policy.slice(0, startIndex) + `function updateKeywordCandidates(keywordSection: HTMLElement) {` + policy.slice(endIndex + fitEnd.length);

policy = replaceOnce(policy,
`    if (coverLibrary) {
      coverLibrary.dataset.uploadCoverLibrary = '1';
      fitCoverLibraryNames(coverLibrary);
    }`,
`    if (coverLibrary) {
      // Mark for CSS/layout only. Do not mutate its React-owned child text/content.
      coverLibrary.dataset.uploadCoverLibrary = '1';
    }`,
'cover library marker');

fs.writeFileSync(policyPath, policy);

const workerPath = 'worker/index.ts';
let worker = fs.readFileSync(workerPath, 'utf8');
worker = replaceOnce(worker,
`    if (path === '/api/r2/covers' && method === 'GET') {
      if (!env.R2_BUCKET) {`,
`    if (path === '/api/r2/covers' && method === 'GET') {
      const forceCoverRefresh = url.searchParams.has('refresh');
      if (!env.R2_BUCKET) {`,
'r2 refresh flag');
worker = replaceOnce(worker,
`            'Cache-Control': 'public, max-age=300'`,
`            'Cache-Control': forceCoverRefresh ? 'no-store, max-age=0' : 'private, max-age=60'`,
'r2 cover cache control');
fs.writeFileSync(workerPath, worker);

const swPath = 'public/sw.js';
let sw = fs.readFileSync(swPath, 'utf8');
sw = replaceOnce(sw, "const CACHE_NAME = 'echostars-shell-v94';", "const CACHE_NAME = 'echostars-shell-v95';", 'sw cache');
fs.writeFileSync(swPath, sw);

const releasePath = 'tests/releaseIntegrity.test.ts';
let release = fs.readFileSync(releasePath, 'utf8');
release = replaceOnce(release,
"test('v94 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v94'/);",
"test('v95 is the single current PWA cache version', () => {\n  assert.match(sw, /const CACHE_NAME = 'echostars-shell-v95'/);",
'release cache');
fs.writeFileSync(releasePath, release);

const presentationTestPath = 'tests/uploadModalPresentationPolicy.test.ts';
let presentationTest = fs.readFileSync(presentationTestPath, 'utf8');
presentationTest = replaceOnce(presentationTest,
`test('R2 cover names stay complete and shrink to fit', () => {
  assert.match(policy, /fitCoverLibraryNames/);
  assert.match(policy, /while \\(label\\.clientWidth > 0 && label\\.scrollWidth > label\\.clientWidth && size > 6\\)/);
  assert.match(policy, /label\\.style\\.whiteSpace = 'normal'/);
  assert.match(policy, /label\\.style\\.wordBreak = 'break-all'/);
  assert.doesNotMatch(policy, /button\\[title\\^="使用 "\\] span:last-child[^}]*text-overflow:\\s*ellipsis/);
});`,
`test('R2 cover library stays React-owned and presentation policy never rewrites its text', () => {
  assert.doesNotMatch(policy, /fitCoverLibraryNames/);
  assert.match(policy, /Do not mutate its React-owned child text\/content/);
  assert.doesNotMatch(policy, /點照片可快速套用[\\s\\S]{0,180}textContent/);
  assert.doesNotMatch(policy, /正在讀取 R2 cover\/ 圖庫[\\s\\S]{0,180}textContent/);
  assert.doesNotMatch(policy, /button\\[title\\^="使用 "\\] span:last-child[^}]*text-overflow:\\s*ellipsis/);
});`,
'presentation cover test');
fs.writeFileSync(presentationTestPath, presentationTest);

const stabilityTest = `import test from 'node:test';\nimport assert from 'node:assert/strict';\nimport { readFileSync } from 'node:fs';\n\nconst upload = readFileSync(new URL('../src/components/UploadModal.tsx', import.meta.url), 'utf8');\nconst worker = readFileSync(new URL('../worker/index.ts', import.meta.url), 'utf8');\n\ntest('R2 thumbnail selection is guarded and does not depend on stale malformed URLs', () => {\n  assert.match(upload, /const nextUrl = typeof item\\?\\.url === 'string'/);\n  assert.match(upload, /這張 R2 封面已失效/);\n  assert.match(upload, /setCoverPreview\\(nextUrl\\)/);\n});\n\ntest('manual R2 sync bypasses session and HTTP caches and replaces the local library', () => {\n  assert.match(upload, /sessionStorage\\.removeItem\\(COVER_LIBRARY_CACHE_KEY\\)/);\n  assert.match(upload, /cache: 'no-store'/);\n  assert.match(upload, /'Cache-Control': 'no-cache'/);\n  assert.match(upload, /同步 R2/);\n  assert.match(worker, /const forceCoverRefresh = url\\.searchParams\\.has\\('refresh'\\)/);\n  assert.match(worker, /forceCoverRefresh \\? 'no-store, max-age=0' : 'private, max-age=60'/);\n});\n`;
fs.writeFileSync('tests/uploadCoverLibraryStability.test.ts', stabilityTest);

const changelogPath = 'src/changelogReleaseNotes.ts';
let changelog = fs.readFileSync(changelogPath, 'utf8');
const anchor = "    '音檔播放與真正離線儲存重新分流：拖曳時間軸造成的短暫緩衝不再反覆蓋住整頁；完整音檔仍會實際寫入瀏覽器 Cache Storage，成功寫入並驗證後才算離線保存。背景下載延後並降低優先級、同時只下載一個音檔，減少和播放搶網路；聽完後不再立刻刪除，改為 15 天未使用才清理，並在瀏覽器支援時申請持久儲存。',";
changelog = replaceOnce(changelog, anchor, `${anchor}\n    '上傳／編輯音檔的 R2 封面圖庫修復：點選既有封面不再因畫面腳本與 React 同時改動而白屏；「同步 R2」會強制重新讀取雲端封面清單並更新本機暫存，R2 已刪除的照片也會從清單移除。',`, 'changelog note');
fs.writeFileSync(changelogPath, changelog);

fs.rmSync('.github/scripts/apply-upload-cover-r2-v95.mjs', { force: true });
fs.rmSync('.github/workflows/apply-upload-cover-r2-v95.yml', { force: true });
