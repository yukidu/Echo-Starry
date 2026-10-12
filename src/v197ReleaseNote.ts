type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V197_RELEASE: ChangelogEntry = {
  version: 'v197',
  date: '2026/10/13',
  isLatest: true,
  summary: '再次修正音檔詳細頁獎章光點錯位：不再只抓高透明度的上蓋，而是比較多組透明度門檻，選出完整獎章輪廓，並把光點座標直接對齊獎章實際顯示範圍。',
  added: [
    '輪廓辨識會比較多組 alpha 門檻與整體高度，不再採用第一個找到的高 alpha 區塊。',
    '輪廓層會依 object-fit: contain 的實際 painted content box 計算位置與尺寸，避免光點整體上移或比例錯位。'
  ],
  modified: [
    '獎章若由主體、上蓋或皇冠尖角等相鄰區塊組成，會合併相鄰區塊後再追蹤最外輪廓。',
    '跨來源 SVG 備援降低 alpha 門檻並同樣鎖定獎章實際顯示範圍。',
    '手機與桌面尺寸改變時會重新校正光點層位置。'
  ],
  removed: [
    '移除 v196「第一個高 alpha 連通區可用就直接採用」造成只繞著 Amway 上蓋或局部圖形發光的判斷方式。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V197_RELEASE_PATCH__?: boolean;
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

function mergeV197(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V197_RELEASE,
    ...list
      .filter(item => item.version !== V197_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V197_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V197_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV197(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV197([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}

// Production deployment trigger only; no runtime behavior change.
