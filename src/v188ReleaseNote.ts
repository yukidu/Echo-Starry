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
  summary: '修正手機版上傳／編輯音檔頁面的瀏覽權限下拉選單無法操作。',
  added: [],
  modified: [
    '手機版將「瀏覽權限」與「訪客可見／只對有權限者顯示」分開排列，不再重疊到同一個位置。',
    '手機版下拉選單改由手機系統原生選單處理觸控，解決點擊「公開」等選項沒有反應的問題；桌機仍維持原本自訂下拉選單。',
    '重新安排私秘 VIP 與 R2 演講者照片區塊的手機版順序，維持原本權限與資料邏輯。'
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
