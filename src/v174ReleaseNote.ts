type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V174_RELEASE: ChangelogEntry = {
  version: 'v174',
  date: '2026/10/11',
  isLatest: true,
  summary: '臺灣皇冠大使改為真正的站內頁面流，不再以固定覆蓋視窗蓋在首頁上方。',
  added: [],
  modified: [
    '開啟皇冠大使時，原首頁主內容停止顯示與版面繪製，皇冠內容改在共用導覽列下方正常往下捲動。',
    '淺色與深色主題都由皇冠頁本身完整承接背景，不再透出首頁音檔卡片、搜尋列或篩選列。',
    '保留置頂導覽列、漢堡選單、字體設定與浮動播放器；返回播放清單時恢復原本捲動位置。'
  ],
  removed: ['移除皇冠大使以 fixed 全螢幕覆蓋層參與畫面繪製的呈現方式。']
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V174_RELEASE_PATCH__?: boolean;
};

function isChangelogGet(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return false;
  try {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/api/changelog';
  } catch {
    return false;
  }
}

function mergeV174(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V174_RELEASE,
    ...list
      .filter(item => item.version !== V174_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V174_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V174_RELEASE_PATCH__ = true;
  const previousFetch = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    if (!isChangelogGet(input, init)) return previousFetch(...args);
    try {
      const response = await previousFetch(...args);
      const data = response.ok ? await response.clone().json().catch(() => []) : [];
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.delete('Content-Length');
      headers.delete('Content-Encoding');
      return new Response(JSON.stringify(mergeV174(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV174([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
