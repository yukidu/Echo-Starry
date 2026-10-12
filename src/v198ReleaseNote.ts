type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V198_RELEASE: ChangelogEntry = {
  version: 'v198',
  date: '2026/10/13',
  isLatest: true,
  summary: '調整音檔詳細頁獎章輪廓光點：數量減半，並讓每一顆光點使用不同的亮滅週期與起始時間，不再整圈一起亮、一起暗。',
  added: [
    '每一顆獎章光點都有獨立且不重複的亮滅週期。',
    '每一顆光點使用不同負延遲、亮度上下限、大小與縮放幅度，讓閃爍更自然。'
  ],
  modified: [
    '正式輪廓光點由 46 顆減為 23 顆，保留沿獎章實際外輪廓的平均分布。',
    '跨來源 SVG 備援的光點密度同步減半。'
  ],
  removed: [
    '移除光點重複套用少數固定節奏所產生的同步呼吸感。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V198_RELEASE_PATCH__?: boolean;
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

function mergeV198(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V198_RELEASE,
    ...list
      .filter(item => item.version !== V198_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V198_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V198_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV198(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV198([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}

// v198 production deploy trigger: no runtime behavior change.
