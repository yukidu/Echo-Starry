type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V199_RELEASE: ChangelogEntry = {
  version: 'v199',
  date: '2026/10/13',
  isLatest: true,
  summary: '再次調整音檔詳細頁獎章光點：每一顆改用真正獨立的動畫時間軸，連暗多久、變亮多久、亮多久與變暗多久都各自不同，避免整圈同步亮滅。',
  added: [
    '每顆獎章光點使用獨立 Web Animations 時間軸，不再共用同一組 CSS keyframes 相位。',
    '每顆光點分別擁有不同的暗部停留、上升、亮部停留、下降時間與總週期。'
  ],
  modified: [
    '保留 v198 的 23 顆光點與 v197 已修正的輪廓位置，只重做亮滅時間控制。',
    '每顆光點使用不同負延遲與相位，重新整理後也不會從同一亮度狀態一起起跑。'
  ],
  removed: [
    '移除僅靠共用 CSS 動畫加不同 duration / delay，仍可能產生同步呼吸感的做法。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V199_RELEASE_PATCH__?: boolean;
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

function mergeV199(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V199_RELEASE,
    ...list
      .filter(item => item.version !== V199_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V199_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V199_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV199(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV199([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
