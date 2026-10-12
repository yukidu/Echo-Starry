type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V200_RELEASE: ChangelogEntry = {
  version: 'v200',
  date: '2026/10/13',
  isLatest: true,
  summary: '再次調整音檔詳細頁獎章輪廓光點：尺寸放大 50%、總數再減少約一半，並改用更強的真實亂數產生每顆獨立亮滅節奏。',
  added: [
    '每顆光點改用瀏覽器加密亂數來源產生週期、相位、亮暗停留與縮放節奏。',
    '每顆光點的總亮滅週期會避開彼此過近的數值，降低視覺同步感。'
  ],
  modified: [
    '正式輪廓光點由 23 顆調整為 12 顆，接近再減半。',
    '每顆光點尺寸在原有範圍基礎上放大 50%。',
    '亮度、縮放、起始延遲、暗部停留、變亮、亮部停留與變暗時間全部改為更大幅度的獨立亂數。'
  ],
  removed: [
    '移除 v199 以固定索引推導動畫節奏的主要做法，避免長時間觀看仍出現規律感。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V200_RELEASE_PATCH__?: boolean;
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

function mergeV200(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V200_RELEASE,
    ...list
      .filter(item => item.version !== V200_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V200_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V200_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV200(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV200([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
