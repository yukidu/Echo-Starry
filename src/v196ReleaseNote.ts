type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V196_RELEASE: ChangelogEntry = {
  version: 'v196',
  date: '2026/10/12',
  isLatest: true,
  summary: '修正音檔詳細頁獎章光點誤沿圖片矩形邊界排列，改為辨識獎章本體輪廓後再分布光點。',
  added: [
    '先以較高透明度門檻辨識主要獎章圖案，並排除圖片四周的淡光暈、殘留像素與矩形邊界干擾。',
    '輪廓取樣保留原始圖片長寬比例，跨來源圖片則會再以 Blob 方式重新讀取輪廓。'
  ],
  modified: [
    '光點改為沿獎章輪廓等距分布並降低密度，避免頂部擠成一條 LED 燈帶。',
    'Canvas 無法取樣時的 SVG 備援也提高透明度門檻並先去除細小外圍雜訊，再產生輪廓光點。'
  ],
  removed: [
    '移除容易把透明 PNG 外圍淡光暈誤認成矩形外框的低門檻輪廓取樣方式。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V196_RELEASE_PATCH__?: boolean;
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

function mergeV196(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V196_RELEASE,
    ...list
      .filter(item => item.version !== V196_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V196_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V196_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV196(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV196([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}

// v196 Production 重新觸發 checkpoint：無功能行為變更。
