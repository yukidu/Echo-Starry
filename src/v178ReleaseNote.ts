type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V178_RELEASE: ChangelogEntry = {
  version: 'v178',
  date: '2026/10/11',
  isLatest: true,
  summary: '固定保存淺色調色盤主色，並強化 PWA 新版本自動更新，讓預覽與正式站更容易一致驗證。',
  added: [
    '首次進入使用固定預設主色；之後使用者切換的新主色會保存在本機，下次開啟維持相同顏色。',
    'Service Worker 每次正常載入都會直接檢查最新版本，不再依賴舊 HTTP 快取。'
  ],
  modified: [
    'PWA 快取版本更新為 v178；偵測到舊版 app shell 時會自動清除舊快取並只刷新既有頁籤一次。',
    '皇冠大使 v177 同色系光圈會穩定跟隨已保存的目前主色，不再因重新整理隨機換色。'
  ],
  removed: ['移除每次重新載入網頁就重新隨機抽取淺色主色的行為。']
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V178_RELEASE_PATCH__?: boolean;
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

function mergeV178(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V178_RELEASE,
    ...list
      .filter(item => item.version !== V178_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V178_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V178_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV178(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV178([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
