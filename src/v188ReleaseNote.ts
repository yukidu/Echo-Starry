type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V188_RELEASE: ChangelogEntry = {
  version: 'v188',
  date: '2026/10/12',
  isLatest: true,
  summary: '修正手機版瀏覽權限下拉選單與可見性勾選功能互相重疊，並強化「只對有權限者顯示」的永久保存。',
  added: [
    '「只對有權限者顯示」增加獨立 D1 欄位永久保存，舊版隱藏資料會自動相容回填。'
  ],
  modified: [
    '「瀏覽權限」固定為獨立一列，下方再依序顯示「訪客可見」與「只對有權限者顯示（從首頁隱藏）」，不再與下拉選單共用點擊區域。',
    '兩個可見性勾選功能改為直向排列並限制 checkbox 尺寸，手機放大字體時也不會擠進下拉選單。',
    '勾選「只對有權限者顯示」後會同步關閉訪客可見；重新進入編輯頁仍保留勾選狀態。',
    '首頁仍依「是否登入＋是否達到瀏覽權限」判斷限制音檔資訊卡是否顯示。'
  ],
  removed: []
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V188_RELEASE_PATCH__?: boolean;
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

function mergeV188(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V188_RELEASE,
    ...list
      .filter(item => item.version !== V188_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V188_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V188_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV188(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV188([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
