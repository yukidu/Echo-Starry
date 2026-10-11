import './v178CrownDiagonalReflection.css';

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
  summary: '調整皇冠大使頭像反光方向與名片文字大小。',
  added: [],
  modified: [
    '頭像外圈反光改成約 45 度的多道淡淡斜向亮帶，不再呈現 360 度旋轉感。',
    '放大皇冠大使名片內的姓名與文字內容，提升手機閱讀性。'
  ],
  removed: ['移除頭像外圈持續繞圈的反光旋轉效果。']
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
