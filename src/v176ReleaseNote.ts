type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V176_RELEASE: ChangelogEntry = {
  version: 'v176',
  date: '2026/10/11',
  isLatest: true,
  summary: '皇冠大使成功故事改為繁星回聲站內閱讀，不再開啟新的瀏覽器分頁。',
  added: [
    '點選皇冠大使後，在目前皇冠頁直接顯示安麗官方成功故事，並提供返回皇冠清單、上一位、下一位切換。'
  ],
  modified: [
    '故事閱讀期間保留原本置頂主選單、漢堡選單、字體設定與浮動播放器；清單與故事之間切換不重新載入繁星回聲。',
    '故事頁沿用目前網站主題框架，切換人物時只更新故事內容，不重建播放器。'
  ],
  removed: ['移除皇冠大使卡片開啟新分頁的使用方式。']
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V176_RELEASE_PATCH__?: boolean;
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

function mergeV176(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V176_RELEASE,
    ...list
      .filter(item => item.version !== V176_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V176_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V176_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV176(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV176([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
