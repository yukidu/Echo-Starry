type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V193_RELEASE: ChangelogEntry = {
  version: 'v193',
  date: '2026/10/12',
  isLatest: true,
  summary: '調整獎銜獎章的位置與閃耀效果，並在首頁播放清單封面右上角加入小型獎章。',
  added: [
    '首頁播放清單的封面右上角新增非常小的講師獎銜獎章，保持清楚但不搶畫面，且不使用動畫特效。'
  ],
  modified: [
    '音檔詳細介紹頁的獎章改為靠上對齊，並稍微往照片靠近，讓卡片右側保留一點間距。',
    '詳細頁獎章周圍增加更多星星；星星只在原地明暗閃耀，不位移、不旋轉。',
    'Preview 環境只針對獎章圖片使用正式站的唯讀圖片網址，方便檢查獎章視覺，不開放 Preview 寫入正式 R2。'
  ],
  removed: []
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V193_RELEASE_PATCH__?: boolean;
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

function mergeV193(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V193_RELEASE,
    ...list
      .filter(item => item.version !== V193_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V193_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V193_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV193(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV193([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
