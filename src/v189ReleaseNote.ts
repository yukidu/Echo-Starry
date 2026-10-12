type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V189_RELEASE: ChangelogEntry = {
  version: 'v189',
  date: '2026/10/12',
  isLatest: true,
  summary: '浮動播放器播放中改點其他音檔時，會先詢問是否確定切換，避免誤觸中斷目前收聽。',
  added: [
    '目前音檔正在播放時，點選另一部音檔的播放鍵會先顯示「取消／確定」確認視窗。'
  ],
  modified: [
    '切換播放確認視窗沿用「不喜歡」確認視窗的文字大小、警示圖示、色彩、圓角與置中大型按鈕樣式。',
    '選擇「取消」會保持原音檔繼續播放；選擇「確定」才會切換到新音檔。',
    '目前沒有播放中，或操作的是同一部音檔時，不額外顯示確認視窗。'
  ],
  removed: []
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V189_RELEASE_PATCH__?: boolean;
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

function mergeV189(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V189_RELEASE,
    ...list
      .filter(item => item.version !== V189_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V189_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V189_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV189(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV189([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
