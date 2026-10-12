type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V194_RELEASE: ChangelogEntry = {
  version: 'v194',
  date: '2026/10/12',
  isLatest: true,
  summary: '簡化獎銜獎章顯示：首頁不再顯示小獎章，詳細頁保留獎章本體並移除周圍特效。',
  added: [],
  modified: [
    '音檔詳細介紹頁保留獎章靠上對齊與點擊精確等級篩選功能。',
    'Preview 環境仍可使用正式站唯讀獎章圖片網址檢查視覺。'
  ],
  removed: [
    '移除首頁播放清單封面右上角的小型獎章。',
    '移除詳細頁獎章周圍的全部星星閃耀效果，獎章本體保持簡潔，不新增其他環繞動畫。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V194_RELEASE_PATCH__?: boolean;
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

function mergeV194(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V194_RELEASE,
    ...list
      .filter(item => item.version !== V194_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V194_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V194_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV194(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV194([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
