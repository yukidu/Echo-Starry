type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V195_RELEASE: ChangelogEntry = {
  version: 'v195',
  date: '2026/10/12',
  isLatest: true,
  summary: '調整音檔詳細頁獎章特效：沿透明獎章本身的外輪廓加入皇冠大使同款圓形光點閃爍。',
  added: [
    '獎章透明 PNG 會依照實際不透明圖案外緣取樣，將圓形光點分布在圖案輪廓旁。',
    '圓形光點沿用皇冠大使頁面獨立明暗與縮放的閃耀節奏，並提高光點密度。'
  ],
  modified: [
    '音檔詳細介紹頁仍保留獎章靠上對齊與點擊精確獎銜篩選。',
    'Preview 無法讀取跨來源圖片像素時，會使用透明圖 alpha 外框的 SVG 備援方式。'
  ],
  removed: [
    '不恢復先前的星形閃耀符號，也不增加圓形邊框。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V195_RELEASE_PATCH__?: boolean;
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

function mergeV195(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V195_RELEASE,
    ...list
      .filter(item => item.version !== V195_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V195_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V195_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV195(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV195([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
