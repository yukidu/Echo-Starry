type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V187_RELEASE: ChangelogEntry = {
  version: 'v187',
  date: '2026/10/12',
  isLatest: true,
  summary: '音檔上傳與編輯支援多位演講者，一部音檔最多可設定 5 位，前台統一以「&」連接姓名。',
  added: [
    '上傳／編輯音檔的演講人姓名旁新增「＋ 增加共同演講者」，最多可增加 4 位共同演講者，加上主要演講者共 5 位。',
    '新增獨立的演講者關聯資料，會依順序保存主要演講者與共同演講者。'
  ],
  modified: [
    '兩位以上演講者在前台統一顯示成「姓名&姓名」，& 前後不留空格。',
    '既有音檔如果姓名原本使用 & 或全形 ＆ 連接，系統會安全拆成個別演講者並保存，同時保留舊欄位相容性。',
    '多人演講者直接整合進原本 React 上傳／編輯表單，不再使用舊版外掛式 DOM 監看做法，避免造成上傳或編輯卡住。'
  ],
  removed: []
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V187_RELEASE_PATCH__?: boolean;
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

function mergeV187(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V187_RELEASE,
    ...list
      .filter(item => item.version !== V187_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V187_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V187_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV187(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV187([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
