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
    '手機版「權限獎銜／瀏覽權限」下拉選單改成單獨一整列，不再和「訪客可見／只對有權限者顯示」勾選框共用同一列。',
    '下一列才顯示可見性勾選框，避免勾選框覆蓋下拉選單或攔截點擊。',
    '手機版下拉選單改由手機系統原生選單處理觸控；桌機仍維持原本自訂下拉選單。',
    '更新 PWA 快取版本，已安裝到桌面的 Preview 也會重新載入這次修正。'
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
